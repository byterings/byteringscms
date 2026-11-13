import { z } from 'zod';

/** Standard error envelope returned by every API error. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    /** Correlates the response with server logs (server errors). */
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Health endpoint response. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.record(z.string(), z.enum(['up', 'down'])).optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Wrap a payload schema in the standard `{ data }` success envelope. */
export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}
