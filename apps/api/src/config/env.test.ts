import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.TENANCY_MODE).toBe('single');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses comma-separated CORS origins', () => {
    expect(parseEnv({ CORS_ORIGINS: 'http://a.test, http://b.test' }).CORS_ORIGINS).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('rejects invalid values with readable issues', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(EnvValidationError);
    try {
      parseEnv({ TENANCY_MODE: 'many' });
      expect.unreachable();
    } catch (error) {
      expect((error as EnvValidationError).issues[0]).toContain('TENANCY_MODE');
    }
  });
});
