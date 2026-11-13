import { z } from 'zod';
import { permissionSchema, roleSchema } from './permissions';
import { emailSchema, membershipSummarySchema, passwordSchema, slugSchema } from './tenants';

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(512),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const switchTenantRequestSchema = z.object({ tenantId: z.uuid() });
export type SwitchTenantRequest = z.infer<typeof switchTenantRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const sessionSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    name: z.string(),
    isPlatformAdmin: z.boolean(),
  }),
  tenancyMode: z.enum(['single', 'multi']),
  activeTenant: z
    .object({ id: z.uuid(), slug: z.string(), name: z.string(), role: roleSchema })
    .nullable(),
  memberships: z.array(membershipSummarySchema),
  permissions: z.array(permissionSchema),
  csrfToken: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;

export const setupStatusSchema = z.object({ initialized: z.boolean() });
export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupRequestSchema = z.object({
  tenantName: z.string().trim().min(1).max(120),
  tenantSlug: slugSchema,
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;
