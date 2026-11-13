import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.TENANCY_MODE).toBe('single');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('parses comma-separated CORS origins', () => {
    expect(
      parseEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' }).CORS_ORIGINS,
    ).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects invalid values with readable issues', () => {
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow(EnvValidationError);
    try {
      parseEnv({ ...base, TENANCY_MODE: 'many' });
      expect.unreachable();
    } catch (error) {
      expect((error as EnvValidationError).issues[0]).toContain('TENANCY_MODE');
    }
  });
});
