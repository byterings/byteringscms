import { type NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../src/app.factory';
import { parseEnv, type Env } from '../src/config/env';
import { TEST_DATABASE_URL } from './test-db-url';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    // Suites send many requests from one IP; rate-limit tests override these.
    RATE_LIMIT_PER_MINUTE: '100000',
    AUTH_RATE_LIMIT_PER_MINUTE: '10000',
    ...overrides,
  });
}

export async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<NestExpressApplication> {
  const app = await createApp(testEnv(overrides));
  await app.init();
  return app;
}
