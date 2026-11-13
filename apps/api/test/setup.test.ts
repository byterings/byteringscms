import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEphemeralDatabase } from './ephemeral-db';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

const owner = {
  tenantName: 'Acme Inc',
  tenantSlug: 'acme',
  name: 'Ada Admin',
  email: 'ada@acme.test',
  password: 'a sufficiently long password',
};

describe('first-run setup (single-tenant mode)', () => {
  let db: Awaited<ReturnType<typeof createEphemeralDatabase>>;
  let app: NestExpressApplication;

  beforeAll(async () => {
    db = await createEphemeralDatabase();
    app = await createTestApp({
      TENANCY_MODE: 'single',
      DATABASE_URL: db.url,
      SETUP_TOKEN: 'setup-token-for-tests-1234',
    });
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
    await closeFixtureDb();
  });

  it('reports an uninitialized installation', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/setup/status').expect(200);
    expect(res.body.data).toEqual({ initialized: false });
  });

  it('requires the setup token when configured', async () => {
    await request(app.getHttpServer()).post('/api/v1/setup').send(owner).expect(403);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/setup')
      .set('x-setup-token', 'setup-token-for-tests-1234')
      .send({ ...owner, password: 'short' })
      .expect(422);
    expect(res.body.error.details[0].path).toBe('password');
  });

  it('creates the tenant and owner, then signs the owner in', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/v1/setup')
      .set('x-setup-token', 'setup-token-for-tests-1234')
      .send(owner)
      .expect(201);
    expect(res.body.data.user).toMatchObject({ email: owner.email, isPlatformAdmin: true });
    expect(res.body.data.tenancyMode).toBe('single');
    expect(res.body.data.activeTenant).toMatchObject({ slug: 'acme', role: 'owner' });

    const tenant = await agent.get('/api/v1/tenant').expect(200);
    expect(tenant.body.data.slug).toBe('acme');

    const status = await request(app.getHttpServer()).get('/api/v1/setup/status').expect(200);
    expect(status.body.data).toEqual({ initialized: true });
  });

  it('can only run once', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/setup')
      .set('x-setup-token', 'setup-token-for-tests-1234')
      .send({ ...owner, email: 'other@acme.test', tenantSlug: 'other' })
      .expect(409);
    expect(res.body.error.code).toBe('ALREADY_INITIALIZED');
  });

  it('resolves every session to the default tenant and disallows switching', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    const res = await agent
      .post('/api/v1/auth/switch-tenant')
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({ tenantId: login.body.data.activeTenant.id })
      .expect(409);
    expect(res.body.error.code).toBe('TENANCY_SINGLE');
  });

  it('disallows creating tenants through the platform API', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    await agent
      .post('/api/v1/platform/tenants')
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({ name: 'X', slug: 'x-tenant', owner: { email: owner.email } })
      .expect(409);
  });
});
