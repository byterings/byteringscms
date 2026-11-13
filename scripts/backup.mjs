#!/usr/bin/env node
// Creates a consistent backup of the platform: database dump + media files.
//
//   node scripts/backup.mjs --database-url <url> [--storage <dir>] [--out <dir>]
//
// --database-url / BACKUP_DATABASE_URL must use a role that bypasses
// row-level security (a superuser, or a dedicated role with BYPASSRLS and
// pg_read_all_data). The application role cannot see tenant rows outside a
// tenant context, so a dump made with it would be empty.
//
// PG_BIN may point to the directory containing pg_dump (default: PATH).
// Output: <out>/<timestamp>/{database.dump, storage.tar, manifest.json}
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createTar } from './lib/tar.mjs';

const { values } = parseArgs({
  options: {
    'database-url': { type: 'string' },
    storage: { type: 'string' },
    out: { type: 'string', default: './backups' },
  },
});

const databaseUrl = values['database-url'] ?? process.env.BACKUP_DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing --database-url (or BACKUP_DATABASE_URL).');
  process.exit(1);
}
const tool = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = resolve(values.out, stamp);
mkdirSync(dir, { recursive: true });

const dump = join(dir, 'database.dump');
execFileSync(tool('pg_dump'), ['--format=custom', '--compress=6', `--file=${dump}`, databaseUrl], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
const pgDumpVersion = execFileSync(tool('pg_dump'), ['--version'], { encoding: 'utf8' }).trim();

const manifest = {
  format: 1,
  createdAt: new Date().toISOString(),
  pgDumpVersion,
  database: { file: 'database.dump', bytes: statSync(dump).size, sha256: sha256(dump) },
  storage: null,
};

if (values.storage) {
  const storageDir = resolve(values.storage);
  if (!existsSync(storageDir)) {
    console.warn(`Storage directory ${storageDir} does not exist; skipping media files.`);
  } else {
    const tarFile = join(dir, 'storage.tar');
    createTar(storageDir, tarFile);
    manifest.storage = {
      file: 'storage.tar',
      bytes: statSync(tarFile).size,
      sha256: sha256(tarFile),
    };
  }
}

writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(dir);
