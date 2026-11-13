import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateRecordRequest,
  type FieldType,
  pageMeta,
  type RecordGetQuery,
  type RecordItem,
  type RecordListQuery,
  roleAtLeast,
  type UpdateRecordRequest,
} from '@byteringscms/contracts';
import { type Field, type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { actorId, type TenantContext } from '../common/request-context';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { type EntityWithFields } from '../metadata/metadata.mapper';
import { MetadataService } from '../metadata/metadata.service';
import { buildRecordQuery } from './record-query';
import {
  canRead,
  mergeData,
  type RecordData,
  serializeData,
  uniqueValueKey,
  validateRecordInput,
} from './record-validation';
import { PluginsService } from '../plugins/plugins.service';
import { RelationsService } from './relations.service';

interface RawRecord {
  id: string;
  data: RecordData;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
}

interface RecordRow {
  id: string;
  data: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: Date | null;
}

function fromRaw(raw: RawRecord): RecordRow {
  return {
    id: raw.id,
    data: raw.data,
    version: raw.version,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    createdById: raw.created_by,
    updatedById: raw.updated_by,
    deletedAt: raw.deleted_at,
  };
}

/**
 * Generic record engine (Phase 3): CRUD and querying for any entity,
 * driven entirely by its metadata.
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly db: TenantDb,
    private readonly metadata: MetadataService,
    private readonly audit: AuditService,
    private readonly relations: RelationsService,
    private readonly plugins: PluginsService,
  ) {}

  list(ctx: TenantContext, entityKey: string, query: RecordListQuery) {
    return this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      const deleted = query.deleted === 'true';
      if (deleted && !roleAtLeast(ctx.role, 'admin')) {
        throw AppError.forbidden('Only admins can list deleted records');
      }
      const readable = entity.fields.filter((f) => canRead(f, ctx.role));
      const { where, orderBy } = buildRecordQuery({
        tenantId: ctx.tenantId,
        entityId: entity.id,
        fields: readable.map((f) => ({
          key: f.key,
          type: f.type as FieldType,
          config: f.config as Record<string, unknown>,
        })),
        filter: query.filter,
        sort: query.sort,
        search: query.search,
        deleted,
      });
      const offset = (query.page - 1) * query.pageSize;
      const rows = await tx.$queryRaw<RawRecord[]>`
        SELECT r.id, r.data, r.version, r.created_at, r.updated_at,
               r.created_by, r.updated_by, r.deleted_at
        FROM records r
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${query.pageSize} OFFSET ${offset}`;
      const [count] = await tx.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM records r WHERE ${where}`;
      const selection = this.selection(entity, query.fields, ctx);
      const items = rows.map((row) => this.toItem(entity, fromRaw(row), ctx, selection));
      await this.relations.expand(tx, ctx, entity, items, query.expand);
      return { data: items, meta: pageMeta(query, count?.total ?? 0) };
    });
  }

  get(ctx: TenantContext, entityKey: string, id: string, query: RecordGetQuery = {}) {
    return this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      const row = await this.findLive(tx, ctx, entity, id);
      const item = this.toItem(entity, row, ctx, this.selection(entity, query.fields, ctx));
      await this.relations.expand(tx, ctx, entity, [item], query.expand);
      return item;
    });
  }

  async create(
    ctx: TenantContext,
    entityKey: string,
    body: CreateRecordRequest,
    outerTx?: Tx,
  ): Promise<RecordItem> {
    const run = <T>(fn: (tx: Tx) => Promise<T>) =>
      outerTx ? fn(outerTx) : this.db.run(ctx.tenantId, fn);
    const result = await run(async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      this.assertWritable(entity);
      const { values, changedKeys } = validateRecordInput(entity.fields, body.data, {
        mode: 'create',
        role: ctx.role,
      });
      const plugin = await this.applyPlugins(
        tx,
        ctx,
        entity,
        'record.beforeCreate',
        mergeData({}, values),
        null,
      );
      const data = plugin.data;
      await this.relations.validateTargets(tx, ctx, entity, { ...values, ...plugin.values });
      const row = await tx.record.create({
        data: {
          tenantId: ctx.tenantId,
          entityId: entity.id,
          data: data as Prisma.InputJsonObject,
          createdById: actorId(ctx),
          updatedById: actorId(ctx),
        },
      });
      await this.syncUnique(tx, ctx, entity.fields, row.id, data);
      await this.relations.syncLinks(tx, ctx, entity, row.id, data);
      await this.audit.record(tx, ctx, {
        action: 'record.created',
        targetType: entity.key,
        targetId: row.id,
        changedKeys: [...new Set([...changedKeys, ...plugin.keys])],
      });
      return { item: this.toItem(entity, row, ctx), data };
    });
    void this.plugins.runAfter(ctx.tenantId, 'record.afterCreate', {
      tenantId: ctx.tenantId,
      entity: entityKey,
      recordId: result.item.id,
      data: result.data,
    });
    return result.item;
  }

  async update(
    ctx: TenantContext,
    entityKey: string,
    id: string,
    body: UpdateRecordRequest,
  ): Promise<RecordItem> {
    const result = await this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      this.assertWritable(entity);
      const current = await this.findLive(tx, ctx, entity, id);
      if (body.version !== undefined && body.version !== current.version) {
        throw this.versionConflict(current.version);
      }
      const { values, changedKeys } = validateRecordInput(entity.fields, body.data, {
        mode: 'update',
        role: ctx.role,
      });
      const previous = current.data as RecordData;
      const plugin = await this.applyPlugins(
        tx,
        ctx,
        entity,
        'record.beforeUpdate',
        mergeData(previous, values),
        previous,
      );
      const data = plugin.data;
      await this.relations.validateTargets(tx, ctx, entity, { ...values, ...plugin.values });
      const result = await tx.record.updateMany({
        where: { id, tenantId: ctx.tenantId, version: current.version, deletedAt: null },
        data: {
          data: data as Prisma.InputJsonObject,
          version: { increment: 1 },
          updatedById: actorId(ctx),
          updatedAt: new Date(),
        },
      });
      if (result.count === 0) throw this.versionConflict(current.version);
      await this.syncUnique(tx, ctx, entity.fields, id, data);
      await this.relations.syncLinks(tx, ctx, entity, id, data);
      await this.audit.record(tx, ctx, {
        action: 'record.updated',
        targetType: entity.key,
        targetId: id,
        changedKeys: [...new Set([...changedKeys, ...plugin.keys])],
      });
      return { item: this.toItem(entity, await this.findLive(tx, ctx, entity, id), ctx), data };
    });
    void this.plugins.runAfter(ctx.tenantId, 'record.afterUpdate', {
      tenantId: ctx.tenantId,
      entity: entityKey,
      recordId: id,
      data: result.data,
    });
    return result.item;
  }

  /** Soft delete (ADR-015). Releases unique values. */
  async remove(ctx: TenantContext, entityKey: string, id: string): Promise<void> {
    const data = await this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      this.assertWritable(entity);
      const result = await tx.record.updateMany({
        where: { id, tenantId: ctx.tenantId, entityId: entity.id, deletedAt: null },
        data: { deletedAt: new Date(), updatedById: actorId(ctx), version: { increment: 1 } },
      });
      if (result.count === 0) throw AppError.notFound('Record');
      await tx.recordUniqueValue.deleteMany({ where: { recordId: id } });
      await this.audit.record(tx, ctx, {
        action: 'record.deleted',
        targetType: entity.key,
        targetId: id,
      });
      const row = await tx.record.findUniqueOrThrow({ where: { id }, select: { data: true } });
      return row.data as RecordData;
    });
    void this.plugins.runAfter(ctx.tenantId, 'record.afterDelete', {
      tenantId: ctx.tenantId,
      entity: entityKey,
      recordId: id,
      data,
    });
  }

  restore(ctx: TenantContext, entityKey: string, id: string): Promise<RecordItem> {
    this.assertAdmin(ctx);
    return this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      this.assertWritable(entity);
      const row = await tx.record.findFirst({
        where: { id, tenantId: ctx.tenantId, entityId: entity.id, deletedAt: { not: null } },
      });
      if (!row) throw AppError.notFound('Deleted record');
      await this.syncUnique(tx, ctx, entity.fields, id, row.data as RecordData);
      const restored = await tx.record.update({
        where: { id },
        data: { deletedAt: null, updatedById: actorId(ctx), version: { increment: 1 } },
      });
      await this.audit.record(tx, ctx, {
        action: 'record.restored',
        targetType: entity.key,
        targetId: id,
      });
      return this.toItem(entity, restored, ctx);
    });
  }

  /** Permanently removes a soft-deleted record. */
  purge(ctx: TenantContext, entityKey: string, id: string): Promise<void> {
    this.assertAdmin(ctx);
    return this.db.run(ctx.tenantId, async (tx) => {
      const entity = await this.loadEntity(tx, ctx, entityKey);
      const row = await tx.record.findFirst({
        where: { id, tenantId: ctx.tenantId, entityId: entity.id, deletedAt: { not: null } },
        select: { id: true },
      });
      if (!row) throw AppError.notFound('Deleted record');
      await this.relations.detachTarget(tx, ctx, id);
      await tx.record.delete({ where: { id } });
      await this.audit.record(tx, ctx, {
        action: 'record.purged',
        targetType: entity.key,
        targetId: id,
      });
    });
  }

  // ---------------------------------------------------------------------------

  async loadEntity(tx: Tx, ctx: TenantContext, entityKey: string): Promise<EntityWithFields> {
    const entity = await this.metadata.findByKey(tx, ctx.tenantId, entityKey);
    if (!entity) throw AppError.notFound('Entity');
    return entity;
  }

  private async findLive(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    id: string,
  ): Promise<RecordRow> {
    const row = await tx.record.findFirst({
      where: { id, tenantId: ctx.tenantId, entityId: entity.id, deletedAt: null },
    });
    if (!row) throw AppError.notFound('Record');
    return row;
  }

  toItem(
    entity: EntityWithFields,
    row: RecordRow,
    ctx: TenantContext,
    selection?: Set<string>,
  ): RecordItem {
    return {
      id: row.id,
      entity: entity.key,
      data: serializeData(entity.fields, row.data as RecordData, ctx.role, selection),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdById,
      updatedBy: row.updatedById,
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  private selection(
    entity: EntityWithFields,
    fields: string | undefined,
    ctx: TenantContext,
  ): Set<string> | undefined {
    if (!fields) return undefined;
    const keys = fields
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const readable = new Set(entity.fields.filter((f) => canRead(f, ctx.role)).map((f) => f.key));
    const unknown = keys.filter((k) => !readable.has(k));
    if (unknown.length) {
      throw AppError.badRequest(
        'INVALID_FIELDS',
        `Unknown or unreadable fields: ${unknown.join(', ')}`,
      );
    }
    return new Set(keys);
  }

  private async syncUnique(
    tx: Tx,
    ctx: TenantContext,
    fields: Field[],
    recordId: string,
    data: RecordData,
  ): Promise<void> {
    const uniqueFields = fields.filter((f) => f.unique);
    await tx.recordUniqueValue.deleteMany({ where: { recordId } });
    for (const field of uniqueFields) {
      const value = data[field.key];
      if (value === null || value === undefined) continue;
      const key = uniqueValueKey(field.type, value);
      const clash = await tx.recordUniqueValue.findUnique({
        where: { fieldId_value: { fieldId: field.id, value: key } },
      });
      if (clash && clash.recordId !== recordId) {
        throw AppError.conflict('UNIQUE_VIOLATION', `"${field.label}" must be unique`, [
          { path: `data.${field.key}`, message: 'Another record already uses this value' },
        ]);
      }
      await tx.recordUniqueValue.create({
        data: { tenantId: ctx.tenantId, fieldId: field.id, value: key, recordId },
      });
    }
  }

  /**
   * Runs plugin before-hooks and validates their changes like user input.
   * Plugins are trusted server code, so field write roles do not apply.
   */
  private async applyPlugins(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    event: 'record.beforeCreate' | 'record.beforeUpdate',
    data: RecordData,
    previous: RecordData | null,
  ): Promise<{ data: RecordData; values: RecordData; keys: string[] }> {
    const changes = await this.plugins.runBefore(
      tx,
      ctx.tenantId,
      event,
      entity.key,
      entity.fields.map((f) => f.key),
      data,
      previous,
    );
    if (Object.keys(changes).length === 0) return { data, values: {}, keys: [] };
    const { values, changedKeys } = validateRecordInput(entity.fields, changes, {
      mode: 'update',
      role: 'owner',
    });
    return { data: mergeData(data, values), values, keys: changedKeys };
  }

  private assertWritable(entity: EntityWithFields): void {
    if (entity.status === 'archived') {
      throw AppError.conflict('ENTITY_ARCHIVED', 'Records of archived entities are read-only');
    }
  }

  private assertAdmin(ctx: TenantContext): void {
    if (!roleAtLeast(ctx.role, 'admin')) throw AppError.forbidden('Admin role required');
  }

  private versionConflict(currentVersion: number): AppError {
    return new AppError(
      'RECORD_VERSION_CONFLICT',
      'The record was changed by someone else. Reload and try again.',
      HttpStatus.CONFLICT,
      { currentVersion },
    );
  }
}
