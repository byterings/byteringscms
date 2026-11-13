import { type NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../src/app.factory';
import { parseEnv, type Env } from '../src/config/env';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides });
}

export async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<NestExpressApplication> {
  const app = await createApp(testEnv(overrides));
  await app.init();
  return app;
}
