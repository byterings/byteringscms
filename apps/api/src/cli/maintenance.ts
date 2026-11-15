/**
 * Scheduled housekeeping (run daily, e.g. from cron or a container job):
 * removes expired sessions, prunes audit events beyond AUDIT_RETENTION_DAYS
 * and permanently purges records/media trashed more than
 * TRASH_RETENTION_DAYS ago.
 *
 *   pnpm --filter @bytecontent/api cli:maintenance
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { parseEnv } from '../config/env';
import { MaintenanceService } from '../usage/maintenance.service';

async function main(): Promise<void> {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const env = parseEnv(process.env);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), { logger: false });
  try {
    const result = await app.get(MaintenanceService).run();
    console.warn(JSON.stringify({ maintenance: result }));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
