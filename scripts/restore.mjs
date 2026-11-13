#!/usr/bin/env node
// Restores a backup created by scripts/backup.mjs into an EMPTY database.
//
//   node scripts/restore.mjs --from <backup dir> --database-url <url> \
//     [--storage <dir>] --confirm
//
// --database-url / RESTORE_DATABASE_URL: the target database, connected as a
// superuser (or a role allowed to set object owners and bypass row-level
// security). The application role (e.g. "byterings") must already exist;
// restored objects keep their original owner.
//
// Safety: refuses to run without --confirm, verifies checksums, and refuses
// targets that already contain tables or a non-empty storage directory.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { extractTar } from './lib/tar.mjs';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    'database-url': { type: 'string' },
    storage: { type: 'string' },
    confirm: { type: 'boolean', default: false },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const from = values.from && resolve(values.from);
const databaseUrl = values['database-url'] ?? process.env.RESTORE_DATABASE_URL;
if (!from || !databaseUrl)
  fail('Usage: restore.mjs --from <dir> --database-url <url> [--storage <dir>] --confirm');
if (!values.confirm) fail('Restoring writes to the target database. Re-run with --confirm.');

const tool = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8'));
for (const part of [manifest.database, manifest.storage].filter(Boolean)) {
  if (sha256(join(from, part.file)) !== part.sha256)
    fail(`Checksum mismatch for ${part.file}; backup is damaged.`);
}

const tables = execFileSync(
  tool('psql'),
  [
    '--no-psqlrc',
    '-At',
    '-c',
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    databaseUrl,
  ],
  { encoding: 'utf8' },
).trim();
if (tables !== '0')
  fail(`Target database is not empty (${tables} tables). Restore into a new, empty database.`);

let storageDir;
if (manifest.storage) {
  if (!values.storage) fail('This backup contains media files; pass --storage <dir>.');
  storageDir = resolve(values.storage);
  if (existsSync(storageDir) && readdirSync(storageDir).length > 0)
    fail(`Storage directory ${storageDir} is not empty.`);
}

execFileSync(
  tool('pg_restore'),
  [
    '--exit-on-error',
    '--single-transaction',
    `--dbname=${databaseUrl}`,
    join(from, manifest.database.file),
  ],
  { stdio: 'inherit' },
);

if (manifest.storage && storageDir) {
  mkdirSync(storageDir, { recursive: true });
  extractTar(join(from, manifest.storage.file), storageDir);
}
console.log(`Restored backup from ${manifest.createdAt}.`);
