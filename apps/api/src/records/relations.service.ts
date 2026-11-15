import { Injectable } from '@nestjs/common';
import { fieldConfigSchemas, type RecordItem } from '@bytecontent/contracts';
import { type Field, type Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { type Tx } from '../database/tenant-db.service';
import { type EntityWithFields, withFields } from '../metadata/metadata.mapper';
import { canRead, type RecordData, serializeData } from './record-validation';

const MAX_EXPAND_FIELDS = 5;

function relationConfig(field: Field) {
  return fieldConfigSchemas.relation.parse(field.config);
}

function idsOf(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Relationship engine (Phase 5, ADR-022).
 *
 * - Targets must be live records of the configured entity in the same tenant.
 * - `record_links` mirrors relation values for integrity and reverse lookups.
 * - `expand` resolves relation values to records (depth 1), applying the
 *   caller's field permissions to the related records as well.
 */
@Injectable()
export class RelationsService {
  async validateTargets(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    values: RecordData,
  ): Promise<void> {
    const issues: { path: string; message: string }[] = [];
    for (const field of entity.fields) {
      if (field.type === 'media' && field.key in values) {
        const ids = [...new Set(idsOf(values[field.key]).map((id) => id.toLowerCase()))];
        if (ids.length === 0) continue;
        const { accept } = fieldConfigSchemas.media.parse(field.config);
        const found = await tx.media.findMany({
          where: { id: { in: ids }, tenantId: ctx.tenantId, deletedAt: null },
          select: { kind: true },
        });
        if (found.length !== ids.length) {
          issues.push({ path: `data.${field.key}`, message: 'Referenced media not found' });
        } else if (
          accept &&
          found.some((m) => !accept.includes(m.kind as (typeof accept)[number]))
        ) {
          issues.push({
            path: `data.${field.key}`,
            message: `Only ${accept.join(', ')} files are allowed`,
          });
        }
        continue;
      }
      if (field.type !== 'relation' || !(field.key in values)) continue;
      const ids = [...new Set(idsOf(values[field.key]).map((id) => id.toLowerCase()))];
      if (ids.length === 0) continue;
      const { targetEntityId } = relationConfig(field);
      const found = await tx.record.count({
        where: {
          id: { in: ids },
          tenantId: ctx.tenantId,
          entityId: targetEntityId,
          deletedAt: null,
        },
      });
      if (found !== ids.length) {
        issues.push({ path: `data.${field.key}`, message: 'Referenced record not found' });
      }
    }
    if (issues.length) throw AppError.validation(issues);
  }

  async syncLinks(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    recordId: string,
    data: RecordData,
  ): Promise<void> {
    const relationFields = entity.fields.filter((f) => f.type === 'relation');
    if (relationFields.length === 0) return;
    await tx.recordLink.deleteMany({
      where: { sourceRecordId: recordId, fieldId: { in: relationFields.map((f) => f.id) } },
    });
    const rows: Prisma.RecordLinkCreateManyInput[] = [];
    for (const field of relationFields) {
      idsOf(data[field.key]).forEach((targetRecordId, position) => {
        rows.push({
          tenantId: ctx.tenantId,
          fieldId: field.id,
          sourceRecordId: recordId,
          targetRecordId: targetRecordId.toLowerCase(),
          position,
        });
      });
    }
    if (rows.length) await tx.recordLink.createMany({ data: rows, skipDuplicates: true });
  }

  /**
   * Before a record is purged, removes it from every relation value that
   * points to it so no record keeps a dangling reference.
   */
  async detachTarget(tx: Tx, ctx: TenantContext, recordId: string): Promise<void> {
    const links = await tx.recordLink.findMany({
      where: { tenantId: ctx.tenantId, targetRecordId: recordId },
      include: { field: true, source: true },
    });
    // A source may reference the target through several fields: apply all
    // removals to one copy of its data, then write it once.
    const updated = new Map<string, RecordData>();
    for (const link of links) {
      const data = updated.get(link.sourceRecordId) ?? { ...(link.source.data as RecordData) };
      const value = data[link.field.key];
      if (Array.isArray(value)) {
        const remaining = value.filter((id) => String(id).toLowerCase() !== recordId);
        if (remaining.length) data[link.field.key] = remaining;
        else delete data[link.field.key];
      } else {
        delete data[link.field.key];
      }
      updated.set(link.sourceRecordId, data);
    }
    for (const [sourceId, data] of updated) {
      await tx.record.update({
        where: { id: sourceId },
        data: { data: data as Prisma.InputJsonObject, version: { increment: 1 } },
      });
    }
  }

  async expand(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    items: RecordItem[],
    expand: string | undefined,
  ): Promise<void> {
    if (!expand) return;
    const keys = [
      ...new Set(
        expand
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    ];
    if (keys.length > MAX_EXPAND_FIELDS) {
      throw AppError.badRequest(
        'INVALID_EXPAND',
        `At most ${MAX_EXPAND_FIELDS} fields can be expanded`,
      );
    }
    for (const key of keys) {
      const field = entity.fields.find((f) => f.key === key);
      if (!field || field.type !== 'relation' || !canRead(field, ctx.role)) {
        throw AppError.badRequest('INVALID_EXPAND', `"${key}" is not a readable relation field`);
      }
      const { targetEntityId, cardinality } = relationConfig(field);
      const ids = [...new Set(items.flatMap((item) => idsOf(item.data[key])))];
      const target = await tx.entity.findFirst({
        where: { id: targetEntityId, tenantId: ctx.tenantId },
        include: withFields,
      });
      const rows =
        target && ids.length
          ? await tx.record.findMany({
              where: {
                id: { in: ids },
                tenantId: ctx.tenantId,
                entityId: target.id,
                deletedAt: null,
              },
            })
          : [];
      const byId = new Map<string, RecordItem>(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            entity: target!.key,
            data: serializeData(target!.fields, row.data as RecordData, ctx.role),
            version: row.version,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            createdBy: row.createdById,
            updatedBy: row.updatedById,
            deletedAt: null,
          },
        ]),
      );
      for (const item of items) {
        const value = item.data[key];
        if (value === null || value === undefined) continue;
        const resolved = idsOf(value)
          .map((id) => byId.get(id.toLowerCase()))
          .filter((r): r is RecordItem => r !== undefined);
        item.data[key] = cardinality === 'many' ? resolved : (resolved[0] ?? null);
      }
    }
  }
}
