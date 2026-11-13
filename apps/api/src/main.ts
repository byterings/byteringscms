import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.factory';
import { parseEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const env = parseEnv(process.env);
  const app = await createApp(env);
  await app.listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
