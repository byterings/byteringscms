import { Injectable } from '@nestjs/common';
import {
  fieldConfigSchemas,
  pageMeta,
  type FieldType,
  type RecordItem,
  type RecordListQuery,
} from '@byteringscms/contracts';
import { type Field, Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { type EntityWithFields, withFields } from '../metadata/metadata.mapper';
import { MediaService } from '../media/media.service';
import { buildRecordQuery } from '../records/record-query';
import { type RecordData } from '../records/record-validation';

interface RawRecord {
  id: string;
  data: RecordData;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const MAX_EXPAND = 5;

function idsOf(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Anonymous read API (ADR-025). Only entities with `publicRead`, only fields
 * marked `isPublic`, and - when the entity defines a publish field - only
 * published records are ever visible. The tenant comes from the URL slug.
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly media: MediaService,
  ) {}

  async list(tenantSlug: string, entityKey: string, query: RecordListQuery) {
    const tenantId = await this.tenantId(tenantSlug);
    return this.db.run(tenantId, async (tx) => {
      const entity = await this.publicEntity(tx, tenantId, entityKey);
      const fields = this.publicFields(entity);
      const { where, orderBy } = buildRecordQuery({
        tenantId,
        entityId: entity.id,
        fields: fields.map((f) => ({
          key: f.key,
          type: f.type as FieldType,
          config: f.config as Record<string, unknown>,
        })),
        filter: query.filter,
        sort: query.sort,
        search: query.search,
        extra: this.publishCondition(entity),
      });
      const offset = (query.page - 1) * query.pageSize;
      const rows = await tx.$queryRaw<RawRecord[]>`
        SELECT r.id, r.data, r.version, r.created_at, r.updated_at
        FROM records r WHERE ${where} ORDER BY ${orderBy}
        LIMIT ${query.pageSize} OFFSET ${offset}`;
      const [count] = await tx.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM records r WHERE ${where}`;
      const items = rows.map((row) =>
        this.toItem(entity, row, this.selection(entity, query.fields)),
      );
      await this.expand(tx, tenantId, entity, items, query.expand);
      return { data: items, meta: pageMeta(query, count?.total ?? 0) };
    });
  }

  async get(
    tenantSlug: string,
    entityKey: string,
    id: string,
    query: { fields?: string; expand?: string },
  ) {
    const tenantId = await this.tenantId(tenantSlug);
    return this.db.run(tenantId, async (tx) => {
      const entity = await this.publicEntity(tx, tenantId, entityKey);
      const row = await this.findPublished(tx, tenantId, entity, id);
      if (!row) throw AppError.notFound('Record');
      const item = this.toItem(entity, row, this.selection(entity, query.fields));
      await this.expand(tx, tenantId, entity, [item], query.expand);
      return item;
    });
  }

  /** A media file is public only if a published public record references it through a public field. */
  async openMedia(tenantSlug: string, mediaId: string) {
    const tenantId = await this.tenantId(tenantSlug);
    const referenced = await this.db.run(tenantId, async (tx) => {
      const entities = await tx.entity.findMany({
        where: { tenantId, publicRead: true },
        include: withFields,
      });
      for (const entity of entities) {
        for (const field of entity.fields.filter((f) => f.type === 'media' && f.isPublic)) {
          const conditions = [
            Prisma.sql`r.tenant_id = ${tenantId}::uuid`,
            Prisma.sql`r.entity_id = ${entity.id}::uuid`,
            Prisma.sql`r.deleted_at IS NULL`,
            Prisma.sql`(r.data ->> ${field.key}::text = ${mediaId}::text OR jsonb_exists(r.data -> ${field.key}::text, ${mediaId}::text))`,
            ...this.publishCondition(entity),
          ];
          const [hit] = await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM records r WHERE ${Prisma.join(conditions, ' AND ')}`;
          if ((hit?.n ?? 0) > 0) return true;
        }
      }
      return false;
    });
    if (!referenced) throw AppError.notFound('Media');
    return this.media.openForTenant(tenantId, mediaId);
  }

  // ---------------------------------------------------------------------------

  private async tenantId(slug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!tenant || tenant.status !== 'active') throw AppError.notFound('Tenant');
    return tenant.id;
  }

  private async publicEntity(tx: Tx, tenantId: string, key: string): Promise<EntityWithFields> {
    const entity = await tx.entity.findFirst({
      where: { tenantId, key, publicRead: true },
      include: withFields,
    });
    // Non-public entities are indistinguishable from missing ones.
    if (!entity) throw AppError.notFound('Entity');
    return entity;
  }

  private publicFields(entity: EntityWithFields): Field[] {
    return entity.fields.filter((f) => f.isPublic);
  }

  private publishCondition(entity: EntityWithFields): Prisma.Sql[] {
    if (!entity.publishField || entity.publishValue === null) return [];
    return [Prisma.sql`(r.data ->> ${entity.publishField}::text) = ${entity.publishValue}::text`];
  }

  private async findPublished(
    tx: Tx,
    tenantId: string,
    entity: EntityWithFields,
    id: string,
  ): Promise<RawRecord | null> {
    const conditions = [
      Prisma.sql`r.tenant_id = ${tenantId}::uuid`,
      Prisma.sql`r.entity_id = ${entity.id}::uuid`,
      Prisma.sql`r.id = ${id}::uuid`,
      Prisma.sql`r.deleted_at IS NULL`,
      ...this.publishCondition(entity),
    ];
    const [row] = await tx.$queryRaw<RawRecord[]>`
      SELECT r.id, r.data, r.version, r.created_at, r.updated_at
      FROM records r WHERE ${Prisma.join(conditions, ' AND ')}`;
    return row ?? null;
  }

  private selection(entity: EntityWithFields, fields?: string): Set<string> | undefined {
    if (!fields) return undefined;
    const keys = fields
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const allowed = new Set(this.publicFields(entity).map((f) => f.key));
    const unknown = keys.filter((k) => !allowed.has(k));
    if (unknown.length)
      throw AppError.badRequest('INVALID_FIELDS', `Unknown fields: ${unknown.join(', ')}`);
    return new Set(keys);
  }

  private toItem(entity: EntityWithFields, row: RawRecord, selection?: Set<string>): RecordItem {
    const data: RecordData = {};
    for (const field of this.publicFields(entity)) {
      if (selection && !selection.has(field.key)) continue;
      data[field.key] = row.data[field.key] ?? null;
    }
    return {
      id: row.id,
      entity: entity.key,
      data,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
    };
  }

  /** Expands public relation fields to public, published target records. */
  private async expand(
    tx: Tx,
    tenantId: string,
    entity: EntityWithFields,
    items: RecordItem[],
    expand?: string,
  ) {
    if (!expand) return;
    const keys = [
      ...new Set(
        expand
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    ];
    if (keys.length > MAX_EXPAND)
      throw AppError.badRequest('INVALID_EXPAND', `At most ${MAX_EXPAND} fields`);
    for (const key of keys) {
      const field = entity.fields.find((f) => f.key === key && f.type === 'relation' && f.isPublic);
      if (!field)
        throw AppError.badRequest('INVALID_EXPAND', `"${key}" is not a public relation field`);
      const { targetEntityId, cardinality } = fieldConfigSchemas.relation.parse(field.config);
      const target = await tx.entity.findFirst({
        where: { id: targetEntityId, tenantId, publicRead: true },
        include: withFields,
      });
      const ids = [...new Set(items.flatMap((item) => idsOf(item.data[key])))];
      const byId = new Map<string, RecordItem>();
      if (target && ids.length) {
        const conditions = [
          Prisma.sql`r.tenant_id = ${tenantId}::uuid`,
          Prisma.sql`r.entity_id = ${target.id}::uuid`,
          Prisma.sql`r.deleted_at IS NULL`,
          Prisma.sql`r.id::text IN (${Prisma.join(ids)})`,
          ...this.publishCondition(target),
        ];
        const rows = await tx.$queryRaw<RawRecord[]>`
          SELECT r.id, r.data, r.version, r.created_at, r.updated_at
          FROM records r WHERE ${Prisma.join(conditions, ' AND ')}`;
        for (const row of rows) byId.set(row.id, this.toItem(target, row));
      }
      for (const item of items) {
        const value = item.data[key];
        if (value === null || value === undefined) continue;
        const resolved = idsOf(value)
          .map((id) => byId.get(id))
          .filter((r): r is RecordItem => !!r);
        item.data[key] = cardinality === 'many' ? resolved : (resolved[0] ?? null);
      }
    }
  }
}
