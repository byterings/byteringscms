import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, login, seedMember, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

const R = '/api/v1/entities/product/records';

describe('record engine', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let owner: LoggedIn;
  let tenantId: string;
  let entityId: string;

  const send = (
    as: LoggedIn,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: unknown,
  ) => {
    const req = as.agent[method](path).set('x-csrf-token', as.csrf);
    return body === undefined ? req : req.send(body as object);
  };

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    server = app.getHttpServer();
    const seeded = await seedTenant();
    tenantId = seeded.tenant.id;
    owner = await login(server, seeded.owner);
    const entity = await send(owner, 'post', '/api/v1/admin/entities', {
      key: 'product',
      name: 'Product',
      fields: [
        { key: 'name', type: 'text', label: 'Name', required: true },
        { key: 'sku', type: 'text', label: 'SKU', unique: true },
        { key: 'price', type: 'decimal', label: 'Price', required: true, config: { min: 0 } },
        { key: 'isActive', type: 'boolean', label: 'Active', defaultValue: true },
        { key: 'stock', type: 'integer', label: 'Stock' },
        {
          key: 'tags',
          type: 'multiselect',
          label: 'Tags',
          config: {
            options: [
              { value: 'new', label: 'New' },
              { value: 'sale', label: 'Sale' },
            ],
          },
        },
        {
          key: 'cost',
          type: 'decimal',
          label: 'Cost',
          readMinRole: 'admin',
          writeMinRole: 'admin',
        },
      ],
    }).expect(201);
    entityId = entity.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  describe('vertical slice: Product CRUD through the REST API', () => {
    let recordId: string;

    it('creates a record with defaults applied and values normalized', async () => {
      const res = await send(owner, 'post', R, {
        data: { name: 'Desk lamp', price: 19.9, sku: 'LAMP-1', stock: 4 },
      }).expect(201);
      recordId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        entity: 'product',
        version: 1,
        data: {
          name: 'Desk lamp',
          price: '19.90',
          isActive: true,
          sku: 'LAMP-1',
          stock: 4,
          tags: null,
          cost: null,
        },
      });
    });

    it('reads the record', async () => {
      const res = await owner.agent.get(`${R}/${recordId}`).expect(200);
      expect(res.body.data.data.name).toBe('Desk lamp');
    });

    it('updates the record and increments the version', async () => {
      const res = await send(owner, 'patch', `${R}/${recordId}`, {
        data: { price: '24.50', stock: null },
        version: 1,
      }).expect(200);
      expect(res.body.data).toMatchObject({
        version: 2,
        data: { price: '24.50', stock: null, name: 'Desk lamp' },
      });
    });

    it('rejects stale versions (optimistic concurrency)', async () => {
      const res = await send(owner, 'patch', `${R}/${recordId}`, {
        data: { price: '1.00' },
        version: 1,
      }).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'RECORD_VERSION_CONFLICT',
        details: { currentVersion: 2 },
      });
    });

    it('lists records', async () => {
      const res = await owner.agent.get(R).expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(res.body.data[0].id).toBe(recordId);
    });

    it('soft-deletes, hides, restores and purges', async () => {
      await send(owner, 'delete', `${R}/${recordId}`).expect(204);
      await owner.agent.get(`${R}/${recordId}`).expect(404);
      expect((await owner.agent.get(R).expect(200)).body.meta.total).toBe(0);
      const trash = await owner.agent.get(R).query({ deleted: 'true' }).expect(200);
      expect(trash.body.data[0]).toMatchObject({ id: recordId, deletedAt: expect.any(String) });
      await send(owner, 'post', `${R}/${recordId}/restore`).expect(200);
      await owner.agent.get(`${R}/${recordId}`).expect(200);
      await send(owner, 'delete', `${R}/${recordId}/permanent`).expect(404);
      await send(owner, 'delete', `${R}/${recordId}`).expect(204);
      await send(owner, 'delete', `${R}/${recordId}/permanent`).expect(204);
      await send(owner, 'post', `${R}/${recordId}/restore`).expect(404);
    });
  });

  describe('validation', () => {
    it('rejects invalid data with per-field details', async () => {
      const res = await send(owner, 'post', R, {
        data: { name: '', price: -5, stock: 1.5, tags: ['nope'], bogus: 1 },
      }).expect(422);
      const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
      expect(paths).toEqual(['data.bogus', 'data.name', 'data.price', 'data.stock', 'data.tags']);
    });

    it('requires required fields on create', async () => {
      const res = await send(owner, 'post', R, { data: { name: 'No price' } }).expect(422);
      expect(res.body.error.details).toEqual([
        { path: 'data.price', message: 'This field is required' },
      ]);
    });

    it('does not allow clearing required fields', async () => {
      const created = await send(owner, 'post', R, { data: { name: 'A', price: 1 } }).expect(201);
      await send(owner, 'patch', `${R}/${created.body.data.id}`, { data: { name: null } }).expect(
        422,
      );
    });

    it('returns 404 for unknown entities and records', async () => {
      await owner.agent.get('/api/v1/entities/unknown/records').expect(404);
      await owner.agent.get(`${R}/00000000-0000-4000-8000-000000000000`).expect(404);
      await owner.agent.get('/api/v1/entities/Bad Key!/records').expect(422);
    });
  });

  describe('uniqueness', () => {
    it('enforces unique values case-insensitively and releases them on delete', async () => {
      const first = await send(owner, 'post', R, {
        data: { name: 'A', price: 1, sku: 'UNIQ-1' },
      }).expect(201);
      const dup = await send(owner, 'post', R, {
        data: { name: 'B', price: 1, sku: 'uniq-1' },
      }).expect(409);
      expect(dup.body.error).toMatchObject({ code: 'UNIQUE_VIOLATION' });
      await send(owner, 'delete', `${R}/${first.body.data.id}`).expect(204);
      const second = await send(owner, 'post', R, {
        data: { name: 'B', price: 1, sku: 'uniq-1' },
      }).expect(201);
      // Restoring the first would now collide.
      const restore = await send(owner, 'post', `${R}/${first.body.data.id}/restore`).expect(409);
      expect(restore.body.error.code).toBe('UNIQUE_VIOLATION');
      await send(owner, 'patch', `${R}/${second.body.data.id}`, { data: { sku: 'UNIQ-1' } }).expect(
        200,
      );
    });
  });

  describe('querying', () => {
    beforeAll(async () => {
      const items = [
        { name: 'Alpha chair', price: 50, stock: 5, tags: ['new'] },
        { name: 'Beta table', price: '150.00', stock: 0, isActive: false, tags: ['sale'] },
        { name: 'Gamma lamp', price: 15, stock: 12, tags: ['new', 'sale'] },
        { name: 'Delta 100% cotton_rug', price: 80 },
      ];
      for (const data of items) await send(owner, 'post', R, { data }).expect(201);
    });

    const names = (res: request.Response) =>
      res.body.data.map((r: { data: { name: string } }) => r.data.name);

    it('filters by comparison operators on numbers', async () => {
      const res = await owner.agent
        .get(R)
        .query({ 'filter[price][gte]': '50', sort: 'price' })
        .expect(200);
      expect(names(res)).toEqual(['Alpha chair', 'Delta 100% cotton_rug', 'Beta table']);
    });

    it('filters booleans, ranges and null checks', async () => {
      const inactive = await owner.agent.get(R).query({ 'filter[isActive]': 'false' }).expect(200);
      expect(names(inactive)).toEqual(['Beta table']);
      const range = await owner.agent
        .get(R)
        .query({ 'filter[stock][gt]': '0', 'filter[stock][lt]': '10' })
        .expect(200);
      expect(names(range)).toEqual(['Alpha chair']);
      const noStock = await owner.agent
        .get(R)
        .query({ 'filter[stock][isNull]': 'true', 'filter[name][startsWith]': 'delta' })
        .expect(200);
      expect(names(noStock)).toEqual(['Delta 100% cotton_rug']);
    });

    it('treats LIKE wildcards in user input literally', async () => {
      const res = await owner.agent.get(R).query({ 'filter[name][contains]': '100%' }).expect(200);
      expect(names(res)).toEqual(['Delta 100% cotton_rug']);
      const underscore = await owner.agent
        .get(R)
        .query({ 'filter[name][contains]': 'n_r' })
        .expect(200);
      expect(names(underscore)).toEqual(['Delta 100% cotton_rug']);
      const none = await owner.agent.get(R).query({ 'filter[name][contains]': '_' }).expect(200);
      expect(names(none)).toEqual(['Delta 100% cotton_rug']);
    });

    it('filters multi-value fields with contains and supports in-lists', async () => {
      const sale = await owner.agent
        .get(R)
        .query({ 'filter[tags][contains]': 'sale', sort: 'name' })
        .expect(200);
      expect(names(sale)).toEqual(['Beta table', 'Gamma lamp']);
      const inList = await owner.agent
        .get(R)
        .query({ 'filter[price][in]': '15,50', sort: '-price' })
        .expect(200);
      expect(names(inList)).toEqual(['Alpha chair', 'Gamma lamp']);
    });

    it('searches text fields and paginates with a hard maximum', async () => {
      const search = await owner.agent.get(R).query({ search: 'LAMP' }).expect(200);
      expect(names(search)).toEqual(['Gamma lamp']);
      const page = await owner.agent
        .get(R)
        .query({ 'filter[name][contains]': 'a', sort: 'name', page: 2, pageSize: 2 })
        .expect(200);
      expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2 });
      await owner.agent.get(R).query({ pageSize: 101 }).expect(422);
    });

    it('selects fields', async () => {
      const res = await owner.agent.get(R).query({ fields: 'name', pageSize: 1 }).expect(200);
      expect(Object.keys(res.body.data[0].data)).toEqual(['name']);
      await owner.agent.get(R).query({ fields: 'name,nope' }).expect(400);
    });

    it('rejects unknown fields, bad operators and malformed values', async () => {
      const cases: Record<string, string>[] = [
        { 'filter[nope]': 'x' },
        { 'filter[price][contains]': '1' },
        { 'filter[price][gt]': '1 OR 1=1' },
        { 'filter[stock][eq]': "1'; DROP TABLE records; --" },
        { 'filter[isActive]': 'yes' },
        { "filter[name') OR 1=1 --]": 'x' },
        { sort: 'nope' },
        { sort: 'tags' },
        { sort: 'price;DROP TABLE records' },
      ];
      for (const query of cases) {
        const res = await owner.agent.get(R).query(query);
        expect(res.status, JSON.stringify(query)).toBe(400);
        expect(['INVALID_FILTER', 'INVALID_SORT']).toContain(res.body.error.code);
      }
      // Still intact.
      await owner.agent.get(R).expect(200);
    });

    it('filters on system attributes', async () => {
      const res = await owner.agent
        .get(R)
        .query({ 'filter[createdAt][gte]': '2000-01-01T00:00:00Z', pageSize: 100 })
        .expect(200);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(4);
    });
  });

  describe('field-level permissions', () => {
    it('hides fields below the caller role and forbids writing them', async () => {
      const editor = await login(server, await seedMember(tenantId, 'editor'));
      await send(owner, 'post', R, { data: { name: 'Secret cost', price: 10, cost: 3 } }).expect(
        201,
      );

      const asOwner = await owner.agent.get(R).query({ 'filter[name]': 'Secret cost' }).expect(200);
      expect(asOwner.body.data[0].data.cost).toBe('3.00');

      const asEditor = await editor.agent
        .get(R)
        .query({ 'filter[name]': 'Secret cost' })
        .expect(200);
      expect(asEditor.body.data[0].data).not.toHaveProperty('cost');

      const write = await send(editor, 'post', R, {
        data: { name: 'X', price: 1, cost: 1 },
      }).expect(403);
      expect(write.body.error.code).toBe('FIELD_FORBIDDEN');
      await editor.agent.get(R).query({ 'filter[cost][gt]': '0' }).expect(400);
      await editor.agent.get(R).query({ sort: 'cost' }).expect(400);
      await editor.agent.get(R).query({ fields: 'cost' }).expect(400);
    });

    it('lets viewers read but not write, and only admins restore', async () => {
      const viewer = await login(server, await seedMember(tenantId, 'viewer'));
      const editor = await login(server, await seedMember(tenantId, 'editor'));
      await viewer.agent.get(R).expect(200);
      await send(viewer, 'post', R, { data: { name: 'X', price: 1 } }).expect(403);
      const rec = await send(editor, 'post', R, { data: { name: 'Temp', price: 1 } }).expect(201);
      await send(editor, 'delete', `${R}/${rec.body.data.id}`).expect(204);
      await send(editor, 'post', `${R}/${rec.body.data.id}/restore`).expect(403);
      await editor.agent.get(R).query({ deleted: 'true' }).expect(403);
    });

    it('applies scopes and derived roles to API keys', async () => {
      const reader = await createApiKey(owner, ['records:read']);
      const writer = await createApiKey(owner, ['records:read', 'records:write']);
      const list = await request(server)
        .get(R)
        .set('authorization', `Bearer ${reader.key}`)
        .expect(200);
      expect(list.body.data[0].data).not.toHaveProperty('cost');
      await request(server)
        .post(R)
        .set('authorization', `Bearer ${reader.key}`)
        .send({ data: { name: 'K', price: 1 } })
        .expect(403);
      await request(server)
        .post(R)
        .set('authorization', `Bearer ${writer.key}`)
        .send({ data: { name: 'Via API key', price: 1 } })
        .expect(201);
    });
  });

  describe('metadata changes and stored data', () => {
    it('removes values when a field is deleted and blocks deleting entities with records', async () => {
      const entity = await owner.agent.get(`/api/v1/admin/entities/${entityId}`).expect(200);
      const stock = entity.body.data.fields.find((f: { key: string }) => f.key === 'stock');
      await send(owner, 'delete', `/api/v1/admin/entities/${entityId}/fields/${stock.id}`).expect(
        200,
      );
      const res = await owner.agent.get(R).query({ pageSize: 100 }).expect(200);
      for (const item of res.body.data) expect(item.data).not.toHaveProperty('stock');
      const del = await send(owner, 'delete', `/api/v1/admin/entities/${entityId}`).expect(409);
      expect(del.body.error.code).toBe('ENTITY_HAS_RECORDS');
    });

    it('refuses to make a field unique when duplicates exist', async () => {
      await send(owner, 'post', R, { data: { name: 'Twin', price: 1 } }).expect(201);
      await send(owner, 'post', R, { data: { name: 'twin', price: 1 } }).expect(201);
      const entity = await owner.agent.get(`/api/v1/admin/entities/${entityId}`).expect(200);
      const name = entity.body.data.fields.find((f: { key: string }) => f.key === 'name');
      const res = await send(
        owner,
        'patch',
        `/api/v1/admin/entities/${entityId}/fields/${name.id}`,
        {
          unique: true,
        },
      ).expect(409);
      expect(res.body.error.code).toBe('UNIQUE_CONFLICT_EXISTING');
    });

    it('makes archived entities read-only', async () => {
      const temp = await send(owner, 'post', '/api/v1/admin/entities', {
        key: 'archived-thing',
        name: 'Archived',
        fields: [{ key: 'title', type: 'text', label: 'Title' }],
      }).expect(201);
      await send(owner, 'post', '/api/v1/entities/archived-thing/records', {
        data: { title: 'x' },
      }).expect(201);
      await send(owner, 'patch', `/api/v1/admin/entities/${temp.body.data.id}`, {
        status: 'archived',
      }).expect(200);
      await owner.agent.get('/api/v1/entities/archived-thing/records').expect(200);
      const res = await send(owner, 'post', '/api/v1/entities/archived-thing/records', {
        data: { title: 'y' },
      }).expect(409);
      expect(res.body.error.code).toBe('ENTITY_ARCHIVED');
    });
  });

  describe('tenant isolation (attack matrix)', () => {
    it('denies every cross-tenant record operation', async () => {
      const other = await seedTenant();
      const intruder = await login(server, other.owner);
      // The intruder defines an entity with the same key in their own tenant.
      await send(intruder, 'post', '/api/v1/admin/entities', {
        key: 'product',
        name: 'Product',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      }).expect(201);

      const victim = await send(owner, 'post', R, {
        data: { name: 'Victim item', price: 9 },
      }).expect(201);
      const id = victim.body.data.id;

      const list = await intruder.agent.get(R).query({ pageSize: 100 }).expect(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(id);
      expect(list.body.meta.total).toBe(0);
      await intruder.agent.get(`${R}/${id}`).expect(404);
      await send(intruder, 'patch', `${R}/${id}`, { data: { name: 'pwned' } }).expect(404);
      await send(intruder, 'delete', `${R}/${id}`).expect(404);
      await send(intruder, 'post', `${R}/${id}/restore`).expect(404);
      await send(intruder, 'delete', `${R}/${id}/permanent`).expect(404);
      const byIdFilter = await intruder.agent.get(R).query({ 'filter[id]': id }).expect(200);
      expect(byIdFilter.body.data).toEqual([]);

      const key = await createApiKey(intruder, ['records:read', 'records:write']);
      await request(server).get(`${R}/${id}`).set('authorization', `Bearer ${key.key}`).expect(404);

      const still = await owner.agent.get(`${R}/${id}`).expect(200);
      expect(still.body.data).toMatchObject({ version: 1, data: { name: 'Victim item' } });
    });

    it('keeps unique values independent per tenant', async () => {
      const other = await seedTenant();
      const them = await login(server, other.owner);
      await send(them, 'post', '/api/v1/admin/entities', {
        key: 'product',
        name: 'Product',
        fields: [{ key: 'sku', type: 'text', label: 'SKU', unique: true }],
      }).expect(201);
      await send(owner, 'post', R, { data: { name: 'Mine', price: 1, sku: 'SHARED-SKU' } }).expect(
        201,
      );
      await send(them, 'post', R, { data: { sku: 'SHARED-SKU' } }).expect(201);
    });
  });
});
