import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, login, seedMember, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';
import request from 'supertest';

const productFields = [
  { key: 'name', type: 'text', label: 'Name', required: true },
  { key: 'price', type: 'decimal', label: 'Price', required: true, config: { min: 0, scale: 2 } },
  { key: 'isActive', type: 'boolean', label: 'Active', defaultValue: true },
];

describe('metadata engine', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let owner: LoggedIn;
  let tenantId: string;

  const post = (path: string, body: unknown, as: LoggedIn = owner) =>
    as.agent
      .post(`/api/v1${path}`)
      .set('x-csrf-token', as.csrf)
      .send(body as object);
  const patch = (path: string, body: unknown, as: LoggedIn = owner) =>
    as.agent
      .patch(`/api/v1${path}`)
      .set('x-csrf-token', as.csrf)
      .send(body as object);
  const del = (path: string, as: LoggedIn = owner) =>
    as.agent.delete(`/api/v1${path}`).set('x-csrf-token', as.csrf);

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    server = app.getHttpServer();
    const seeded = await seedTenant();
    tenantId = seeded.tenant.id;
    owner = await login(server, seeded.owner);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('creates an entity with fields (vertical slice step 5-7)', async () => {
    const res = await post('/admin/entities', {
      key: 'product',
      name: 'Product',
      fields: productFields,
    }).expect(201);
    const entity = res.body.data;
    expect(entity).toMatchObject({
      key: 'product',
      name: 'Product',
      pluralName: 'Products',
      titleField: 'name',
      version: 1,
      status: 'active',
    });
    expect(entity.fields.map((f: { key: string }) => f.key)).toEqual(['name', 'price', 'isActive']);
    expect(entity.fields[1].config).toEqual({ min: 0, scale: 2 });
    expect(entity.fields[2].defaultValue).toBe(true);
  });

  it('rejects duplicate entity keys', async () => {
    const res = await post('/admin/entities', { key: 'product', name: 'Again' }).expect(409);
    expect(res.body.error.code).toBe('ENTITY_KEY_TAKEN');
  });

  it('rejects invalid definitions with field-level details', async () => {
    const bad = await post('/admin/entities', {
      key: 'Bad Key',
      name: 'X',
    }).expect(422);
    expect(bad.body.error.details[0].path).toBe('key');

    const res = await post('/admin/entities', {
      key: 'broken',
      name: 'Broken',
      fields: [{ key: 'qty', type: 'integer', label: 'Qty', config: { min: 10, max: 1 } }],
    }).expect(422);
    expect(res.body.error.details[0].path).toBe('config.min');

    const reserved = await post('/admin/entities', {
      key: 'broken2',
      name: 'Broken',
      fields: [{ key: 'id', type: 'text', label: 'Id' }],
    }).expect(422);
    expect(reserved.body.error.code).toBe('VALIDATION_FAILED');

    const badDefault = await post('/admin/entities', {
      key: 'broken3',
      name: 'Broken',
      fields: [{ key: 'qty', type: 'integer', label: 'Qty', defaultValue: 'many' }],
    }).expect(422);
    expect(badDefault.body.error.details[0].path).toBe('defaultValue');

    const badUnique = await post('/admin/entities', {
      key: 'broken4',
      name: 'Broken',
      fields: [{ key: 'flag', type: 'boolean', label: 'Flag', unique: true }],
    }).expect(422);
    expect(badUnique.body.error.details[0].path).toBe('unique');

    const unknownConfig = await post('/admin/entities', {
      key: 'broken5',
      name: 'Broken',
      fields: [{ key: 'name', type: 'text', label: 'Name', config: { regex: '.*' } }],
    }).expect(422);
    expect(unknownConfig.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('adds, updates, reorders and removes fields with version history', async () => {
    const created = await post('/admin/entities', {
      key: 'article',
      name: 'Article',
      fields: [{ key: 'title', type: 'text', label: 'Title', required: true }],
    }).expect(201);
    const id = created.body.data.id;

    const added = await post(`/admin/entities/${id}/fields`, {
      key: 'status',
      type: 'select',
      label: 'Status',
      config: {
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'published', label: 'Published' },
        ],
      },
      defaultValue: 'draft',
    }).expect(201);
    const statusField = added.body.data.fields.find((f: { key: string }) => f.key === 'status');
    expect(statusField.defaultValue).toBe('draft');

    await post(`/admin/entities/${id}/fields`, { key: 'title', type: 'text', label: 'Dup' }).expect(
      409,
    );

    const updated = await patch(`/admin/entities/${id}/fields/${statusField.id}`, {
      label: 'Publication status',
      isPublic: true,
    }).expect(200);
    expect(updated.body.data.fields[1]).toMatchObject({
      label: 'Publication status',
      isPublic: true,
      type: 'select',
    });

    await patch(`/admin/entities/${id}/fields/${statusField.id}`, {
      defaultValue: 'archived',
    }).expect(422);

    const publish = await patch(`/admin/entities/${id}`, {
      publicRead: true,
      publishField: 'status',
      publishValue: 'published',
    }).expect(200);
    expect(publish.body.data).toMatchObject({
      publicRead: true,
      publishField: 'status',
      publishValue: 'published',
    });
    await patch(`/admin/entities/${id}`, { publishValue: 'nope' }).expect(422);

    const inUse = await del(`/admin/entities/${id}/fields/${statusField.id}`).expect(409);
    expect(inUse.body.error.code).toBe('FIELD_IN_USE');

    const fieldIds = publish.body.data.fields.map((f: { id: string }) => f.id).reverse();
    const reordered = await post(`/admin/entities/${id}/fields/reorder`, { fieldIds }).expect(200);
    expect(reordered.body.data.fields.map((f: { key: string }) => f.key)).toEqual([
      'status',
      'title',
    ]);

    const versions = await owner.agent.get(`/api/v1/admin/entities/${id}/versions`).expect(200);
    const actions = versions.body.data.map((v: { action: string }) => v.action);
    expect(actions).toEqual([
      'fields.reordered',
      'entity.updated',
      'field.updated',
      'field.created',
      'entity.created',
    ]);
    expect(versions.body.data[0].version).toBe(reordered.body.data.version);
  });

  it('validates relation targets within the tenant', async () => {
    const product = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data.find(
      (e: { key: string }) => e.key === 'product',
    );
    await post('/admin/entities', {
      key: 'order',
      name: 'Order',
      fields: [
        {
          key: 'product',
          type: 'relation',
          label: 'Product',
          config: { targetEntityId: product.id },
        },
      ],
    }).expect(201);
    const missing = await post('/admin/entities', {
      key: 'order2',
      name: 'Order',
      fields: [
        {
          key: 'product',
          type: 'relation',
          label: 'Product',
          config: { targetEntityId: '00000000-0000-4000-8000-000000000000' },
        },
      ],
    }).expect(422);
    expect(missing.body.error.details[0].path).toBe('config.targetEntityId');

    const referenced = await del(`/admin/entities/${product.id}`).expect(409);
    expect(referenced.body.error.code).toBe('ENTITY_REFERENCED');
  });

  it('deletes entities', async () => {
    const created = await post('/admin/entities', { key: 'temp', name: 'Temp' }).expect(201);
    await del(`/admin/entities/${created.body.data.id}`).expect(204);
    await owner.agent.get(`/api/v1/admin/entities/${created.body.data.id}`).expect(404);
  });

  it('lets viewers read but not change metadata', async () => {
    const viewer = await login(server, await seedMember(tenantId, 'viewer'));
    const list = await viewer.agent.get('/api/v1/admin/entities').expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    await post('/admin/entities', { key: 'nope', name: 'Nope' }, viewer).expect(403);
  });

  it('allows API keys with metadata scopes', async () => {
    const key = await createApiKey(owner, ['metadata:read', 'metadata:write']);
    await request(server)
      .post('/api/v1/admin/entities')
      .set('authorization', `Bearer ${key.key}`)
      .send({ key: 'via-key', name: 'Via key' })
      .expect(201);
    const readOnly = await createApiKey(owner, ['metadata:read']);
    await request(server)
      .post('/api/v1/admin/entities')
      .set('authorization', `Bearer ${readOnly.key}`)
      .send({ key: 'via-key2', name: 'Via key' })
      .expect(403);
  });

  it('isolates metadata between tenants', async () => {
    const other = await seedTenant();
    const otherOwner = await login(server, other.owner);
    const mine = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
    const theirs = (await otherOwner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
    expect(theirs).toEqual([]);
    const product = mine.find((e: { key: string }) => e.key === 'product');
    await otherOwner.agent.get(`/api/v1/admin/entities/${product.id}`).expect(404);
    await patch(`/admin/entities/${product.id}`, { name: 'Hacked' }, otherOwner).expect(404);
    await del(`/admin/entities/${product.id}`, otherOwner).expect(404);
    await post(
      `/admin/entities/${product.id}/fields`,
      { key: 'x', type: 'text', label: 'X' },
      otherOwner,
    ).expect(404);
    await patch(
      `/admin/entities/${product.id}/fields/${product.fields[0].id}`,
      { label: 'X' },
      otherOwner,
    ).expect(404);
    // The same entity key can exist independently in another tenant.
    await post('/admin/entities', { key: 'product', name: 'Their product' }, otherOwner).expect(
      201,
    );
    // Relation targets must be in the caller's tenant.
    await post(
      '/admin/entities',
      {
        key: 'steal',
        name: 'Steal',
        fields: [
          { key: 'p', type: 'relation', label: 'P', config: { targetEntityId: product.id } },
        ],
      },
      otherOwner,
    ).expect(422);
  });

  it('lists the field type registry', async () => {
    const res = await owner.agent.get('/api/v1/admin/field-types').expect(200);
    expect(res.body.data.map((t: { type: string }) => t.type)).toContain('decimal');
  });
});
