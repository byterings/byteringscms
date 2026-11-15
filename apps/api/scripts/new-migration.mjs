// Creates a new SQL migration from the difference between the existing
// migrations and prisma/schema.prisma, without touching any real database.
//
// Usage: pnpm --filter @bytecontent/api db:new-migration <name>
//
// Uses SHADOW_DATABASE_URL (default: local byterings_shadow database) to
// replay existing migrations. Review the generated SQL and add any RLS
// policies for new tenant-owned tables before applying with `db:deploy`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: db:new-migration <snake_case_name>');
  process.exit(1);
}

const apiRoot = resolve(import.meta.dirname, '..');
const shadow =
  process.env.SHADOW_DATABASE_URL ??
  'postgresql://byterings:byterings@localhost:5432/byterings_shadow';
const prisma = join(
  apiRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

const sql = execFileSync(
  prisma,
  [
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--shadow-database-url',
    shadow,
    '--script',
  ],
  { cwd: apiRoot, encoding: 'utf8', shell: process.platform === 'win32' },
);

if (sql.includes('This is an empty migration')) {
  console.log('No schema changes detected.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = join(apiRoot, 'prisma', 'migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql);
console.log(`Created ${dir}`);
