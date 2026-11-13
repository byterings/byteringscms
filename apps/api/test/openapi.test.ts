/**
 * Contract tests (developmentPlan §16.4): the published OpenAPI document and
 * the routes the API actually serves must match exactly.
 */
import { API_OPERATIONS } from '@byteringscms/contracts';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, login, seedMember, seedTenant } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

function servedRoutes(app: NestExpressApplication): Set<string> {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: Layer[] };
    _router?: { stack: Layer[] };
  };
  const stack = (instance.router ?? instance._router)!.stack;
  const routes = new Set<string>();
  for (const layer of stack) {
    if (!layer.route) continue;
    // Middleware mounted on every path (e.g. request logging) is not an operation.
    const raw = layer.route.path;
    if (!raw || raw === '/api/v1' || raw.includes('*') || raw.includes('(')) continue;
    const path = layer.route.path.replace(/^\/api\/v1/, '').replace(/:(\w+)/g, '{$1}');
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled && method !== '_all') routes.add(`${method} ${path}`);
    }
  }
  return routes;
}

describe('OpenAPI contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('documents every served route and serves every documented route', () => {
    const served = servedRoutes(app);
    // Static helper for the docs page, not an API operation.
    served.delete('get /docs/init.js');
    const documented = new Set(API_OPERATIONS.map((op) => `${op.method} ${op.path}`));
    expect(
      [...served].filter((r) => !documented.has(r)),
      'undocumented routes',
    ).toEqual([]);
    expect(
      [...documented].filter((r) => !served.has(r)),
      'documented but not served',
    ).toEqual([]);
  });

  it('serves a valid OpenAPI 3.1 document', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(
      res.body.paths['/entities/{entityKey}/records'].get.parameters.map(
        (p: { name: string }) => p.name,
      ),
    ).toContain('filter');
    const ops = Object.values(
      res.body.paths as Record<string, Record<string, { operationId: string }>>,
    ).flatMap((p) => Object.values(p).map((o) => o.operationId));
    expect(new Set(ops).size).toBe(ops.length);
    // Every $ref resolves.
    const refs = JSON.stringify(res.body).match(/"#\/components\/schemas\/[^"]+"/g) ?? [];
    for (const ref of refs) {
      const name = ref.slice('"#/components/schemas/'.length, -1);
      expect(res.body.components.schemas[name], ref).toBeDefined();
    }
  });

  it('serves the interactive documentation', async () => {
    const html = await request(app.getHttpServer()).get('/api/v1/docs').expect(200);
    expect(html.headers['content-type']).toMatch(/text\/html/);
    await request(app.getHttpServer()).get('/api/v1/docs/assets/swagger-ui-bundle.js').expect(200);
  });

  it('builds a typed tenant document limited to readable fields', async () => {
    const t = await seedTenant();
    const owner = await login(app.getHttpServer(), t.owner);
    await owner.agent
      .post('/api/v1/admin/entities')
      .set('x-csrf-token', owner.csrf)
      .send({
        key: 'blog-post',
        name: 'Blog post',
        fields: [
          { key: 'title', type: 'text', label: 'Title', required: true },
          {
            key: 'status',
            type: 'select',
            label: 'Status',
            config: { options: [{ value: 'draft', label: 'Draft' }] },
          },
          { key: 'notes', type: 'longtext', label: 'Notes', readMinRole: 'admin' },
        ],
      })
      .expect(201);

    const asOwner = await owner.agent.get('/api/v1/openapi/tenant.json').expect(200);
    const data = asOwner.body.components.schemas.BlogPostData;
    expect(data.properties.title).toMatchObject({ type: 'string', title: 'Title' });
    expect(data.properties.status.anyOf[0].enum).toEqual(['draft']);
    expect(data.properties.notes).toBeDefined();
    expect(asOwner.body.paths['/entities/blog-post/records'].post.requestBody).toBeDefined();
    expect(asOwner.body.components.schemas.BlogPostInput.required).toEqual(['title']);

    const viewer = await login(app.getHttpServer(), await seedMember(t.tenant.id, 'viewer'));
    const asViewer = await viewer.agent.get('/api/v1/openapi/tenant.json').expect(200);
    expect(asViewer.body.components.schemas.BlogPostData.properties.notes).toBeUndefined();

    const key = await createApiKey(owner, ['records:read']);
    await request(app.getHttpServer())
      .get('/api/v1/openapi/tenant.json')
      .set('authorization', `Bearer ${key.key}`)
      .expect(403);
  });
});
