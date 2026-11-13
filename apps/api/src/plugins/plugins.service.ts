import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  AFTER_HOOKS,
  BEFORE_HOOKS,
  pluginManifestSchema,
  type AfterHook,
  type AfterHookHandler,
  type AfterHookPayload,
  type BeforeHook,
  type BeforeHookHandler,
  type PluginApi,
  type PluginInfo,
  type PluginManifest,
  type PluginModule,
} from '@byteringscms/contracts';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { TenantDb, type Tx } from '../database/tenant-db.service';

interface LoadedPlugin {
  manifest: PluginManifest;
  before: Map<BeforeHook, BeforeHookHandler[]>;
  after: Map<AfterHook, AfterHookHandler[]>;
}

class PluginTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new PluginTimeoutError(`timed out after ${ms} ms`)), ms);
    }),
  ]);
}

/**
 * Trusted plugin runtime (Phase 8, developmentPlan §12.4).
 *
 * - Plugins are installed on the server by an administrator (PLUGINS_DIR)
 *   and enabled per tenant; nothing is uploaded or executed from tenants.
 * - A plugin can only register hooks its manifest declares capabilities for.
 * - Hooks receive record data only - no database handle, no other tenants.
 * - Before-hooks may return field changes, which the record engine validates
 *   exactly like user input. Hooks are time-limited.
 */
@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger('PluginsService');
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  pluginsDir(): string {
    return resolve(this.env.PLUGINS_DIR ?? join(process.cwd(), '..', '..', 'plugins'));
  }

  async onModuleInit(): Promise<void> {
    const dir = this.pluginsDir();
    if (!existsSync(dir)) return;
    for (const entry of (await readdir(dir)).sort()) {
      const manifestPath = join(dir, entry, 'plugin.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = pluginManifestSchema.parse(
          JSON.parse(await readFile(manifestPath, 'utf8')),
        );
        const main = resolve(dir, entry, manifest.main);
        if (!main.startsWith(resolve(dir, entry) + sep))
          throw new Error('main must stay inside the plugin directory');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(main) as Partial<PluginModule>;
        if (typeof mod.register !== 'function') throw new Error('module must export register(api)');
        this.plugins.set(manifest.id, this.register(manifest, mod as PluginModule));
        this.logger.log(`Loaded plugin ${manifest.id}@${manifest.version}`);
      } catch (error) {
        this.logger.error(`Failed to load plugin ${entry}: ${(error as Error).message}`);
      }
    }
  }

  private register(manifest: PluginManifest, mod: PluginModule): LoadedPlugin {
    const loaded: LoadedPlugin = { manifest, before: new Map(), after: new Map() };
    const api: PluginApi = {
      on: (event: BeforeHook | AfterHook, handler: BeforeHookHandler | AfterHookHandler) => {
        if ((BEFORE_HOOKS as readonly string[]).includes(event)) {
          if (!manifest.capabilities.includes('records:modify')) {
            throw new Error(`${event} requires the records:modify capability`);
          }
          const list = loaded.before.get(event as BeforeHook) ?? [];
          list.push(handler as BeforeHookHandler);
          loaded.before.set(event as BeforeHook, list);
        } else if ((AFTER_HOOKS as readonly string[]).includes(event)) {
          if (!manifest.capabilities.includes('records:observe')) {
            throw new Error(`${event} requires the records:observe capability`);
          }
          const list = loaded.after.get(event as AfterHook) ?? [];
          list.push(handler as AfterHookHandler);
          loaded.after.set(event as AfterHook, list);
        } else {
          throw new Error(`Unknown hook ${String(event)}`);
        }
      },
      log: (message: string) => this.logger.log(`[${manifest.id}] ${message}`),
    };
    mod.register(api);
    return loaded;
  }

  /** Registers an in-process plugin (used by tests and embedding applications). */
  registerModule(manifest: PluginManifest, mod: PluginModule): void {
    this.plugins.set(manifest.id, this.register(pluginManifestSchema.parse(manifest), mod));
  }

  async list(ctx: TenantContext): Promise<PluginInfo[]> {
    const installations = await this.db.run(ctx.tenantId, (tx) =>
      tx.pluginInstallation.findMany({ where: { tenantId: ctx.tenantId } }),
    );
    return [...this.plugins.values()].map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      capabilities: manifest.capabilities,
      entities: manifest.entities ?? null,
      enabled: installations.some((i) => i.pluginId === manifest.id && i.enabled),
    }));
  }

  async setEnabled(ctx: TenantContext, id: string, enabled: boolean): Promise<PluginInfo> {
    if (!this.plugins.has(id)) throw AppError.notFound('Plugin');
    await this.db.run(ctx.tenantId, async (tx) => {
      await tx.pluginInstallation.upsert({
        where: { tenantId_pluginId: { tenantId: ctx.tenantId, pluginId: id } },
        create: { tenantId: ctx.tenantId, pluginId: id, enabled },
        update: { enabled },
      });
      await this.audit.record(tx, ctx, {
        action: enabled ? 'plugin.enabled' : 'plugin.disabled',
        targetType: 'plugin',
        targetId: id,
      });
    });
    return (await this.list(ctx)).find((p) => p.id === id)!;
  }

  private async active(tx: Tx, tenantId: string, entityKey: string): Promise<LoadedPlugin[]> {
    if (this.plugins.size === 0) return [];
    const enabled = await tx.pluginInstallation.findMany({
      where: { tenantId, enabled: true },
      select: { pluginId: true },
    });
    return enabled
      .map((e) => this.plugins.get(e.pluginId))
      .filter(
        (p): p is LoadedPlugin =>
          !!p && (!p.manifest.entities || p.manifest.entities.includes(entityKey)),
      )
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  /**
   * Runs before-hooks inside the record transaction. Returns the combined
   * field changes requested by plugins (validated by the caller).
   */
  async runBefore(
    tx: Tx,
    tenantId: string,
    event: BeforeHook,
    entityKey: string,
    fields: readonly string[],
    data: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const changes: Record<string, unknown> = {};
    for (const plugin of await this.active(tx, tenantId, entityKey)) {
      for (const handler of plugin.before.get(event) ?? []) {
        try {
          const result = await withTimeout(
            Promise.resolve(
              handler({
                tenantId,
                entity: entityKey,
                fields,
                data: Object.freeze(structuredClone({ ...data, ...changes })),
                previous: previous ? Object.freeze(structuredClone(previous)) : null,
              }),
            ),
            this.env.PLUGIN_HOOK_TIMEOUT_MS,
          );
          if (result && typeof result === 'object') Object.assign(changes, result);
        } catch (error) {
          if (error instanceof PluginTimeoutError) {
            throw new AppError(
              'PLUGIN_TIMEOUT',
              `Plugin ${plugin.manifest.id} did not respond in time`,
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
          throw new AppError(
            'PLUGIN_REJECTED',
            `Plugin ${plugin.manifest.id}: ${error instanceof Error ? error.message : 'rejected the change'}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }
    }
    return changes;
  }

  /** Runs after-hooks once the change is committed; failures are logged only. */
  async runAfter(tenantId: string, event: AfterHook, payload: AfterHookPayload): Promise<void> {
    if (this.plugins.size === 0) return;
    const plugins = await this.db.run(tenantId, (tx) => this.active(tx, tenantId, payload.entity));
    for (const plugin of plugins) {
      for (const handler of plugin.after.get(event) ?? []) {
        try {
          await withTimeout(
            Promise.resolve(handler(structuredClone(payload))),
            this.env.PLUGIN_HOOK_TIMEOUT_MS,
          );
        } catch (error) {
          this.logger.warn(`[${plugin.manifest.id}] ${event} failed: ${(error as Error).message}`);
        }
      }
    }
  }
}
