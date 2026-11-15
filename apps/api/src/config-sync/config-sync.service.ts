import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ConfigApplyRequest,
  type ConfigChange,
  type ConfigDocument,
  type ConfigEntity,
  type ConfigField,
  type ConfigPlan,
  type EntityDefinition,
  type FieldDefinition,
  type FieldType,
  parseFieldConfig,
  validateFieldValue,
} from '@bytecontent/contracts';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { toEntity, withFields } from '../metadata/metadata.mapper';
import { MetadataService } from '../metadata/metadata.service';

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
export const ENTITY_ATTRS = [
  'name',
  'pluralName',
  'description',
  'titleField',
  'publicRead',
  'publishField',
  'publishValue',
  'status',
] as const;
export const FIELD_ATTRS = [
  'label',
  'description',
  'required',
  'unique',
  'isPublic',
  'readMinRole',
  'writeMinRole',
  'defaultValue',
  'config',
] as const;

export type NormalizedField = Required<Omit<ConfigField, 'config'>> & {
  config: Record<string, unknown>;
};
export type NormalizedEntity = Required<Omit<ConfigEntity, 'fields'>> & {
  fields: NormalizedField[];
};

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Configuration as code (ADR-010). Export produces a portable document;
 * diff is read-only; apply runs the whole plan in one tenant transaction and
 * refuses destructive changes unless explicitly confirmed.
 */
@Injectable()
export class ConfigSyncService {
  constructor(
    private readonly db: TenantDb,
    private readonly metadata: MetadataService,
    private readonly audit: AuditService,
  ) {}

  async export(ctx: TenantContext): Promise<ConfigDocument> {
    const entities = await this.metadata.list(ctx);
    const keyById = new Map(entities.map((e) => [e.id, e.key]));
    return {
      version: 1,
      entities: entities.map((entity) => this.exportEntity(entity, keyById)),
    };
  }

  async diff(ctx: TenantContext, doc: ConfigDocument, prune = false): Promise<ConfigPlan> {
    return this.db.run(ctx.tenantId, (tx) => this.plan(tx, ctx, doc, prune));
  }

  async apply(ctx: TenantContext, request: ConfigApplyRequest): Promise<ConfigPlan> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const plan = await this.applyInTx(tx, ctx, request, request);
      await this.audit.record(tx, ctx, {
        action: 'config.applied',
        targetType: 'config',
        metadata: { changes: plan.changes.length, destructive: plan.destructive },
      });
      return plan;
    });
  }

  /** Plans, checks and executes a document inside the caller's transaction. */
  async applyInTx(
    tx: Tx,
    ctx: TenantContext,
    doc: ConfigDocument,
    opts: { prune?: boolean; confirmDestructive?: boolean } = {},
  ): Promise<ConfigPlan> {
    const plan = await this.plan(tx, ctx, doc, opts.prune ?? false);
    if (plan.conflicts.length) {
      throw new AppError(
        'CONFIG_CONFLICTS',
        'The document contains changes that cannot be applied',
        HttpStatus.CONFLICT,
        plan,
      );
    }
    if (plan.destructive && !opts.confirmDestructive) {
      throw new AppError(
        'DESTRUCTIVE_CHANGES',
        'The plan deletes entities or fields; resend with confirmDestructive: true',
        HttpStatus.CONFLICT,
        plan,
      );
    }
    await this.execute(tx, ctx, doc, plan);
    return { ...plan, applied: true };
  }

  /** Read-only plan inside the caller's transaction. */
  planInTx(tx: Tx, ctx: TenantContext, doc: ConfigDocument, prune = false): Promise<ConfigPlan> {
    return this.plan(tx, ctx, doc, prune);
  }

  // ---------------------------------------------------------------------------

  exportEntity(entity: EntityDefinition, keyById: Map<string, string>): ConfigEntity {
    return {
      key: entity.key,
      name: entity.name,
      pluralName: entity.pluralName,
      description: entity.description,
      titleField: entity.titleField,
      publicRead: entity.publicRead,
      publishField: entity.publishField,
      publishValue: entity.publishValue,
      status: entity.status,
      fields: entity.fields.map((field) => this.exportField(field, keyById)),
    };
  }

  private exportField(field: FieldDefinition, keyById: Map<string, string>): ConfigField {
    const config = { ...field.config };
    if (field.type === 'relation') {
      config.targetEntity = keyById.get(config.targetEntityId as string) ?? null;
      delete config.targetEntityId;
    }
    return {
      key: field.key,
      label: field.label,
      type: field.type,
      description: field.description,
      required: field.required,
      unique: field.unique,
      isPublic: field.isPublic,
      readMinRole: field.readMinRole,
      writeMinRole: field.writeMinRole,
      defaultValue: field.defaultValue,
      config,
    };
  }

  /** Applies defaults and canonical config so documents compare reliably. */
  normalize(entity: ConfigEntity, issues: ConfigPlan['conflicts']): NormalizedEntity {
    const fields: NormalizedField[] = [];
    for (const field of entity.fields) {
      const raw = { ...(field.config ?? {}) };
      let target: unknown;
      if (field.type === 'relation') {
        target = raw.targetEntity;
        delete raw.targetEntity;
        raw.targetEntityId = PLACEHOLDER_ID;
      }
      const parsed = parseFieldConfig(field.type, raw);
      if (!parsed.success) {
        issues.push({
          entity: entity.key,
          field: field.key,
          message: `Invalid config: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
        });
        continue;
      }
      const config = { ...(parsed.data as Record<string, unknown>) };
      if (field.type === 'relation') {
        delete config.targetEntityId;
        config.targetEntity = target;
        if (typeof target !== 'string') {
          issues.push({
            entity: entity.key,
            field: field.key,
            message: 'Relation needs config.targetEntity',
          });
        }
      }
      let defaultValue: unknown = field.defaultValue ?? null;
      if (defaultValue !== null) {
        const result = validateFieldValue(
          {
            key: field.key,
            type: field.type,
            required: false,
            config: parsed.data as Record<string, unknown>,
          },
          defaultValue,
        );
        if (result.ok) defaultValue = result.value;
      }
      fields.push({
        key: field.key,
        label: field.label,
        type: field.type,
        description: field.description ?? null,
        required: field.required ?? false,
        unique: field.unique ?? false,
        isPublic: field.isPublic ?? false,
        readMinRole: field.readMinRole ?? 'viewer',
        writeMinRole: field.writeMinRole ?? 'editor',
        defaultValue,
        config,
      });
    }
    return {
      key: entity.key,
      name: entity.name,
      pluralName: entity.pluralName ?? `${entity.name}s`,
      description: entity.description ?? null,
      // Like the Admin Studio: without an explicit title field, use the first text field.
      titleField:
        entity.titleField !== undefined
          ? entity.titleField
          : (fields.find((f) => f.type === 'text')?.key ?? null),
      publicRead: entity.publicRead ?? false,
      publishField: entity.publishField ?? null,
      publishValue: entity.publishValue ?? null,
      status: entity.status ?? 'active',
      fields,
    };
  }

  private async plan(
    tx: Tx,
    ctx: TenantContext,
    doc: ConfigDocument,
    prune: boolean,
  ): Promise<ConfigPlan> {
    const conflicts: ConfigPlan['conflicts'] = [];
    const changes: ConfigChange[] = [];
    const rows = await tx.entity.findMany({
      where: { tenantId: ctx.tenantId },
      include: withFields,
    });
    const current = rows.map(toEntity);
    const keyById = new Map(current.map((e) => [e.id, e.key]));
    const currentByKey = new Map(
      current.map((e) => [e.key, this.normalize(this.exportEntity(e, keyById), [])]),
    );

    const desiredKeys = new Set<string>();
    for (const raw of doc.entities) {
      if (desiredKeys.has(raw.key)) {
        conflicts.push({ entity: raw.key, message: 'Entity appears twice in the document' });
        continue;
      }
      desiredKeys.add(raw.key);
      const desired = this.normalize(raw, conflicts);
      const existing = currentByKey.get(desired.key);
      for (const field of desired.fields) {
        const target = field.config.targetEntity;
        if (
          field.type === 'relation' &&
          typeof target === 'string' &&
          !currentByKey.has(target) &&
          !doc.entities.some((e) => e.key === target)
        ) {
          conflicts.push({
            entity: desired.key,
            field: field.key,
            message: `Unknown target entity "${target}"`,
          });
        }
      }
      if (!existing) {
        changes.push({ action: 'createEntity', entity: desired.key, destructive: false });
        for (const field of desired.fields) {
          changes.push({
            action: 'createField',
            entity: desired.key,
            field: field.key,
            destructive: false,
          });
        }
        continue;
      }
      const entityChanges = ENTITY_ATTRS.filter((attr) => !same(desired[attr], existing[attr]));
      const existingFields = new Map(existing.fields.map((f) => [f.key, f]));
      const fieldKeys = new Set<string>();
      for (const field of desired.fields) {
        fieldKeys.add(field.key);
        const before = existingFields.get(field.key);
        if (!before) {
          changes.push({
            action: 'createField',
            entity: desired.key,
            field: field.key,
            destructive: false,
          });
          continue;
        }
        if (before.type !== field.type) {
          conflicts.push({
            entity: desired.key,
            field: field.key,
            message: `Field type cannot change (${before.type} -> ${field.type}); delete and recreate the field`,
          });
          continue;
        }
        const fieldChanges = FIELD_ATTRS.filter((attr) => !same(field[attr], before[attr]));
        if (fieldChanges.length) {
          changes.push({
            action: 'updateField',
            entity: desired.key,
            field: field.key,
            changes: fieldChanges,
            destructive: false,
          });
        }
      }
      if (prune) {
        for (const field of existing.fields) {
          if (!fieldKeys.has(field.key)) {
            changes.push({
              action: 'deleteField',
              entity: desired.key,
              field: field.key,
              destructive: true,
            });
          }
        }
      }
      if (entityChanges.length) {
        changes.push({
          action: 'updateEntity',
          entity: desired.key,
          changes: entityChanges,
          destructive: false,
        });
      }
    }
    if (prune) {
      for (const entity of current) {
        if (!desiredKeys.has(entity.key)) {
          changes.push({ action: 'deleteEntity', entity: entity.key, destructive: true });
        }
      }
    }
    return { changes, destructive: changes.some((c) => c.destructive), conflicts, applied: false };
  }

  private async execute(
    tx: Tx,
    ctx: TenantContext,
    doc: ConfigDocument,
    plan: ConfigPlan,
  ): Promise<void> {
    const desired = new Map(doc.entities.map((e) => [e.key, this.normalize(e, [])]));
    const has = (action: ConfigChange['action'], entity: string, field?: string) =>
      plan.changes.some((c) => c.action === action && c.entity === entity && c.field === field);

    // 1. New entities (fields follow, so relation targets exist first).
    for (const [key, entity] of desired) {
      if (!has('createEntity', key)) continue;
      await this.metadata.create(
        ctx,
        { key, name: entity.name, pluralName: entity.pluralName, description: entity.description },
        tx,
      );
    }
    const all = (
      await tx.entity.findMany({ where: { tenantId: ctx.tenantId }, include: withFields })
    ).map(toEntity);
    const byKey = new Map(all.map((e) => [e.key, e]));
    const resolveConfig = (field: NormalizedField) => {
      if (field.type !== 'relation') return field.config;
      const { targetEntity, ...rest } = field.config;
      return { ...rest, targetEntityId: byKey.get(targetEntity as string)?.id };
    };

    // 2. Field creations and updates.
    for (const [key, entity] of desired) {
      const entityId = byKey.get(key)!.id;
      for (const field of entity.fields) {
        const body = {
          label: field.label,
          description: field.description,
          required: field.required,
          unique: field.unique,
          isPublic: field.isPublic,
          readMinRole: field.readMinRole,
          writeMinRole: field.writeMinRole,
          defaultValue: field.defaultValue,
          config: resolveConfig(field),
        };
        if (has('createField', key, field.key)) {
          await this.metadata.addField(
            ctx,
            entityId,
            { key: field.key, type: field.type as FieldType, ...body },
            tx,
          );
        } else if (has('updateField', key, field.key)) {
          const fieldId = byKey.get(key)!.fields.find((f) => f.key === field.key)!.id;
          await this.metadata.updateField(ctx, entityId, fieldId, body, tx);
        }
      }
    }

    // 3. Field deletions (before entity settings, which may stop referencing them).
    for (const change of plan.changes.filter((c) => c.action === 'deleteField')) {
      const entity = byKey.get(change.entity)!;
      const fieldId = entity.fields.find((f) => f.key === change.field)!.id;
      const target = desired.get(change.entity)!;
      if (entity.titleField === change.field || entity.publishField === change.field) {
        await this.metadata.update(
          ctx,
          entity.id,
          {
            titleField: target.titleField === change.field ? null : target.titleField,
            publishField: target.publishField,
            publishValue: target.publishValue,
          },
          tx,
        );
      }
      await this.metadata.removeField(ctx, entity.id, fieldId, tx);
    }

    // 4. Entity settings (they reference fields, so they come last).
    for (const [key, entity] of desired) {
      if (!has('updateEntity', key) && !has('createEntity', key)) continue;
      await this.metadata.update(
        ctx,
        byKey.get(key)!.id,
        {
          name: entity.name,
          pluralName: entity.pluralName,
          description: entity.description,
          titleField: entity.titleField,
          publicRead: entity.publicRead,
          publishField: entity.publishField,
          publishValue: entity.publishValue,
          status: entity.status,
        },
        tx,
      );
    }

    // 5. Entity deletions (refused by the record engine while live records exist).
    for (const change of plan.changes.filter((c) => c.action === 'deleteEntity')) {
      await this.metadata.remove(ctx, byKey.get(change.entity)!.id, tx);
    }
  }
}
