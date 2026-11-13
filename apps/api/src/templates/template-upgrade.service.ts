import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type FieldType,
  type TemplateManifest,
  type TemplateUpgradeRecord,
  type UpgradeItem,
  type UpgradePlan,
} from '@byteringscms/contracts';
import { type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { actorId, type TenantContext } from '../common/request-context';
import {
  ConfigSyncService,
  ENTITY_ATTRS,
  FIELD_ATTRS,
  type NormalizedEntity,
  type NormalizedField,
  same,
} from '../config-sync/config-sync.service';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { toEntity, withFields } from '../metadata/metadata.mapper';
import { MetadataService } from '../metadata/metadata.service';
import { checksum, entityChecksum, TemplatesService } from './templates.service';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const EXPECTED_REFUSALS = new Set([
  'TEMPLATE_NOT_INSTALLED',
  'TEMPLATE_UP_TO_DATE',
  'TEMPLATE_UPGRADE_CONFLICTS',
  'TEMPLATE_UPGRADE_BREAKING',
]);

/**
 * Template upgrades (Phase 8, ADR-011/026).
 *
 * - Template-managed definitions are updated to the new manifest version.
 * - Definitions the tenant customized (`overridden`) are kept and reported.
 * - Tenant-created entities, fields and all records are never touched.
 * - Definitions removed from the template are reported as deprecated, not deleted.
 * - Type changes and key collisions are conflicts that block the upgrade.
 * - Every attempt that reaches execution is recorded, including failures.
 */
@Injectable()
export class TemplateUpgradeService {
  constructor(
    private readonly db: TenantDb,
    private readonly templates: TemplatesService,
    private readonly configSync: ConfigSyncService,
    private readonly metadata: MetadataService,
    private readonly audit: AuditService,
  ) {}

  async plan(ctx: TenantContext, templateId: string): Promise<UpgradePlan> {
    const manifest = await this.templates.manifest(templateId);
    return this.db.run(ctx.tenantId, (tx) => this.buildPlan(tx, ctx, manifest));
  }

  async upgrade(
    ctx: TenantContext,
    templateId: string,
    opts: { acceptBreaking: boolean },
  ): Promise<UpgradePlan> {
    const manifest = await this.templates.manifest(templateId);
    let attempted: UpgradePlan | null = null;
    try {
      return await this.db.run(ctx.tenantId, async (tx) => {
        const plan = await this.buildPlan(tx, ctx, manifest);
        if (plan.upToDate) {
          throw AppError.conflict(
            'TEMPLATE_UP_TO_DATE',
            `Template is already at ${plan.toVersion}`,
          );
        }
        if (plan.conflicts > 0) {
          throw new AppError(
            'TEMPLATE_UPGRADE_CONFLICTS',
            'The upgrade has conflicts',
            HttpStatus.CONFLICT,
            plan,
          );
        }
        if (plan.breaking && !opts.acceptBreaking) {
          throw new AppError(
            'TEMPLATE_UPGRADE_BREAKING',
            'The upgrade contains breaking changes; resend with acceptBreaking: true',
            HttpStatus.CONFLICT,
            plan,
          );
        }
        attempted = plan;
        await this.execute(tx, ctx, manifest, plan);
        await tx.templateInstallation.updateMany({
          where: { tenantId: ctx.tenantId, templateId },
          data: { version: manifest.version },
        });
        await tx.templateUpgrade.create({
          data: {
            tenantId: ctx.tenantId,
            templateId,
            fromVersion: plan.fromVersion,
            toVersion: plan.toVersion,
            status: 'applied',
            report: plan as unknown as Prisma.InputJsonObject,
            actorId: actorId(ctx),
          },
        });
        await this.audit.record(tx, ctx, {
          action: 'template.upgraded',
          targetType: 'template',
          targetId: templateId,
          metadata: { from: plan.fromVersion, to: plan.toVersion },
        });
        return plan;
      });
    } catch (error) {
      const refused = error instanceof AppError && EXPECTED_REFUSALS.has(error.code);
      if (!refused && attempted) {
        // The transaction rolled back; keep a visible record of the failure.
        const failed: UpgradePlan = attempted;
        await this.db.run(ctx.tenantId, (tx) =>
          tx.templateUpgrade.create({
            data: {
              tenantId: ctx.tenantId,
              templateId,
              fromVersion: failed.fromVersion,
              toVersion: failed.toVersion,
              status: 'failed',
              report: {
                plan: failed,
                error: error instanceof Error ? error.message : String(error),
                code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
              } as unknown as Prisma.InputJsonObject,
              actorId: actorId(ctx),
            },
          }),
        );
      }
      throw error;
    }
  }

  history(ctx: TenantContext, templateId: string): Promise<TemplateUpgradeRecord[]> {
    return this.db.run(ctx.tenantId, async (tx) =>
      (
        await tx.templateUpgrade.findMany({
          where: { tenantId: ctx.tenantId, templateId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      ).map((row) => ({
        id: row.id,
        templateId: row.templateId,
        fromVersion: row.fromVersion,
        toVersion: row.toVersion,
        status: row.status as 'applied' | 'failed',
        report: row.report,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  // ---------------------------------------------------------------------------

  private async buildPlan(
    tx: Tx,
    ctx: TenantContext,
    manifest: TemplateManifest,
  ): Promise<UpgradePlan> {
    const installation = await tx.templateInstallation.findFirst({
      where: { tenantId: ctx.tenantId, templateId: manifest.id },
    });
    if (!installation) {
      throw AppError.conflict(
        'TEMPLATE_NOT_INSTALLED',
        `Template "${manifest.id}" is not installed`,
      );
    }
    const owner = `template:${manifest.id}`;
    const entities = (
      await tx.entity.findMany({ where: { tenantId: ctx.tenantId }, include: withFields })
    ).map(toEntity);
    const keyById = new Map(entities.map((e) => [e.id, e.key]));
    const byKey = new Map(entities.map((e) => [e.key, e]));
    const items: UpgradeItem[] = [];

    for (const definition of manifest.entities) {
      const issues: { entity: string; field?: string; message: string }[] = [];
      const desired = this.configSync.normalize(definition, issues);
      for (const issue of issues) {
        items.push({
          action: 'conflict',
          entity: issue.entity,
          field: issue.field,
          breaking: true,
          message: issue.message,
        });
      }
      const current = byKey.get(definition.key);
      if (!current) {
        items.push({ action: 'createEntity', entity: definition.key, breaking: false });
        for (const field of desired.fields) {
          items.push({
            action: 'createField',
            entity: definition.key,
            field: field.key,
            breaking: false,
          });
        }
        continue;
      }
      if (current.owner !== owner) {
        items.push({
          action: 'conflict',
          entity: definition.key,
          breaking: true,
          message: 'An entity with this key is not managed by this template',
        });
        continue;
      }
      const currentNorm = this.configSync.normalize(
        this.configSync.exportEntity(current, keyById),
        [],
      );
      const entityChanges = ENTITY_ATTRS.filter((attr) => !same(desired[attr], currentNorm[attr]));
      if (entityChanges.length) {
        items.push(
          current.overridden
            ? {
                action: 'skipOverridden',
                entity: definition.key,
                changes: entityChanges,
                breaking: false,
                message: 'Entity settings were customized',
              }
            : {
                action: 'updateEntity',
                entity: definition.key,
                changes: entityChanges,
                breaking: false,
              },
        );
      }
      for (const field of desired.fields) {
        const before = current.fields.find((f) => f.key === field.key);
        const beforeNorm = currentNorm.fields.find((f) => f.key === field.key);
        if (!before || !beforeNorm) {
          items.push({
            action: 'createField',
            entity: definition.key,
            field: field.key,
            // A new required field without default affects existing records.
            breaking: field.required && field.defaultValue === null,
          });
          continue;
        }
        if (before.owner !== owner) {
          items.push({
            action: 'conflict',
            entity: definition.key,
            field: field.key,
            breaking: true,
            message: 'A field with this key was created by the tenant',
          });
          continue;
        }
        if (before.type !== field.type) {
          items.push({
            action: 'conflict',
            entity: definition.key,
            field: field.key,
            breaking: true,
            message: `Type change ${before.type} -> ${field.type} needs a manual migration`,
          });
          continue;
        }
        const changes = FIELD_ATTRS.filter((attr) => !same(field[attr], beforeNorm[attr]));
        if (changes.length === 0) continue;
        items.push(
          before.overridden
            ? {
                action: 'skipOverridden',
                entity: definition.key,
                field: field.key,
                changes,
                breaking: false,
                message: 'Field was customized',
              }
            : {
                action: 'updateField',
                entity: definition.key,
                field: field.key,
                changes,
                breaking:
                  (field.required && !beforeNorm.required) || (field.unique && !beforeNorm.unique),
              },
        );
      }
      for (const field of current.fields) {
        if (field.owner === owner && !desired.fields.some((f) => f.key === field.key)) {
          items.push({
            action: 'deprecated',
            entity: definition.key,
            field: field.key,
            breaking: true,
            message: 'Removed from the template; kept with its data',
          });
        }
      }
    }
    for (const entity of entities) {
      if (entity.owner === owner && !manifest.entities.some((e) => e.key === entity.key)) {
        items.push({
          action: 'deprecated',
          entity: entity.key,
          breaking: true,
          message: 'Removed from the template; kept with its data',
        });
      }
    }

    const changelog = Object.entries(manifest.changelog ?? {})
      .filter(
        ([v]) =>
          compareVersions(v, installation.version) > 0 && compareVersions(v, manifest.version) <= 0,
      )
      .sort(([a], [b]) => compareVersions(a, b))
      .map(([version, notes]) => ({ version, notes }));
    const upToDate = compareVersions(manifest.version, installation.version) <= 0;
    return {
      templateId: manifest.id,
      fromVersion: installation.version,
      toVersion: manifest.version,
      upToDate,
      breaking: items.some((i) => i.breaking && i.action !== 'conflict'),
      conflicts: items.filter((i) => i.action === 'conflict').length,
      items: upToDate ? [] : items,
      changelog,
    };
  }

  private async execute(
    tx: Tx,
    ctx: TenantContext,
    manifest: TemplateManifest,
    plan: UpgradePlan,
  ): Promise<void> {
    const owner = `template:${manifest.id}`;
    const desired = new Map<string, NormalizedEntity>(
      manifest.entities.map((e) => [e.key, this.configSync.normalize(e, [])]),
    );
    const has = (action: UpgradeItem['action'], entity: string, field?: string) =>
      plan.items.some((i) => i.action === action && i.entity === entity && i.field === field);

    for (const [key, entity] of desired) {
      if (has('createEntity', key)) {
        await this.metadata.create(
          ctx,
          {
            key,
            name: entity.name,
            pluralName: entity.pluralName,
            description: entity.description,
          },
          tx,
        );
      }
    }
    const loadByKey = async () =>
      new Map(
        (await tx.entity.findMany({ where: { tenantId: ctx.tenantId }, include: withFields }))
          .map(toEntity)
          .map((e) => [e.key, e]),
      );
    let byKey = await loadByKey();
    const fieldBody = (field: NormalizedField) => {
      const config =
        field.type === 'relation'
          ? (() => {
              const { targetEntity, ...rest } = field.config;
              return { ...rest, targetEntityId: byKey.get(targetEntity as string)?.id };
            })()
          : field.config;
      return {
        label: field.label,
        description: field.description,
        required: field.required,
        unique: field.unique,
        isPublic: field.isPublic,
        readMinRole: field.readMinRole,
        writeMinRole: field.writeMinRole,
        defaultValue: field.defaultValue,
        config,
      };
    };
    const touched: { entity: string; field?: string }[] = [];
    for (const [key, entity] of desired) {
      const entityId = byKey.get(key)?.id;
      if (!entityId) continue;
      for (const field of entity.fields) {
        if (has('createField', key, field.key)) {
          await this.metadata.addField(
            ctx,
            entityId,
            { key: field.key, type: field.type as FieldType, ...fieldBody(field) },
            tx,
          );
          touched.push({ entity: key, field: field.key });
        } else if (has('updateField', key, field.key)) {
          const fieldId = byKey.get(key)!.fields.find((f) => f.key === field.key)!.id;
          await this.metadata.updateField(ctx, entityId, fieldId, fieldBody(field), tx);
          touched.push({ entity: key, field: field.key });
        }
      }
    }
    byKey = await loadByKey();
    for (const [key, entity] of desired) {
      if (!has('createEntity', key) && !has('updateEntity', key)) continue;
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
      touched.push({ entity: key });
    }

    // Stamp everything this upgrade wrote as template-managed again.
    const definitions = new Map(manifest.entities.map((e) => [e.key, e]));
    for (const item of touched) {
      const definition = definitions.get(item.entity)!;
      const entityId = byKey.get(item.entity)!.id;
      if (item.field) {
        const field = definition.fields.find((f) => f.key === item.field)!;
        await tx.field.updateMany({
          where: { tenantId: ctx.tenantId, entityId, key: item.field },
          data: { owner, overridden: false, checksum: checksum(field) },
        });
      } else {
        await tx.entity.update({
          where: { id: entityId },
          data: { owner, overridden: false, checksum: entityChecksum(definition) },
        });
      }
    }
  }
}
