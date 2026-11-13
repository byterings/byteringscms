import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  templateManifestSchema,
  type ConfigEntity,
  type TemplateInfo,
  type TemplateManifest,
} from '@byteringscms/contracts';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { ConfigSyncService } from '../config-sync/config-sync.service';
import { TenantDb, type Tx } from '../database/tenant-db.service';
import { RecordsService } from '../records/records.service';

/** Deterministic JSON (sorted keys) for checksums. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function checksum(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function entityChecksum(entity: ConfigEntity): string {
  const { fields: _fields, ...rest } = entity;
  return checksum(rest);
}

const REF_RE = /^@([a-z][a-z0-9_-]*):(\d+)$/;

/**
 * Template engine (Phase 7, ADR-009/026). Templates are read from
 * TEMPLATES_DIR at runtime - the core never imports template code.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger('TemplatesService');
  private cache: Map<string, TemplateManifest> | null = null;

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly db: TenantDb,
    private readonly configSync: ConfigSyncService,
    private readonly records: RecordsService,
    private readonly audit: AuditService,
  ) {}

  templatesDir(): string {
    return resolve(this.env.TEMPLATES_DIR ?? join(process.cwd(), '..', '..', 'templates'));
  }

  async manifests(): Promise<Map<string, TemplateManifest>> {
    if (this.cache) return this.cache;
    const found = new Map<string, TemplateManifest>();
    const dir = this.templatesDir();
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      this.logger.warn(`Templates directory not found: ${dir}`);
    }
    for (const entry of entries.sort()) {
      const file = join(dir, entry, 'template.json');
      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      const parsed = templateManifestSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.error(`Invalid template manifest ${file}: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      found.set(parsed.data.id, parsed.data);
    }
    this.cache = found;
    return found;
  }

  async manifest(id: string): Promise<TemplateManifest> {
    const manifest = (await this.manifests()).get(id);
    if (!manifest) throw AppError.notFound('Template');
    return manifest;
  }

  async list(ctx: TenantContext): Promise<TemplateInfo[]> {
    const manifests = await this.manifests();
    const installed = await this.db.run(ctx.tenantId, (tx) =>
      tx.templateInstallation.findMany({ where: { tenantId: ctx.tenantId } }),
    );
    return [...manifests.values()].map((m) => {
      const installation = installed.find((i) => i.templateId === m.id);
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        description: m.description,
        entities: m.entities.map((e) => e.key),
        installedVersion: installation?.version ?? null,
        installedAt: installation?.installedAt.toISOString() ?? null,
      };
    });
  }

  async install(
    ctx: TenantContext,
    id: string,
    opts: { sampleData: boolean },
  ): Promise<TemplateInfo> {
    const manifest = await this.manifest(id);
    await this.db.run(ctx.tenantId, async (tx) => {
      if (
        await tx.templateInstallation.findFirst({
          where: { tenantId: ctx.tenantId, templateId: id },
        })
      ) {
        throw AppError.conflict('TEMPLATE_INSTALLED', `Template "${id}" is already installed`);
      }
      const keys = manifest.entities.map((e) => e.key);
      const clashing = await tx.entity.findMany({
        where: { tenantId: ctx.tenantId, key: { in: keys } },
        select: { key: true },
      });
      if (clashing.length) {
        throw new AppError(
          'TEMPLATE_CONFLICT',
          `Entities with these keys already exist: ${clashing.map((e) => e.key).join(', ')}`,
          HttpStatus.CONFLICT,
        );
      }
      await this.configSync.applyInTx(tx, ctx, { version: 1, entities: manifest.entities });
      await this.stampOwnership(tx, ctx, manifest);
      await tx.templateInstallation.create({
        data: { tenantId: ctx.tenantId, templateId: id, version: manifest.version },
      });
      if (opts.sampleData && manifest.sampleData) await this.seed(tx, ctx, manifest);
      await this.audit.record(tx, ctx, {
        action: 'template.installed',
        targetType: 'template',
        targetId: id,
        metadata: { version: manifest.version, sampleData: opts.sampleData },
      });
    });
    return (await this.list(ctx)).find((t) => t.id === id)!;
  }

  /** Marks the template's definitions as template-managed with checksums (ADR-026). */
  async stampOwnership(tx: Tx, ctx: TenantContext, manifest: TemplateManifest): Promise<void> {
    const owner = `template:${manifest.id}`;
    for (const entity of manifest.entities) {
      const row = await tx.entity.findFirstOrThrow({
        where: { tenantId: ctx.tenantId, key: entity.key },
      });
      await tx.entity.update({
        where: { id: row.id },
        data: { owner, overridden: false, checksum: entityChecksum(entity) },
      });
      for (const field of entity.fields) {
        await tx.field.updateMany({
          where: { tenantId: ctx.tenantId, entityId: row.id, key: field.key },
          data: { owner, overridden: false, checksum: checksum(field) },
        });
      }
    }
  }

  /** Creates sample records; "@entity:index" strings reference earlier sample records. */
  private async seed(tx: Tx, ctx: TenantContext, manifest: TemplateManifest): Promise<void> {
    const created = new Map<string, string[]>();
    const resolveRef = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(resolveRef);
      if (typeof value !== 'string') return value;
      const match = REF_RE.exec(value);
      if (!match) return value;
      const id = created.get(match[1]!)?.[Number(match[2])];
      if (!id) throw new Error(`Template sample data references missing ${value}`);
      return id;
    };
    for (const entity of manifest.entities) {
      const rows = manifest.sampleData?.[entity.key] ?? [];
      const ids: string[] = [];
      for (const row of rows) {
        const data = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, resolveRef(v)]));
        const record = await this.records.create(ctx, entity.key, { data }, tx);
        ids.push(record.id);
      }
      created.set(entity.key, ids);
    }
  }
}
