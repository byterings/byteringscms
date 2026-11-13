import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, seedMember, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';
import { PNG } from './png';

describe('CMS template and public API', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let owner: LoggedIn;
  let slug: string;
  let tenantId: string;

  const send = (method: 'post' | 'patch', path: string, body: unknown, as: LoggedIn = owner) =>
    as.agent[method](`/api/v1${path}`)
      .set('x-csrf-token', as.csrf)
      .send(body as object);
  const pub = (path: string) => request(server).get(`/api/v1/public/${slug}${path}`);

  beforeAll(async () => {
    app = await createTestApp({
      TENANCY_MODE: 'multi',
      STORAGE_LOCAL_DIR: await mkdtemp(join(tmpdir(), 'byterings-media-')),
    });
    server = app.getHttpServer();
    const seeded = await seedTenant();
    slug = seeded.tenant.slug;
    tenantId = seeded.tenant.id;
    owner = await login(server, seeded.owner);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  describe('templates', () => {
    it('lists available templates', async () => {
      const res = await owner.agent.get('/api/v1/admin/templates').expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ id: 'cms', version: '1.0.0', installedVersion: null }),
      ]);
    });

    it('requires templates:manage', async () => {
      const editor = await login(server, await seedMember(tenantId, 'editor'));
      await editor.agent.get('/api/v1/admin/templates').expect(403);
    });

    it('installs the CMS template with sample data', async () => {
      const res = await send('post', '/admin/templates/cms/install', { sampleData: true }).expect(
        201,
      );
      expect(res.body.data).toMatchObject({ id: 'cms', installedVersion: '1.0.0' });
      const entities = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
      expect(entities.map((e: { key: string }) => e.key).sort()).toEqual([
        'article',
        'author',
        'category',
        'page',
        'tag',
      ]);
      for (const entity of entities) {
        expect(entity).toMatchObject({ owner: 'template:cms', overridden: false });
        for (const field of entity.fields) expect(field.owner).toBe('template:cms');
      }
      const articles = await owner.agent.get('/api/v1/entities/article/records').expect(200);
      expect(articles.body.meta.total).toBe(2);
    });

    it('cannot be installed twice', async () => {
      const res = await send('post', '/admin/templates/cms/install', {}).expect(409);
      expect(res.body.error.code).toBe('TEMPLATE_INSTALLED');
      await send('post', '/admin/templates/unknown/install', {}).expect(404);
    });

    it('refuses to overwrite existing tenant entities', async () => {
      const other = await login(server, (await seedTenant()).owner);
      await send('post', '/admin/entities', { key: 'article', name: 'Mine' }, other).expect(201);
      const res = await send('post', '/admin/templates/cms/install', {}, other).expect(409);
      expect(res.body.error.code).toBe('TEMPLATE_CONFLICT');
      const keys = (await other.agent.get('/api/v1/admin/entities').expect(200)).body.data.map(
        (e: { key: string }) => e.key,
      );
      expect(keys).toEqual(['article']);
    });

    it('marks template definitions as overridden when the tenant edits them', async () => {
      const entities = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
      const tag = entities.find((e: { key: string }) => e.key === 'tag');
      const res = await send('patch', `/admin/entities/${tag.id}`, {
        description: 'Our own tags',
      }).expect(200);
      expect(res.body.data).toMatchObject({ owner: 'template:cms', overridden: true });
    });
  });

  describe('public API', () => {
    it('lists only published records and only public fields', async () => {
      const res = await pub('/entities/article/records').expect(200);
      expect(res.headers['cache-control']).toContain('public');
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].data).toMatchObject({ title: 'Hello, world', status: 'published' });
      expect(res.body.data[0]).toMatchObject({ createdBy: null, updatedBy: null });

      const authors = await pub('/entities/author/records').expect(200);
      expect(authors.body.data[0].data).not.toHaveProperty('email');
      expect(authors.body.data[0].data.name).toBe('Ada Writer');
    });

    it('hides drafts by id and supports filters, sort and expansion', async () => {
      const all = await owner.agent
        .get('/api/v1/entities/article/records')
        .query({ 'filter[status]': 'draft' })
        .expect(200);
      const draftId = all.body.data[0].id;
      await pub(`/entities/article/records/${draftId}`).expect(404);

      const expanded = await pub('/entities/article/records')
        .query({
          expand: 'author,category,tags',
          'filter[slug]': 'hello-world',
          sort: '-publishedAt',
        })
        .expect(200);
      const article = expanded.body.data[0].data;
      expect(article.author.data).toEqual({
        name: 'Ada Writer',
        slug: 'ada-writer',
        bio: expect.any(String),
        avatar: null,
      });
      expect(article.category.data.slug).toBe('news');
      expect(article.tags.map((t: { data: { slug: string } }) => t.data.slug)).toEqual([
        'announcements',
      ]);

      await pub('/entities/author/records').query({ 'filter[email]': 'x' }).expect(400);
      // The trash is never reachable publicly: the parameter is simply ignored.
      const trash = await pub('/entities/article/records').query({ deleted: 'true' }).expect(200);
      expect(trash.body.data.every((r: { deletedAt: unknown }) => r.deletedAt === null)).toBe(true);
      expect(trash.body.meta.total).toBe(1);
    });

    it('returns 404 for non-public entities, unknown tenants and drafts after unpublishing', async () => {
      await send('post', '/admin/entities', {
        key: 'secret',
        name: 'Secret',
        fields: [{ key: 'x', type: 'text', label: 'X', isPublic: true }],
      }).expect(201);
      await pub('/entities/secret/records').expect(404);
      await request(server)
        .get('/api/v1/public/no-such-tenant/entities/article/records')
        .expect(404);

      const published = (await pub('/entities/article/records').expect(200)).body.data[0];
      await send('patch', `/entities/article/records/${published.id}`, {
        data: { status: 'draft' },
      }).expect(200);
      expect((await pub('/entities/article/records').expect(200)).body.meta.total).toBe(0);
      await send('patch', `/entities/article/records/${published.id}`, {
        data: { status: 'published' },
      }).expect(200);
    });

    it('serves media only when referenced by published public content', async () => {
      const upload = (name: string) =>
        owner.agent
          .post('/api/v1/media')
          .set('x-csrf-token', owner.csrf)
          .attach('file', PNG, { filename: name, contentType: 'image/png' })
          .expect(201);
      const cover = (await upload('cover.png')).body.data;
      const orphan = (await upload('orphan.png')).body.data;
      const published = (await pub('/entities/article/records').expect(200)).body.data[0];
      await send('patch', `/entities/article/records/${published.id}`, {
        data: { coverImage: cover.id },
      }).expect(200);

      const file = await pub(`/media/${cover.id}/file`).buffer(true).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      await pub(`/media/${orphan.id}/file`).expect(404);

      await send('patch', `/entities/article/records/${published.id}`, {
        data: { status: 'draft' },
      }).expect(200);
      await pub(`/media/${cover.id}/file`).expect(404);
    });

    it('never exposes another tenant’s content under this slug', async () => {
      const other = await seedTenant();
      await request(server)
        .get(`/api/v1/public/${other.tenant.slug}/entities/article/records`)
        .expect(404);
    });
  });
});
