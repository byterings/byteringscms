import { z } from 'zod';
import { roleSchema } from './permissions';
import { emailSchema, passwordSchema } from './tenants';

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

/**
 * Adds an existing user by email, or creates the user when `password` and
 * `name` are supplied and the email is not yet registered.
 */
export const addMemberRequestSchema = z.object({
  email: emailSchema,
  role: roleSchema,
  name: z.string().trim().min(1).max(120).optional(),
  password: passwordSchema.optional(),
});
export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

export const updateMemberRequestSchema = z.object({ role: roleSchema });
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
