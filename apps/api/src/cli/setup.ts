/**
 * First-run installation setup from the command line (alternative to the
 * Admin Studio setup screen).
 *
 *   pnpm --filter @bytecontent/api cli:setup -- \
 *     --tenant-name "Acme" --tenant-slug acme \
 *     --name "Ada Admin" --email ada@example.com
 *
 * The password is read from SETUP_PASSWORD (never pass it as an argument).
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { setupRequestSchema } from '@bytecontent/contracts';
import { AppModule } from '../app.module';
import { parseEnv } from '../config/env';
import { SetupService } from '../tenancy/setup.service';

async function main(): Promise<void> {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const { values } = parseArgs({
    options: {
      'tenant-name': { type: 'string' },
      'tenant-slug': { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
  });
  const input = setupRequestSchema.safeParse({
    tenantName: values['tenant-name'],
    tenantSlug: values['tenant-slug'],
    name: values.name,
    email: values.email,
    password: process.env.SETUP_PASSWORD,
  });
  if (!input.success) {
    for (const issue of input.error.issues) {
      console.error(`${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('Password is read from the SETUP_PASSWORD environment variable.');
    process.exit(1);
  }
  const env = parseEnv({ ...process.env, LOG_LEVEL: 'silent' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), { logger: false });
  try {
    const result = await app.get(SetupService).setup(input.data);
    console.warn(`Installation set up. Tenant ${result.tenantId}, owner ${result.userId}.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
