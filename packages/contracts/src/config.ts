/**
 * Configuration documents (ADR-010): a portable, version-controllable
 * representation of a tenant's metadata. Documents contain no internal ids;
 * relation fields reference their target by entity key
 * (`config.targetEntity`) instead of `config.targetEntityId`.
 */
import { z } from 'zod';
import { entityKeySchema, entityStatusSchema } from './entities';
import { fieldKeySchema, fieldTypeSchema } from './fields';
import { roleSchema } from './permissions';

export const configFieldSchema = z.object({
  key: fieldKeySchema,
  label: z.string().trim().min(1).max(120),
  type: fieldTypeSchema,
  description: z.string().max(1000).nullable().optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  readMinRole: roleSchema.optional(),
  writeMinRole: roleSchema.optional(),
  defaultValue: z.unknown().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ConfigField = z.infer<typeof configFieldSchema>;

export const configEntitySchema = z.object({
  key: entityKeySchema,
  name: z.string().trim().min(1).max(120),
  pluralName: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  titleField: z.string().max(63).nullable().optional(),
  publicRead: z.boolean().optional(),
  publishField: z.string().max(63).nullable().optional(),
  publishValue: z.string().max(100).nullable().optional(),
  status: entityStatusSchema.optional(),
  fields: z.array(configFieldSchema).max(200).default([]),
});
export type ConfigEntity = z.infer<typeof configEntitySchema>;

export const configDocumentSchema = z.object({
  version: z.literal(1),
  entities: z.array(configEntitySchema).max(500),
});
export type ConfigDocument = z.infer<typeof configDocumentSchema>;

export const CONFIG_ACTIONS = [
  'createEntity',
  'updateEntity',
  'deleteEntity',
  'createField',
  'updateField',
  'deleteField',
] as const;

export const configChangeSchema = z.object({
  action: z.enum(CONFIG_ACTIONS),
  entity: z.string(),
  field: z.string().optional(),
  /** Attribute names that differ (updates only). */
  changes: z.array(z.string()).optional(),
  /** Deletes data or definitions. */
  destructive: z.boolean(),
});
export type ConfigChange = z.infer<typeof configChangeSchema>;

export const configPlanSchema = z.object({
  changes: z.array(configChangeSchema),
  destructive: z.boolean(),
  /** Changes the platform cannot make automatically (e.g. field type changes). */
  conflicts: z.array(
    z.object({ entity: z.string(), field: z.string().optional(), message: z.string() }),
  ),
  applied: z.boolean(),
});
export type ConfigPlan = z.infer<typeof configPlanSchema>;

export const configApplyRequestSchema = configDocumentSchema.extend({
  /** Delete entities and fields that are not in the document. */
  prune: z.boolean().default(false),
  /** Required when the plan contains destructive changes. */
  confirmDestructive: z.boolean().default(false),
});
export type ConfigApplyRequest = z.infer<typeof configApplyRequestSchema>;
