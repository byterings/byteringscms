import { Injectable } from '@nestjs/common';
import {
  type CreateEntityRequest,
  type CreateFieldRequest,
  type EntityDefinition,
  type FieldType,
  fieldConfigSchemas,
  type MetadataVersion,
  type UpdateEntityRequest,
  type UpdateFieldRequest,
} from '@byteringscms/contracts';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { actorId, type TenantContext } from '../common/request-context';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { normalizeField } from './field-validation';
import { type EntityWithFields, toEntity, withFields } from './metadata.mapper';
import { MetadataHooks } from './metadata-hooks';

const TITLE_FIELD_TYPES: readonly FieldType[] = ['text', 'integer', 'decimal', 'date', 'select'];

/**
 * Entity and field definitions (Phase 2). All operations run inside a
 * tenant-scoped transaction, bump the entity version, write a metadata
 * version snapshot (ADR-020) and an audit event.
 */
@Injectable()
export class MetadataService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    private readonly hooks: MetadataHooks,
  ) {}

  list(ctx: TenantContext): Promise<EntityDefinition[]> {
    return this.db.run(ctx.tenantId, async (tx) =>
      (
        await tx.entity.findMany({
          where: { tenantId: ctx.tenantId },
          include: withFields,
          orderBy: { name: 'asc' },
        })
      ).map(toEntity),
    );
  }

  get(ctx: TenantContext, entityId: string): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => toEntity(await this.load(tx, ctx, entityId)));
  }

  /** Loads an entity by its key for the record engine. */
  async findByKey(tx: Tx, tenantId: string, key: string): Promise<EntityWithFields | null> {
    return tx.entity.findFirst({ where: { tenantId, key }, include: withFields });
  }

  async create(ctx: TenantContext, input: CreateEntityRequest): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      if (await tx.entity.findFirst({ where: { tenantId: ctx.tenantId, key: input.key } })) {
        throw AppError.conflict(
          'ENTITY_KEY_TAKEN',
          `An entity with key "${input.key}" already exists`,
        );
      }
      const fieldKeys = new Set<string>();
      for (const field of input.fields ?? []) {
        if (fieldKeys.has(field.key)) {
          throw AppError.validation([
            { path: 'fields', message: `Duplicate field key "${field.key}"` },
          ]);
        }
        fieldKeys.add(field.key);
      }
      const entity = await tx.entity.create({
        data: {
          tenantId: ctx.tenantId,
          key: input.key,
          name: input.name,
          pluralName: input.pluralName ?? `${input.name}s`,
          description: input.description ?? null,
          publicRead: input.publicRead ?? false,
        },
      });
      let position = 0;
      for (const field of input.fields ?? []) {
        await this.insertField(tx, ctx, entity.id, field, position++);
      }
      // Title/publish settings reference fields, so apply them after fields exist.
      const loaded = await this.load(tx, ctx, entity.id);
      const settings = this.entitySettings(loaded, input);
      const updated = await tx.entity.update({
        where: { id: entity.id },
        data: settings,
        include: withFields,
      });
      await this.snapshot(tx, ctx, updated, 'entity.created');
      return toEntity(updated);
    });
  }

  async update(
    ctx: TenantContext,
    entityId: string,
    input: UpdateEntityRequest,
  ): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      const data: Prisma.EntityUpdateInput = {
        ...this.entitySettings(current, input),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.pluralName !== undefined ? { pluralName: input.pluralName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.publicRead !== undefined ? { publicRead: input.publicRead } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      const updated = await this.bump(tx, current, data);
      await this.snapshot(tx, ctx, updated, 'entity.updated', Object.keys(input));
      return toEntity(updated);
    });
  }

  async remove(ctx: TenantContext, entityId: string): Promise<void> {
    await this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      const referencing = await tx.field.findMany({
        where: {
          tenantId: ctx.tenantId,
          type: 'relation',
          entityId: { not: entityId },
          config: { path: ['targetEntityId'], equals: entityId },
        },
        select: { key: true, entityId: true },
      });
      if (referencing.length) {
        throw AppError.conflict(
          'ENTITY_REFERENCED',
          'Other entities have relation fields pointing to this entity',
          referencing,
        );
      }
      await this.hooks.beforeEntityDelete(tx, ctx.tenantId, entityId);
      await tx.entity.delete({ where: { id: entityId } });
      await this.writeVersion(tx, ctx, current, 'entity.deleted');
      await this.audit.record(tx, ctx, {
        action: 'entity.deleted',
        targetType: 'entity',
        targetId: entityId,
      });
    });
  }

  async addField(
    ctx: TenantContext,
    entityId: string,
    input: CreateFieldRequest,
  ): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      if (current.fields.some((f) => f.key === input.key)) {
        throw AppError.conflict(
          'FIELD_KEY_TAKEN',
          `A field with key "${input.key}" already exists`,
        );
      }
      const position = Math.max(-1, ...current.fields.map((f) => f.position)) + 1;
      const field = await this.insertField(tx, ctx, entityId, input, position);
      await this.hooks.afterFieldChange(tx, ctx.tenantId, field.id);
      const updated = await this.bump(tx, current, {});
      await this.snapshot(tx, ctx, updated, 'field.created', [input.key]);
      return toEntity(updated);
    });
  }

  async updateField(
    ctx: TenantContext,
    entityId: string,
    fieldId: string,
    input: UpdateFieldRequest,
  ): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      const field = current.fields.find((f) => f.id === fieldId);
      if (!field) throw AppError.notFound('Field');
      const type = field.type as FieldType;
      const required = input.required ?? field.required;
      const unique = input.unique ?? field.unique;
      const normalized = await normalizeField(tx, ctx.tenantId, type, {
        required,
        unique,
        config: input.config ?? field.config,
        defaultValue: input.defaultValue !== undefined ? input.defaultValue : field.defaultValue,
      });
      if (type === 'relation') {
        const before = fieldConfigSchemas.relation.parse(field.config);
        const after = normalized.config as { targetEntityId: string; cardinality: string };
        if (
          before.targetEntityId !== after.targetEntityId ||
          before.cardinality !== after.cardinality
        ) {
          await this.hooks.assertFieldEmpty(
            tx,
            ctx.tenantId,
            field.id,
            'change the relation target or cardinality',
          );
        }
      }
      await tx.field.update({
        where: { id: fieldId },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
          ...(input.readMinRole !== undefined ? { readMinRole: input.readMinRole } : {}),
          ...(input.writeMinRole !== undefined ? { writeMinRole: input.writeMinRole } : {}),
          required,
          unique,
          config: normalized.config,
          defaultValue: normalized.defaultValue ?? Prisma.DbNull,
          overridden: field.owner !== 'tenant' ? true : field.overridden,
        },
      });
      if (unique !== field.unique)
        await this.hooks.afterUniqueChange(tx, ctx.tenantId, fieldId, unique);
      await this.hooks.afterFieldChange(tx, ctx.tenantId, fieldId);
      const updated = await this.bump(tx, current, {});
      await this.snapshot(tx, ctx, updated, 'field.updated', [field.key]);
      return toEntity(updated);
    });
  }

  async removeField(
    ctx: TenantContext,
    entityId: string,
    fieldId: string,
  ): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      const field = current.fields.find((f) => f.id === fieldId);
      if (!field) throw AppError.notFound('Field');
      if (current.titleField === field.key || current.publishField === field.key) {
        throw AppError.conflict(
          'FIELD_IN_USE',
          'The field is used as the entity title or publish field; change that first',
        );
      }
      await this.hooks.beforeFieldDelete(tx, ctx.tenantId, entityId, field);
      await tx.field.delete({ where: { id: fieldId } });
      const updated = await this.bump(tx, current, {});
      await this.snapshot(tx, ctx, updated, 'field.deleted', [field.key]);
      return toEntity(updated);
    });
  }

  async reorderFields(
    ctx: TenantContext,
    entityId: string,
    fieldIds: string[],
  ): Promise<EntityDefinition> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.load(tx, ctx, entityId);
      const known = new Set(current.fields.map((f) => f.id));
      if (
        fieldIds.length !== known.size ||
        !fieldIds.every((id) => known.has(id)) ||
        new Set(fieldIds).size !== fieldIds.length
      ) {
        throw AppError.validation([
          { path: 'fieldIds', message: 'Must list every field of the entity exactly once' },
        ]);
      }
      for (const [index, id] of fieldIds.entries()) {
        await tx.field.update({ where: { id }, data: { position: index } });
      }
      const updated = await this.bump(tx, current, {});
      await this.snapshot(tx, ctx, updated, 'fields.reordered');
      return toEntity(updated);
    });
  }

  versions(ctx: TenantContext, entityId: string): Promise<MetadataVersion[]> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const rows = await tx.metadataVersion.findMany({
        where: { tenantId: ctx.tenantId, entityId },
        orderBy: { version: 'desc' },
        take: 100,
      });
      return rows.map((row) => ({
        id: row.id,
        entityId: row.entityId,
        version: row.version,
        action: row.action,
        actorId: row.actorId,
        snapshot: row.snapshot,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  // ---------------------------------------------------------------------------

  private async load(tx: Tx, ctx: TenantContext, entityId: string): Promise<EntityWithFields> {
    const entity = await tx.entity.findFirst({
      where: { id: entityId, tenantId: ctx.tenantId },
      include: withFields,
    });
    if (!entity) throw AppError.notFound('Entity');
    return entity;
  }

  private async insertField(
    tx: Tx,
    ctx: TenantContext,
    entityId: string,
    input: CreateFieldRequest,
    position: number,
  ) {
    const normalized = await normalizeField(tx, ctx.tenantId, input.type, {
      required: input.required ?? false,
      unique: input.unique ?? false,
      config: input.config,
      defaultValue: input.defaultValue,
    });
    return tx.field.create({
      data: {
        tenantId: ctx.tenantId,
        entityId,
        key: input.key,
        label: input.label,
        type: input.type,
        description: input.description ?? null,
        required: input.required ?? false,
        unique: input.unique ?? false,
        isPublic: input.isPublic ?? false,
        readMinRole: input.readMinRole ?? 'viewer',
        writeMinRole: input.writeMinRole ?? 'editor',
        config: normalized.config,
        defaultValue: normalized.defaultValue ?? Prisma.DbNull,
        position,
      },
    });
  }

  /** Validates title/publish settings against the entity's fields. */
  private entitySettings(
    entity: EntityWithFields,
    input: Pick<UpdateEntityRequest, 'titleField' | 'publishField' | 'publishValue'>,
  ): Prisma.EntityUpdateInput {
    const data: Prisma.EntityUpdateInput = {};
    const byKey = new Map(entity.fields.map((f) => [f.key, f]));

    if (input.titleField !== undefined) {
      if (input.titleField !== null) {
        const field = byKey.get(input.titleField);
        if (!field || !TITLE_FIELD_TYPES.includes(field.type as FieldType)) {
          throw AppError.validation([
            {
              path: 'titleField',
              message: 'Must be an existing text, number, date or select field',
            },
          ]);
        }
      }
      data.titleField = input.titleField;
    } else if (!entity.titleField) {
      const firstText = entity.fields.find((f) => f.type === 'text');
      if (firstText) data.titleField = firstText.key;
    }

    if (input.publishField !== undefined || input.publishValue !== undefined) {
      const publishField =
        input.publishField !== undefined ? input.publishField : entity.publishField;
      const publishValue =
        input.publishValue !== undefined ? input.publishValue : entity.publishValue;
      if (publishField === null) {
        data.publishField = null;
        data.publishValue = null;
      } else {
        const field = byKey.get(publishField);
        let valid = false;
        if (field?.type === 'boolean') valid = publishValue === 'true' || publishValue === 'false';
        if (field?.type === 'select') {
          const options = fieldConfigSchemas.select.parse(field.config).options;
          valid = options.some((o) => o.value === publishValue);
        }
        if (!field || !valid) {
          throw AppError.validation([
            {
              path: 'publishField',
              message: 'Must be a select or boolean field with a matching publishValue',
            },
          ]);
        }
        data.publishField = publishField;
        data.publishValue = publishValue;
      }
    }
    if (entity.owner !== 'tenant') data.overridden = true;
    return data;
  }

  private bump(tx: Tx, entity: EntityWithFields, data: Prisma.EntityUpdateInput) {
    return tx.entity.update({
      where: { id: entity.id },
      data: {
        ...data,
        version: { increment: 1 },
        ...(entity.owner !== 'tenant' ? { overridden: true } : {}),
      },
      include: withFields,
    });
  }

  private async snapshot(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    action: string,
    changedKeys: string[] = [],
  ): Promise<void> {
    await this.writeVersion(tx, ctx, entity, action);
    await this.audit.record(tx, ctx, {
      action,
      targetType: 'entity',
      targetId: entity.id,
      changedKeys,
      metadata: { version: entity.version },
    });
  }

  private async writeVersion(
    tx: Tx,
    ctx: TenantContext,
    entity: EntityWithFields,
    action: string,
  ): Promise<void> {
    await tx.metadataVersion.create({
      data: {
        tenantId: ctx.tenantId,
        entityId: entity.id,
        version: entity.version,
        action,
        snapshot: toEntity(entity) as unknown as Prisma.InputJsonObject,
        actorId: actorId(ctx),
      },
    });
  }
}
