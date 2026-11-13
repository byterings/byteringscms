import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MaintenanceService } from '../src/usage/maintenance.service';
import { login, seedTenant, type LoggedIn } from './auth-helpers';
import { asSystem, closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';
import { PNG } from './png';

describe('operations', () => {
  let app: NestExpressApplication;
  let owner: LoggedIn;
  let tenantId: string;

  const send = (method: 'post' | 'delete', path: string, body?: unknown) => {
    const req = owner.agent[method](`/api/v1${path}`).set('x-csrf-token', owner.csrf);
    return body === undefined ? req : req.send(body as object);
  };

  beforeAll(async () => {
    app = await createTestApp({
      TENANCY_MODE: 'multi',
      TENANT_MAX_RECORDS: '2',
      TENANT_MAX_MEDIA_BYTES: String(PNG.length * 2),
      STORAGE_LOCAL_DIR: await mkdtemp(join(tmpdir(), 'byterings-media-')),
      AUDIT_RETENTION_DAYS: '30',
      TRASH_RETENTION_DAYS: '7',
    });
    const seeded = await seedTenant();
    tenantId = seeded.tenant.id;
    owner = await login(app.getHttpServer(), seeded.owner);
    await send('post', '/admin/entities', {
      key: 'note',
      name: 'Note',
      fields: [{ key: 'text', type: 'text', label: 'Text' }],
    }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('echoes or assigns request ids', async () => {
    const assigned = await request(app.getHttpServer()).get('/api/v1/setup/status');
    expect(assigned.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await request(app.getHttpServer())
      .get('/api/v1/setup/status')
      .set('x-request-id', 'trace-abc-12345');
    expect(echoed.headers['x-request-id']).toBe('trace-abc-12345');
    const rejected = await request(app.getHttpServer())
      .get('/api/v1/setup/status')
      .set('x-request-id', 'bad id with spaces');
    expect(rejected.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('enforces record and media quotas and reports usage', async () => {
    const first = await send('post', '/entities/note/records', { data: { text: 'a' } }).expect(201);
    await send('post', '/entities/note/records', { data: { text: 'b' } }).expect(201);
    const over = await send('post', '/entities/note/records', { data: { text: 'c' } }).expect(403);
    expect(over.body.error.code).toBe('QUOTA_EXCEEDED');
    // Trashed records do not count.
    await send('delete', `/entities/note/records/${first.body.data.id}`).expect(204);
    await send('post', '/entities/note/records', { data: { text: 'c' } }).expect(201);

    const upload = () =>
      owner.agent
        .post('/api/v1/media')
        .set('x-csrf-token', owner.csrf)
        .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    await upload().expect(201);
    await upload().expect(201);
    const full = await upload().expect(403);
    expect(full.body.error.code).toBe('QUOTA_EXCEEDED');

    const usage = await owner.agent.get('/api/v1/admin/usage').expect(200);
    expect(usage.body.data).toMatchObject({
      records: 2,
      entities: 1,
      media: { files: 2, bytes: PNG.length * 2 },
      members: 1,
      limits: { maxRecords: 2, maxMediaBytes: PNG.length * 2 },
    });
  });

  it('prunes expired sessions, old audit events and old trash', async () => {
    const now = new Date();
    const longAgo = new Date(now.getTime() - 90 * 24 * 3_600_000);
    const recently = new Date(now.getTime() - 24 * 3_600_000);
    const records = await owner.agent.get('/api/v1/entities/note/records').expect(200);
    const [oldTrash, recentTrash] = records.body.data.map((r: { id: string }) => r.id);
    await send('delete', `/entities/note/records/${oldTrash}`).expect(204);
    await send('delete', `/entities/note/records/${recentTrash}`).expect(204);
    const media = (await owner.agent.get('/api/v1/media').expect(200)).body.data[0];
    await send('delete', `/media/${media.id}`).expect(204);

    await asSystem(async (tx) => {
      await tx.record.update({ where: { id: oldTrash }, data: { deletedAt: longAgo } });
      await tx.record.update({ where: { id: recentTrash }, data: { deletedAt: recently } });
      await tx.media.update({ where: { id: media.id }, data: { deletedAt: longAgo } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorType: 'system',
          action: 'test.old',
          changedKeys: [],
          createdAt: longAgo,
        },
      });
      const user = await tx.user.findFirstOrThrow({
        where: { memberships: { some: { tenantId } } },
      });
      await tx.session.create({
        data: {
          tokenHash: `expired-${Date.now()}`,
          userId: user.id,
          csrfToken: 'x',
          expiresAt: longAgo,
        },
      });
    });

    const result = await app.get(MaintenanceService).run(now);
    expect(result.expiredSessions).toBeGreaterThanOrEqual(1);
    expect(result.auditEvents).toBeGreaterThanOrEqual(1);
    expect(result.purgedRecords).toBeGreaterThanOrEqual(1);
    expect(result.purgedMedia).toBeGreaterThanOrEqual(1);

    const remaining = await asSystem((tx) =>
      tx.record.findMany({ where: { id: { in: [oldTrash, recentTrash] } }, select: { id: true } }),
    );
    expect(remaining.map((r) => r.id)).toEqual([recentTrash]);
    const oldAudit = await asSystem((tx) =>
      tx.auditEvent.count({ where: { tenantId, action: 'test.old' } }),
    );
    expect(oldAudit).toBe(0);
    // The signed-in session is still valid.
    await owner.agent.get('/api/v1/auth/session').expect(200);
  });
});
