import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type PluginApi } from '@byteringscms/contracts';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PluginsService } from '../src/plugins/plugins.service';
import { login, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

describe('plugins', () => {
  let app: NestExpressApplication;
  let owner: LoggedIn;
  const observed: string[] = [];

  const send = (as: LoggedIn, method: 'post' | 'patch', path: string, body: unknown = {}) =>
    as.agent[method](`/api/v1${path}`)
      .set('x-csrf-token', as.csrf)
      .send(body as object);

  async function cmsTenant(): Promise<LoggedIn> {
    const user = await login(app.getHttpServer(), (await seedTenant()).owner);
    await send(user, 'post', '/admin/templates/cms/install').expect(201);
    return user;
  }

  beforeAll(async () => {
    app = await createTestApp({
      TENANCY_MODE: 'multi',
      STORAGE_LOCAL_DIR: await mkdtemp(join(tmpdir(), 'byterings-media-')),
      PLUGIN_HOOK_TIMEOUT_MS: '200',
    });
    const plugins = app.get(PluginsService);
    plugins.registerModule(
      {
        id: 'guard',
        name: 'Guard',
        version: '1.0.0',
        description: '',
        capabilities: ['records:modify', 'records:observe'],
        entities: ['tag'],
        main: 'index.js',
      },
      {
        register(api: PluginApi) {
          api.on('record.beforeCreate', ({ data }) => {
            if (data.name === 'forbidden') throw new Error('this tag name is not allowed');
            if (data.name === 'slow')
              return new Promise((resolve) => setTimeout(() => resolve({}), 1000));
            if (data.name === 'invalid') return { slug: 'NOT A SLUG' };
            return {};
          });
          api.on('record.afterCreate', ({ recordId }) => {
            observed.push(recordId);
          });
        },
      },
    );
    owner = await cmsTenant();
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('loads server-installed plugins and lists them per tenant', async () => {
    const res = await owner.agent.get('/api/v1/admin/plugins').expect(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cms-publishing',
          enabled: false,
          entities: ['article', 'page'],
        }),
        expect.objectContaining({ id: 'guard', enabled: false }),
      ]),
    );
  });

  it('runs enabled plugins only', async () => {
    const draft = await send(owner, 'post', '/entities/article/records', {
      data: { title: 'Before enabling', slug: 'before', body: 'x', status: 'published' },
    }).expect(201);
    expect(draft.body.data.data).toMatchObject({ publishedAt: null, seoTitle: null });

    await send(owner, 'post', '/admin/plugins/cms-publishing/enable').expect(200);
    const created = await send(owner, 'post', '/entities/article/records', {
      data: { title: 'Launch announcement', slug: 'launch', body: 'x', status: 'published' },
    }).expect(201);
    expect(created.body.data.data.seoTitle).toBe('Launch announcement');
    expect(Date.parse(created.body.data.data.publishedAt)).toBeGreaterThan(Date.now() - 60_000);

    // Publishing a draft later also stamps publishedAt; plugin changes are audited.
    const later = await send(owner, 'post', '/entities/article/records', {
      data: { title: 'Later', slug: 'later', body: 'x', status: 'draft' },
    }).expect(201);
    expect(later.body.data.data.publishedAt).toBeNull();
    const published = await send(
      owner,
      'patch',
      `/entities/article/records/${later.body.data.id}`,
      {
        data: { status: 'published' },
      },
    ).expect(200);
    expect(published.body.data.data.publishedAt).not.toBeNull();
    const audit = await owner.agent
      .get('/api/v1/admin/audit-events')
      .query({ targetId: later.body.data.id, action: 'record.updated' })
      .expect(200);
    expect(audit.body.data[0].changedKeys).toEqual(
      expect.arrayContaining(['status', 'publishedAt']),
    );

    await send(owner, 'post', '/admin/plugins/cms-publishing/disable').expect(200);
    const after = await send(owner, 'post', '/entities/article/records', {
      data: { title: 'After disabling', slug: 'after', body: 'x', status: 'published' },
    }).expect(201);
    expect(after.body.data.data.publishedAt).toBeNull();
  });

  it('isolates plugin enablement between tenants', async () => {
    await send(owner, 'post', '/admin/plugins/cms-publishing/enable').expect(200);
    const other = await cmsTenant();
    const res = await send(other, 'post', '/entities/article/records', {
      data: { title: 'Other tenant', slug: 'other', body: 'x', status: 'published' },
    }).expect(201);
    expect(res.body.data.data.publishedAt).toBeNull();
    const list = await other.agent.get('/api/v1/admin/plugins').expect(200);
    expect(list.body.data.find((p: { id: string }) => p.id === 'cms-publishing').enabled).toBe(
      false,
    );
  });

  it('rejects changes, times out and re-validates plugin output', async () => {
    await send(owner, 'post', '/admin/plugins/guard/enable').expect(200);
    const rejected = await send(owner, 'post', '/entities/tag/records', {
      data: { name: 'forbidden', slug: 'forbidden' },
    }).expect(422);
    expect(rejected.body.error).toMatchObject({ code: 'PLUGIN_REJECTED' });
    expect(rejected.body.error.message).toContain('this tag name is not allowed');

    const slow = await send(owner, 'post', '/entities/tag/records', {
      data: { name: 'slow', slug: 'slow' },
    }).expect(503);
    expect(slow.body.error.code).toBe('PLUGIN_TIMEOUT');

    const invalid = await send(owner, 'post', '/entities/tag/records', {
      data: { name: 'invalid', slug: 'fine' },
    }).expect(422);
    expect(invalid.body.error.details[0].path).toBe('data.slug');

    // Nothing was written by the failed attempts.
    const tags = await owner.agent
      .get('/api/v1/entities/tag/records')
      .query({ 'filter[name][in]': 'forbidden,slow,invalid' })
      .expect(200);
    expect(tags.body.meta.total).toBe(0);

    const ok = await send(owner, 'post', '/entities/tag/records', {
      data: { name: 'fine', slug: 'fine' },
    }).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observed).toContain(ok.body.data.id);
  });

  it('enforces declared capabilities', () => {
    const plugins = app.get(PluginsService);
    expect(() =>
      plugins.registerModule(
        {
          id: 'sneaky',
          name: 'Sneaky',
          version: '1.0.0',
          description: '',
          capabilities: ['records:observe'],
          main: 'index.js',
        },
        { register: (api) => api.on('record.beforeCreate', () => ({ title: 'x' })) },
      ),
    ).toThrow(/records:modify/);
  });

  it('returns 404 for unknown plugins', async () => {
    await send(owner, 'post', '/admin/plugins/nope/enable').expect(404);
  });
});
