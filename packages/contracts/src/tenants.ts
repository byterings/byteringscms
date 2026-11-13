import { z } from 'zod';
import { roleSchema } from './permissions';

/** Lower-case URL-safe slug, 2-63 characters. */
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lower-case letters, digits and hyphens');

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(512);

export const tenantStatusSchema = z.enum(['active', 'suspended']);

export const tenantSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
  createdAt: z.string(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const updateTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;

export const createTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  owner: z.object({
    email: emailSchema,
    name: z.string().trim().min(1).max(120).optional(),
    password: passwordSchema.optional(),
  }),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export const updateTenantStatusRequestSchema = z.object({ status: tenantStatusSchema });

export const membershipSummarySchema = z.object({
  tenantId: z.uuid(),
  tenantSlug: z.string(),
  tenantName: z.string(),
  role: roleSchema,
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
