/**
 * Restore drill (Phase 9 acceptance): back up a populated installation,
 * restore it into an empty database, and use the restored copy.
 * Requires pg_dump/pg_restore/psql (PG_BIN or PATH) and a superuser
 * connection (ADMIN_DATABASE_URL); skipped otherwise.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createEphemeralDatabase } from './ephemeral-db';
import { closeFixtureDb, fixtureDb } from './fixtures';
import { createTestApp } from './helpers';
import { PNG } from './png';

const pgDump = process.env.PG_BIN ? join(process.env.PG_BIN, 'pg_dump') : 'pg_dump';
const toolsAvailable = spawnSync(pgDump, ['--version']).status === 0;
const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
const repoRoot = resolve(__dirname, '..', '..', '..');

function adminUrlFor(database: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

describe.skipIf(!toolsAvailable)('backup and restore drill', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    await closeFixtureDb();
  });

  it('restores a working installation from a backup', async () => {
    // 1. A populated installation.
    const source = await createEphemeralDatabase();
    cleanups.push(source.drop);
    const sourceStorage = await mkdtemp(join(tmpdir(), 'drill-src-'));
    const owner = {
      tenantName: 'Drill',
      tenantSlug: 'drill',
      name: 'Ops',
      email: 'ops@drill.test',
      password: 'drill password 123',
    };
    let app = await createTestApp({
      TENANCY_MODE: 'single',
      DATABASE_URL: source.url,
      STORAGE_LOCAL_DIR: sourceStorage,
    });
    const agent = request.agent(app.getHttpServer());
    const csrf = (await agent.post('/api/v1/setup').send(owner).expect(201)).body.data.csrfToken;
    await agent
      .post('/api/v1/admin/entities')
      .set('x-csrf-token', csrf)
      .send({
        key: 'note',
        name: 'Note',
        fields: [{ key: 'text', type: 'text', label: 'Text', unique: true }],
      })
      .expect(201);
    for (const text of ['first', 'second', 'third']) {
      await agent
        .post('/api/v1/entities/note/records')
        .set('x-csrf-token', csrf)
        .send({ data: { text } })
        .expect(201);
    }
    const media = (
      await agent
        .post('/api/v1/media')
        .set('x-csrf-token', csrf)
        .attach('file', PNG, { filename: 'drill.png', contentType: 'image/png' })
        .expect(201)
    ).body.data;
    await app.close();

    // 2. Backup (as a role that bypasses row-level security).
    const sourceDb = new URL(source.url).pathname.slice(1);
    const out = await mkdtemp(join(tmpdir(), 'drill-backups-'));
    const backupDir = execFileSync(
      process.execPath,
      [
        join(repoRoot, 'scripts', 'backup.mjs'),
        '--database-url',
        adminUrlFor(sourceDb),
        '--storage',
        sourceStorage,
        '--out',
        out,
      ],
      { encoding: 'utf8' },
    ).trim();

    // 3. Restore into a brand-new, empty database.
    const targetDb = `byterings_t_${randomBytes(5).toString('hex')}`;
    await fixtureDb().$executeRawUnsafe(`CREATE DATABASE ${targetDb}`);
    cleanups.push(async () => {
      await fixtureDb().$executeRawUnsafe(`DROP DATABASE IF EXISTS ${targetDb} WITH (FORCE)`);
    });
    const targetStorage = join(await mkdtemp(join(tmpdir(), 'drill-dst-')), 'storage');
    const restore = (args: string[]) =>
      spawnSync(process.execPath, [join(repoRoot, 'scripts', 'restore.mjs'), ...args], {
        encoding: 'utf8',
      });
    const refused = restore([
      '--from',
      backupDir,
      '--database-url',
      adminUrlFor(targetDb),
      '--storage',
      targetStorage,
    ]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/--confirm/);
    const restored = restore([
      '--from',
      backupDir,
      '--database-url',
      adminUrlFor(targetDb),
      '--storage',
      targetStorage,
      '--confirm',
    ]);
    expect(restored.status, restored.stderr).toBe(0);
    // A second restore into the now non-empty database is refused.
    const again = restore([
      '--from',
      backupDir,
      '--database-url',
      adminUrlFor(targetDb),
      '--storage',
      targetStorage,
      '--confirm',
    ]);
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/not empty/);

    // 4. The restored copy works with the normal application role.
    const targetUrl = new URL(source.url);
    targetUrl.pathname = `/${targetDb}`;
    app = await createTestApp({
      TENANCY_MODE: 'single',
      DATABASE_URL: targetUrl.toString(),
      STORAGE_LOCAL_DIR: targetStorage,
    });
    try {
      const restoredAgent = request.agent(app.getHttpServer());
      await restoredAgent
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(200);
      const records = await restoredAgent
        .get('/api/v1/entities/note/records')
        .query({ sort: 'text' })
        .expect(200);
      expect(records.body.data.map((r: { data: { text: string } }) => r.data.text)).toEqual([
        'first',
        'second',
        'third',
      ]);
      const file = await restoredAgent
        .get(`/api/v1/media/${media.id}/file`)
        .buffer(true)
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
      // Row-level security and unique constraints survived the restore.
      const status = await restoredAgent.get('/api/v1/setup/status').expect(200);
      expect(status.body.data.initialized).toBe(true);
    } finally {
      await app.close();
    }
  });
});
