import { z } from 'zod';
import { apiKeyScopeSchema } from './permissions';

export const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiKeyInfo = z.infer<typeof apiKeySchema>;

export const createApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiKeyScopeSchema).min(1),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

/** The plain `key` is returned exactly once, at creation. */
export const createdApiKeySchema = z.object({ apiKey: apiKeySchema, key: z.string() });
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
