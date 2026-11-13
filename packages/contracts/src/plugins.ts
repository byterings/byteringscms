/**
 * Plugin contract (developmentPlan §12.4). Plugins are trusted code installed
 * on the server by an administrator and enabled per tenant. They declare
 * capabilities, and hooks only receive record data - never database access.
 */
import { z } from 'zod';
import { entityKeySchema } from './entities';

export const PLUGIN_CAPABILITIES = [
  /** May change record data in before-hooks. */
  'records:modify',
  /** May observe record changes in after-hooks. */
  'records:observe',
] as const;
export const pluginCapabilitySchema = z.enum(PLUGIN_CAPABILITIES);
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(2000).default(''),
  capabilities: z.array(pluginCapabilitySchema).min(1),
  /** Entity keys the plugin applies to; omit for all entities. */
  entities: z.array(entityKeySchema).optional(),
  /** CommonJS module (relative to the plugin directory) exporting register(). */
  main: z
    .string()
    .regex(/^[\w./-]+\.c?js$/)
    .default('index.js'),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export const pluginInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  capabilities: z.array(pluginCapabilitySchema),
  entities: z.array(z.string()).nullable(),
  enabled: z.boolean(),
});
export type PluginInfo = z.infer<typeof pluginInfoSchema>;

// ---------------------------------------------------------------------------
// Runtime API offered to plugin modules
// ---------------------------------------------------------------------------

export const BEFORE_HOOKS = ['record.beforeCreate', 'record.beforeUpdate'] as const;
export const AFTER_HOOKS = [
  'record.afterCreate',
  'record.afterUpdate',
  'record.afterDelete',
] as const;
export type BeforeHook = (typeof BEFORE_HOOKS)[number];
export type AfterHook = (typeof AFTER_HOOKS)[number];
export type PluginHook = BeforeHook | AfterHook;

export interface BeforeHookPayload {
  tenantId: string;
  entity: string;
  /** Keys of the entity's fields (empty values are absent from `data`). */
  fields: readonly string[];
  /** Record data after the requested changes. */
  data: Readonly<Record<string, unknown>>;
  /** Stored data before the change (updates only). */
  previous: Readonly<Record<string, unknown>> | null;
}

export interface AfterHookPayload {
  tenantId: string;
  entity: string;
  recordId: string;
  data: Readonly<Record<string, unknown>>;
}

/** Before-hooks may return field changes; they are validated like user input. */
export type BeforeHookHandler = (
  payload: BeforeHookPayload,
) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
export type AfterHookHandler = (payload: AfterHookPayload) => void | Promise<void>;

export interface PluginApi {
  on(event: BeforeHook, handler: BeforeHookHandler): void;
  on(event: AfterHook, handler: AfterHookHandler): void;
  log(message: string): void;
}

/** Shape of a plugin module. */
export interface PluginModule {
  register(api: PluginApi): void;
}
