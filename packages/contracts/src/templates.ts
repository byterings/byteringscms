import { z } from 'zod';
import { configEntitySchema } from './config';

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Use semantic versioning, e.g. 1.2.0');

/**
 * Template manifest (developmentPlan §12.2). A template is a versioned set of
 * entity definitions (and optional sample records) installed onto a tenant.
 */
export const templateManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(120),
  version: semver,
  description: z.string().max(2000).default(''),
  /** Minimum platform API version required. */
  platformVersion: semver.default('1.0.0'),
  entities: z.array(configEntitySchema).min(1).max(200),
  /** Optional demo content: entity key -> records (relations by `@entityKey:index`). */
  sampleData: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(500)).optional(),
  /** Version history notes shown before upgrades. */
  changelog: z.record(z.string(), z.string()).optional(),
});
export type TemplateManifest = z.infer<typeof templateManifestSchema>;

export const templateInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  entities: z.array(z.string()),
  installedVersion: z.string().nullable(),
  installedAt: z.string().nullable(),
});
export type TemplateInfo = z.infer<typeof templateInfoSchema>;

export const UPGRADE_ACTIONS = [
  'createEntity',
  'updateEntity',
  'createField',
  'updateField',
  /** The tenant customized this definition; it is kept as is. */
  'skipOverridden',
  /** The template no longer contains this definition; it is kept. */
  'deprecated',
  /** Cannot be applied automatically (e.g. type change, key collision). */
  'conflict',
] as const;

export const upgradeItemSchema = z.object({
  action: z.enum(UPGRADE_ACTIONS),
  entity: z.string(),
  field: z.string().optional(),
  changes: z.array(z.string()).optional(),
  breaking: z.boolean(),
  message: z.string().optional(),
});
export type UpgradeItem = z.infer<typeof upgradeItemSchema>;

export const upgradePlanSchema = z.object({
  templateId: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  upToDate: z.boolean(),
  breaking: z.boolean(),
  conflicts: z.number().int(),
  items: z.array(upgradeItemSchema),
  changelog: z.array(z.object({ version: z.string(), notes: z.string() })),
});
export type UpgradePlan = z.infer<typeof upgradePlanSchema>;

export const upgradeTemplateRequestSchema = z.object({
  /** Required when the plan contains breaking changes. */
  acceptBreaking: z.boolean().default(false),
});
export type UpgradeTemplateRequest = z.infer<typeof upgradeTemplateRequestSchema>;

export const templateUpgradeSchema = z.object({
  id: z.uuid(),
  templateId: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  status: z.enum(['applied', 'failed']),
  report: z.unknown(),
  createdAt: z.string(),
});
export type TemplateUpgradeRecord = z.infer<typeof templateUpgradeSchema>;

export const installTemplateRequestSchema = z.object({
  sampleData: z.boolean().default(false),
});
export type InstallTemplateRequest = z.infer<typeof installTemplateRequestSchema>;
