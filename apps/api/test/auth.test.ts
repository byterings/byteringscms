import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSystem, closeFixtureDb, createTenant } from './fixtures';
import { login, seedMember, seedTenant, seedUser, TEST_PASSWORD } from './auth-helpers';
import { createTestApp } from './helpers';

describe('authentication (multi-tenant mode)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('signs in with valid credentials and sets an httpOnly session cookie', async () => {
    const { tenant, owner } = await seedTenant();
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email.toUpperCase(), password: owner.password })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/bcms_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data.activeTenant).toMatchObject({ id: tenant.id, role: 'owner' });
    expect(res.body.data.permissions).toContain('members:manage');
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
  });

  it('rejects wrong passwords and unknown emails with the same error', async () => {
    const { owner } = await seedTenant();
    const wrong = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'wrong password here' })
      .expect(401);
    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: TEST_PASSWORD })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toEqual(wrong.body.error);
  });

  it('rejects disabled users', async () => {
    const { owner } = await seedTenant();
    await asSystem((tx) =>
      tx.user.update({ where: { id: owner.id }, data: { status: 'disabled' } }),
    );
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(401);
  });

  it('requires authentication for the session endpoint', async () => {
    await request(server).get('/api/v1/auth/session').expect(401);
    await request(server)
      .get('/api/v1/auth/session')
      .set('cookie', 'bcms_session=forged-token')
      .expect(401);
  });

  it('validates login payloads', async () => {
    const res = await request(server).post('/api/v1/auth/login').send({ email: 'x' }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('requires a CSRF token for state-changing cookie requests', async () => {
    const { owner } = await seedTenant();
    const user = await login(server, owner);
    const missing = await user.agent.post('/api/v1/auth/logout').expect(403);
    expect(missing.body.error.code).toBe('CSRF_INVALID');
    await user.agent.post('/api/v1/auth/logout').set('x-csrf-token', 'wrong').expect(403);
    await user.agent.post('/api/v1/auth/logout').set('x-csrf-token', user.csrf).expect(204);
    await user.agent.get('/api/v1/auth/session').expect(401);
  });

  it('switches between tenants the user belongs to, and only those', async () => {
    const a = await seedTenant();
    const b = await createTenant();
    const outsider = await createTenant();
    await asSystem((tx) =>
      tx.membership.create({ data: { tenantId: b.id, userId: a.owner.id, role: 'viewer' } }),
    );
    const user = await login(server, a.owner);
    expect(user.session.activeTenant?.id).toBe(a.tenant.id);

    const switched = await user.agent
      .post('/api/v1/auth/switch-tenant')
      .set('x-csrf-token', user.csrf)
      .send({ tenantId: b.id })
      .expect(200);
    expect(switched.body.data.activeTenant).toMatchObject({ id: b.id, role: 'viewer' });
    expect(switched.body.data.permissions).not.toContain('records:write');

    const denied = await user.agent
      .post('/api/v1/auth/switch-tenant')
      .set('x-csrf-token', user.csrf)
      .send({ tenantId: outsider.id })
      .expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const current = await user.agent.get('/api/v1/tenant').expect(200);
    expect(current.body.data.id).toBe(b.id);
  });

  it('changes the password and signs out other sessions', async () => {
    const { owner } = await seedTenant();
    const first = await login(server, owner);
    const second = await login(server, owner);
    await second.agent
      .post('/api/v1/auth/password')
      .set('x-csrf-token', second.csrf)
      .send({ currentPassword: 'not it', newPassword: 'a brand new password' })
      .expect(401);
    await second.agent
      .post('/api/v1/auth/password')
      .set('x-csrf-token', second.csrf)
      .send({ currentPassword: owner.password, newPassword: 'a brand new password' })
      .expect(204);
    await first.agent.get('/api/v1/auth/session').expect(401);
    await second.agent.get('/api/v1/auth/session').expect(200);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(401);
    await login(server, { email: owner.email, password: 'a brand new password' });
  });

  it('loses tenant access immediately when the membership is removed', async () => {
    const { tenant, owner } = await seedTenant();
    const editor = await seedMember(tenant.id, 'editor');
    const session = await login(server, editor);
    await session.agent.get('/api/v1/tenant').expect(200);
    await asSystem((tx) => tx.membership.deleteMany({ where: { userId: editor.id } }));
    await session.agent.get('/api/v1/tenant').expect(403);
    expect(owner).toBeDefined();
  });

  it('denies access to suspended tenants', async () => {
    const { tenant, owner } = await seedTenant();
    const session = await login(server, owner);
    await asSystem((tx) =>
      tx.tenant.update({ where: { id: tenant.id }, data: { status: 'suspended' } }),
    );
    await session.agent.get('/api/v1/tenant').expect(403);
  });

  it('signs in users without memberships but gives them no tenant', async () => {
    const lonely = await seedUser();
    const session = await login(server, lonely);
    expect(session.session.activeTenant).toBeNull();
    expect(session.session.permissions).toEqual([]);
    await session.agent.get('/api/v1/tenant').expect(403);
  });
});
