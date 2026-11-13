import { z } from 'zod';
import { createFieldRequestSchema, fieldSchema } from './fields';

/** Entity keys appear in URLs: lower-case, digits, hyphen, underscore. */
export const entityKeySchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Start with a lower-case letter; use a-z, 0-9, - and _');

export const entityStatusSchema = z.enum(['active', 'archived']);

export const entitySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  pluralName: z.string(),
  description: z.string().nullable(),
  titleField: z.string().nullable(),
  publicRead: z.boolean(),
  publishField: z.string().nullable(),
  publishValue: z.string().nullable(),
  status: entityStatusSchema,
  owner: z.string(),
  overridden: z.boolean(),
  version: z.number().int(),
  fields: z.array(fieldSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EntityDefinition = z.infer<typeof entitySchema>;

const mutableEntityAttributes = {
  name: z.string().trim().min(1).max(120),
  pluralName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  /** Field key used as the record's display title. */
  titleField: z.string().max(63).nullable().optional(),
  /** Anonymous read access through the public API (ADR-025). */
  publicRead: z.boolean().optional(),
  /** Field whose value decides whether a record is published (select or boolean). */
  publishField: z.string().max(63).nullable().optional(),
  publishValue: z.string().max(100).nullable().optional(),
};

export const createEntityRequestSchema = z.object({
  key: entityKeySchema,
  ...mutableEntityAttributes,
  fields: z.array(createFieldRequestSchema).max(200).optional(),
});
export type CreateEntityRequest = z.infer<typeof createEntityRequestSchema>;

export const updateEntityRequestSchema = z.object({
  ...mutableEntityAttributes,
  name: mutableEntityAttributes.name.optional(),
  status: entityStatusSchema.optional(),
});
export type UpdateEntityRequest = z.infer<typeof updateEntityRequestSchema>;

export const metadataVersionSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  version: z.number().int(),
  action: z.string(),
  actorId: z.string().nullable(),
  snapshot: z.unknown(),
  createdAt: z.string(),
});
export type MetadataVersion = z.infer<typeof metadataVersionSchema>;
