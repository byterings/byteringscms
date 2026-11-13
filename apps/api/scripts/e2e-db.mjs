// Creates or drops a throwaway database for end-to-end tests.
//
//   node scripts/e2e-db.mjs create <name>   -> prints the connection URL
//   node scripts/e2e-db.mjs drop <name>
//
// Only names starting with "byterings_e2e_" are accepted, so this script can
// never drop a development or production database.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const [command, name] = process.argv.slice(2);
if (!['create', 'drop'].includes(command) || !/^byterings_e2e_[a-z0-9]+$/.test(name ?? '')) {
  console.error('Usage: e2e-db.mjs create|drop byterings_e2e_<suffix>');
  process.exit(1);
}

const base = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://byterings:byterings@localhost:5432/byterings_test',
);
const db = new PrismaClient({ datasourceUrl: base.toString() });
try {
  if (command === 'create') {
    await db.$executeRawUnsafe(`CREATE DATABASE ${name}`);
    const url = new URL(base);
    url.pathname = `/${name}`;
    const apiRoot = resolve(import.meta.dirname, '..');
    const prisma = join(
      apiRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
    );
    execFileSync(prisma, ['migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    process.stdout.write(url.toString());
  } else {
    await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
} finally {
  await db.$disconnect();
}
