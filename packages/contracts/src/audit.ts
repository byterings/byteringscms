import { z } from 'zod';
import { pageQuerySchema } from './pagination';

export const auditEventSchema = z.object({
  id: z.uuid(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  changedKeys: z.array(z.string()),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditEventInfo = z.infer<typeof auditEventSchema>;

export const auditQuerySchema = pageQuerySchema.extend({
  action: z.string().max(100).optional(),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(100).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
