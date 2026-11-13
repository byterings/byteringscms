import { describe, expect, it } from 'vitest';
import { apiErrorSchema, dataEnvelope, healthResponseSchema } from './common';

describe('common contracts', () => {
  it('accepts a valid error envelope', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'X', message: 'y' } }).success).toBe(true);
  });

  it('rejects an error envelope without a code', () => {
    expect(apiErrorSchema.safeParse({ error: { message: 'y' } }).success).toBe(false);
  });

  it('wraps payloads in a data envelope', () => {
    const schema = dataEnvelope(healthResponseSchema);
    expect(schema.parse({ data: { status: 'ok' } })).toEqual({ data: { status: 'ok' } });
  });
});
