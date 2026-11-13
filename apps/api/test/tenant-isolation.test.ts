/**
 * Tenant isolation suite (developmentPlan §6.5). Release blocker: every
 * tenant-owned resource must be invisible and immutable across tenants.
 */
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApiKey,
  login,
  seedMember,
  seedTenant,
  seedUser,
  type LoggedIn,
  type SeededTenant,
} from './auth-helpers';
import { closeFixtureDb, uniq } from './fixtures';
import { createTestApp } from './helpers';

describe('tenant isolation', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let a: SeededTenant;
  let b: SeededTenant;
  let ownerA: LoggedIn;
  let ownerB: LoggedIn;

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    server = app.getHttpServer();
    a = await seedTenant();
    b = await seedTenant();
    ownerA = await login(server, a.owner);
    ownerB = await login(server, b.owner);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  describe('members', () => {
    it('lists only the caller’s tenant members', async () => {
      await seedMember(b.tenant.id, 'editor');
      const res = await ownerA.agent.get('/api/v1/admin/members').expect(200);
      const userIds = res.body.data.map((m: { userId: string }) => m.userId);
      expect(userIds).toEqual([a.owner.id]);
    });

    it('cannot update or remove another tenant’s membership by id', async () => {
      const list = await ownerB.agent.get('/api/v1/admin/members').expect(200);
      const bMembershipId = list.body.data[0].id;
      await ownerA.agent
        .patch(`/api/v1/admin/members/${bMembershipId}`)
        .set('x-csrf-token', ownerA.csrf)
        .send({ role: 'viewer' })
        .expect(404);
      await ownerA.agent
        .delete(`/api/v1/admin/members/${bMembershipId}`)
        .set('x-csrf-token', ownerA.csrf)
        .expect(404);
      const after = await ownerB.agent.get('/api/v1/admin/members').expect(200);
      expect(after.body.data[0]).toMatchObject({ id: bMembershipId, role: 'owner' });
    });
  });

  describe('API keys', () => {
    it('never lists another tenant’s keys', async () => {
      const keyB = await createApiKey(ownerB, ['records:read']);
      const res = await ownerA.agent.get('/api/v1/admin/api-keys').expect(200);
      expect(res.body.data.map((k: { id: string }) => k.id)).not.toContain(keyB.id);
    });

    it('cannot revoke another tenant’s key', async () => {
      const keyB = await createApiKey(ownerB, ['records:read']);
      await ownerA.agent
        .delete(`/api/v1/admin/api-keys/${keyB.id}`)
        .set('x-csrf-token', ownerA.csrf)
        .expect(404);
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${(await createApiKey(ownerB, ['metadata:read'])).key}`)
        .expect(200);
    });

    it('authenticates a key only into its own tenant', async () => {
      const keyA = await createApiKey(ownerA, ['metadata:read']);
      const res = await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${keyA.key}`)
        .expect(200);
      expect(res.body.data.id).toBe(a.tenant.id);
    });

    it('rejects revoked, expired, unknown and malformed keys', async () => {
      const revoked = await createApiKey(ownerA, ['metadata:read']);
      await ownerA.agent
        .delete(`/api/v1/admin/api-keys/${revoked.id}`)
        .set('x-csrf-token', ownerA.csrf)
        .expect(204);
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${revoked.key}`)
        .expect(401);
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', 'Bearer bcms_00000000_doesnotexist')
        .expect(401);
      await request(server).get('/api/v1/tenant').set('authorization', 'Basic abc').expect(401);
      const expired = await createApiKey(ownerA, ['metadata:read'], {
        expiresAt: new Date(Date.now() + 1500).toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 1700));
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${expired.key}`)
        .expect(401);
    });

    it('enforces key scopes and keeps keys out of user-only endpoints', async () => {
      const recordsOnly = await createApiKey(ownerA, ['records:read']);
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${recordsOnly.key}`)
        .expect(403);
      const full = await createApiKey(ownerA, ['metadata:read', 'metadata:write']);
      await request(server)
        .get('/api/v1/admin/members')
        .set('authorization', `Bearer ${full.key}`)
        .expect(403);
      await request(server)
        .post('/api/v1/admin/api-keys')
        .set('authorization', `Bearer ${full.key}`)
        .send({ name: 'escalate', scopes: ['records:write'] })
        .expect(403);
    });

    it('does not require CSRF for bearer requests', async () => {
      const key = await createApiKey(ownerA, ['metadata:read']);
      await request(server)
        .get('/api/v1/tenant')
        .set('authorization', `Bearer ${key.key}`)
        .expect(200);
    });
  });

  describe('audit events', () => {
    it('only shows the caller’s tenant events', async () => {
      await createApiKey(ownerB, ['records:read']);
      const res = await ownerA.agent
        .get('/api/v1/admin/audit-events')
        .query({ pageSize: 100 })
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const bKeys = await ownerB.agent.get('/api/v1/admin/api-keys').expect(200);
      const bKeyIds = new Set(bKeys.body.data.map((k: { id: string }) => k.id));
      for (const event of res.body.data) {
        expect(bKeyIds.has(event.targetId)).toBe(false);
      }
    });

    it('records changed keys but never secret values', async () => {
      const created = await createApiKey(ownerA, ['records:read']);
      const res = await ownerA.agent
        .get('/api/v1/admin/audit-events')
        .query({ targetId: created.id })
        .expect(200);
      expect(res.body.data[0]).toMatchObject({ action: 'apikey.created', actorType: 'user' });
      expect(JSON.stringify(res.body.data)).not.toContain(created.key);
    });
  });

  describe('roles', () => {
    it('blocks viewers and editors from administration', async () => {
      const viewer = await login(server, await seedMember(a.tenant.id, 'viewer'));
      const editor = await login(server, await seedMember(a.tenant.id, 'editor'));
      await viewer.agent.get('/api/v1/admin/members').expect(403);
      await editor.agent.get('/api/v1/admin/api-keys').expect(403);
      await editor.agent.get('/api/v1/admin/audit-events').expect(403);
      await viewer.agent.get('/api/v1/tenant').expect(200);
    });

    it('lets only owners manage owners and protects the last owner', async () => {
      const t = await seedTenant();
      const owner = await login(server, t.owner);
      const admin = await login(server, await seedMember(t.tenant.id, 'admin'));

      await admin.agent
        .post('/api/v1/admin/members')
        .set('x-csrf-token', admin.csrf)
        .send({
          email: `${uniq('u')}@example.test`,
          name: 'X',
          password: 'long enough password',
          role: 'owner',
        })
        .expect(403);

      const members = await owner.agent.get('/api/v1/admin/members').expect(200);
      const ownerMembership = members.body.data.find((m: { role: string }) => m.role === 'owner');
      await admin.agent
        .delete(`/api/v1/admin/members/${ownerMembership.id}`)
        .set('x-csrf-token', admin.csrf)
        .expect(403);
      const last = await owner.agent
        .patch(`/api/v1/admin/members/${ownerMembership.id}`)
        .set('x-csrf-token', owner.csrf)
        .send({ role: 'admin' })
        .expect(409);
      expect(last.body.error.code).toBe('LAST_OWNER');
    });

    it('adds new and existing users as members', async () => {
      const t = await seedTenant();
      const owner = await login(server, t.owner);
      const created = await owner.agent
        .post('/api/v1/admin/members')
        .set('x-csrf-token', owner.csrf)
        .send({
          email: `${uniq('new')}@example.test`,
          name: 'New',
          password: 'long enough password',
          role: 'editor',
        })
        .expect(201);
      expect(created.body.data.role).toBe('editor');

      const existing = await seedUser();
      await owner.agent
        .post('/api/v1/admin/members')
        .set('x-csrf-token', owner.csrf)
        .send({ email: existing.email, role: 'viewer' })
        .expect(201);
      const dup = await owner.agent
        .post('/api/v1/admin/members')
        .set('x-csrf-token', owner.csrf)
        .send({ email: existing.email, role: 'viewer' })
        .expect(409);
      expect(dup.body.error.code).toBe('MEMBER_EXISTS');
    });
  });

  describe('platform administration', () => {
    it('is restricted to platform administrators', async () => {
      await ownerA.agent.get('/api/v1/platform/tenants').expect(403);
    });

    it('provisions tenants with an owner', async () => {
      const admin = await login(server, await seedUser({ isPlatformAdmin: true }));
      const slug = uniq('acme');
      const ownerEmail = `${uniq('owner')}@example.test`;
      await admin.agent
        .post('/api/v1/platform/tenants')
        .set('x-csrf-token', admin.csrf)
        .send({
          name: 'Acme',
          slug,
          owner: { email: ownerEmail, name: 'O', password: 'long enough password' },
        })
        .expect(201);
      const dup = await admin.agent
        .post('/api/v1/platform/tenants')
        .set('x-csrf-token', admin.csrf)
        .send({ name: 'Acme', slug, owner: { email: ownerEmail } })
        .expect(409);
      expect(dup.body.error.code).toBe('SLUG_TAKEN');
      const owner = await login(server, { email: ownerEmail, password: 'long enough password' });
      expect(owner.session.activeTenant).toMatchObject({ role: 'owner' });
      // A platform admin has no implicit access to tenant data.
      await admin.agent.get('/api/v1/admin/members').expect(403);
    });
  });
});
