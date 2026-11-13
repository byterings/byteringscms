import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, seedMember, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

describe('relationships', () => {
  let app: NestExpressApplication;
  let owner: LoggedIn;
  let tenantId: string;
  let categoryEntityId: string;
  const ids: Record<string, string> = {};

  const send = (
    as: LoggedIn,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: unknown,
  ) => {
    const req = as.agent[method](`/api/v1${path}`).set('x-csrf-token', as.csrf);
    return body === undefined ? req : req.send(body as object);
  };

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    const seeded = await seedTenant();
    tenantId = seeded.tenant.id;
    owner = await login(app.getHttpServer(), seeded.owner);

    const category = await send(owner, 'post', '/admin/entities', {
      key: 'category',
      name: 'Category',
      pluralName: 'Categories',
      fields: [
        { key: 'title', type: 'text', label: 'Title', required: true },
        { key: 'secret', type: 'text', label: 'Secret', readMinRole: 'admin' },
      ],
    }).expect(201);
    categoryEntityId = category.body.data.id;
    await send(owner, 'post', '/admin/entities', {
      key: 'post',
      name: 'Post',
      fields: [
        { key: 'title', type: 'text', label: 'Title', required: true },
        {
          key: 'category',
          type: 'relation',
          label: 'Category',
          config: { targetEntityId: categoryEntityId },
        },
        {
          key: 'related',
          type: 'relation',
          label: 'Related categories',
          config: { targetEntityId: categoryEntityId, cardinality: 'many' },
        },
      ],
    }).expect(201);

    for (const title of ['News', 'Tech', 'Life']) {
      const res = await send(owner, 'post', '/entities/category/records', {
        data: { title, secret: `${title}-secret` },
      }).expect(201);
      ids[title] = res.body.data.id;
    }
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('links records of the same tenant and expands them', async () => {
    const post = await send(owner, 'post', '/entities/post/records', {
      data: { title: 'Hello', category: ids.News!.toUpperCase(), related: [ids.Tech, ids.Life] },
    }).expect(201);
    expect(post.body.data.data.category).toBe(ids.News);
    ids.post = post.body.data.id;

    const expanded = await owner.agent
      .get(`/api/v1/entities/post/records/${ids.post}`)
      .query({ expand: 'category,related' })
      .expect(200);
    expect(expanded.body.data.data.category).toMatchObject({
      id: ids.News,
      entity: 'category',
      data: { title: 'News' },
    });
    expect(
      expanded.body.data.data.related.map((r: { data: { title: string } }) => r.data.title),
    ).toEqual(['Tech', 'Life']);

    const list = await owner.agent
      .get('/api/v1/entities/post/records')
      .query({ expand: 'category' })
      .expect(200);
    expect(list.body.data[0].data.category.data.title).toBe('News');
  });

  it('applies field permissions to expanded records', async () => {
    const editor = await login(app.getHttpServer(), await seedMember(tenantId, 'editor'));
    const res = await editor.agent
      .get(`/api/v1/entities/post/records/${ids.post}`)
      .query({ expand: 'category' })
      .expect(200);
    expect(res.body.data.data.category.data).toEqual({ title: 'News' });
  });

  it('rejects missing, wrong-entity and deleted targets', async () => {
    const missing = await send(owner, 'post', '/entities/post/records', {
      data: { title: 'X', category: '00000000-0000-4000-8000-000000000000' },
    }).expect(422);
    expect(missing.body.error.details[0]).toMatchObject({ path: 'data.category' });

    // A post id is not a category.
    await send(owner, 'post', '/entities/post/records', {
      data: { title: 'X', category: ids.post },
    }).expect(422);

    const temp = await send(owner, 'post', '/entities/category/records', {
      data: { title: 'Temp' },
    }).expect(201);
    await send(owner, 'delete', `/entities/category/records/${temp.body.data.id}`).expect(204);
    await send(owner, 'post', '/entities/post/records', {
      data: { title: 'X', related: [ids.Tech, temp.body.data.id] },
    }).expect(422);
  });

  it('filters by relation values', async () => {
    const byOne = await owner.agent
      .get('/api/v1/entities/post/records')
      .query({ 'filter[category]': ids.News })
      .expect(200);
    expect(byOne.body.meta.total).toBe(1);
    const byMany = await owner.agent
      .get('/api/v1/entities/post/records')
      .query({ 'filter[related][contains]': ids.Life })
      .expect(200);
    expect(byMany.body.meta.total).toBe(1);
  });

  it('rejects invalid expansions', async () => {
    await owner.agent.get('/api/v1/entities/post/records').query({ expand: 'title' }).expect(400);
    await owner.agent.get('/api/v1/entities/post/records').query({ expand: 'nope' }).expect(400);
    await owner.agent
      .get('/api/v1/entities/post/records')
      .query({ expand: 'a,b,c,d,e,f' })
      .expect(400);
  });

  it('hides soft-deleted targets from expansion and detaches purged ones', async () => {
    const post = await send(owner, 'post', '/entities/post/records', {
      data: { title: 'Detach me', category: ids.Life, related: [ids.Life, ids.Tech] },
    }).expect(201);
    await send(owner, 'delete', `/entities/category/records/${ids.Life}`).expect(204);
    const soft = await owner.agent
      .get(`/api/v1/entities/post/records/${post.body.data.id}`)
      .query({ expand: 'category,related' })
      .expect(200);
    expect(soft.body.data.data.category).toBeNull();
    expect(soft.body.data.data.related.map((r: { id: string }) => r.id)).toEqual([ids.Tech]);

    await send(owner, 'delete', `/entities/category/records/${ids.Life}/permanent`).expect(204);
    const after = await owner.agent
      .get(`/api/v1/entities/post/records/${post.body.data.id}`)
      .expect(200);
    expect(after.body.data.data.category).toBeNull();
    expect(after.body.data.data.related).toEqual([ids.Tech]);
    expect(after.body.data.version).toBe(2);
  });

  it('protects relation metadata that holds data', async () => {
    const entities = await owner.agent.get('/api/v1/admin/entities').expect(200);
    const postEntity = entities.body.data.find((e: { key: string }) => e.key === 'post');
    const categoryField = postEntity.fields.find((f: { key: string }) => f.key === 'category');
    const res = await send(
      owner,
      'patch',
      `/admin/entities/${postEntity.id}/fields/${categoryField.id}`,
      {
        config: { targetEntityId: categoryEntityId, cardinality: 'many' },
      },
    ).expect(409);
    expect(res.body.error.code).toBe('FIELD_HAS_DATA');
    // Label changes are fine.
    await send(owner, 'patch', `/admin/entities/${postEntity.id}/fields/${categoryField.id}`, {
      label: 'Main category',
    }).expect(200);
  });

  it('never links across tenants', async () => {
    const other = await seedTenant();
    const intruder = await login(app.getHttpServer(), other.owner);
    const theirCategory = await send(intruder, 'post', '/admin/entities', {
      key: 'category',
      name: 'Category',
      fields: [{ key: 'title', type: 'text', label: 'Title' }],
    }).expect(201);
    await send(intruder, 'post', '/admin/entities', {
      key: 'post',
      name: 'Post',
      fields: [
        {
          key: 'category',
          type: 'relation',
          label: 'C',
          config: { targetEntityId: theirCategory.body.data.id },
        },
      ],
    }).expect(201);
    // Referencing a record of another tenant is indistinguishable from a missing record.
    const res = await send(intruder, 'post', '/entities/post/records', {
      data: { category: ids.News },
    }).expect(422);
    expect(res.body.error.details[0].message).toBe('Referenced record not found');
  });
});
