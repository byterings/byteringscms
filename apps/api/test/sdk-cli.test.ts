/**
 * The SDK and CLI against a real, listening API: a separate client can use
 * the platform without any Admin Studio internals (Phase 6 acceptance).
 */
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { diffSchema, exportSchema, pushSchema, writeTypes } from '@bytecontent/cli';
import { createClient, PlatformError, type PlatformClient } from '@bytecontent/sdk';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, login, seedTenant } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

interface Product extends Record<string, unknown> {
  name: string;
  price: string;
  tags: string[] | null;
}

describe('SDK and CLI', () => {
  let app: NestExpressApplication;
  let client: PlatformClient;
  let dir: string;

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const owner = await login(app.getHttpServer(), (await seedTenant()).owner);
    const key = await createApiKey(owner, [
      'metadata:read',
      'metadata:write',
      'records:read',
      'records:write',
    ]);
    client = createClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: key.key });
    dir = await mkdtemp(join(tmpdir(), 'bytecontent-project-'));
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('pushes schema files written by hand', async () => {
    await writeFile(join(dir, 'placeholder.txt'), 'schema files live in ./entities');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'entities'));
    await writeFile(
      join(dir, 'entities', 'product.json'),
      JSON.stringify({
        key: 'product',
        name: 'Product',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'price', label: 'Price', type: 'decimal', required: true, config: { min: 0 } },
          {
            key: 'tags',
            label: 'Tags',
            type: 'multiselect',
            config: {
              options: [
                { value: 'new', label: 'New' },
                { value: 'sale', label: 'Sale' },
              ],
            },
          },
        ],
      }),
    );
    const plan = await diffSchema(client, dir);
    expect(plan.changes.map((c) => c.action)).toEqual([
      'createEntity',
      'createField',
      'createField',
      'createField',
    ]);

    const log: string[] = [];
    await expect(pushSchema(client, dir, { log: (l) => log.push(l) })).rejects.toThrow(/Aborted/);
    await pushSchema(client, dir, { yes: true, log: (l) => log.push(l) });
    expect(log.join('\n')).toContain('Applied 4 change(s)');
    expect((await diffSchema(client, dir)).changes).toEqual([]);
  });

  it('exports the schema back to files (round trip)', async () => {
    const files = await exportSchema(client, dir);
    expect(files).toEqual(['product.json']);
    const exported = JSON.parse(await readFile(join(dir, 'entities', 'product.json'), 'utf8'));
    expect(exported).toMatchObject({ key: 'product', pluralName: 'Products', titleField: 'name' });
    expect((await diffSchema(client, dir)).changes).toEqual([]);
  });

  it('refuses destructive pushes unless explicitly allowed', async () => {
    const path = join(dir, 'entities', 'product.json');
    const entity = JSON.parse(await readFile(path, 'utf8'));
    entity.fields = entity.fields.filter((f: { key: string }) => f.key !== 'tags');
    await writeFile(path, JSON.stringify(entity));
    await expect(pushSchema(client, dir, { prune: true, yes: true })).rejects.toThrow(
      /allow-destructive/,
    );
    const applied = await pushSchema(client, dir, {
      prune: true,
      yes: true,
      allowDestructive: true,
    });
    expect(applied.changes).toEqual([
      { action: 'deleteField', entity: 'product', field: 'tags', destructive: true },
    ]);
  });

  it('works with typed records through the SDK', async () => {
    const products = client.records<Product>('product');
    const created = await products.create({ name: 'Lamp', price: '12.5' });
    expect(created.data.price).toBe('12.50');
    const updated = await products.update(
      created.id,
      { price: '15.00' },
      { version: created.version },
    );
    expect(updated.version).toBe(2);
    await expect(products.update(created.id, { price: '1' }, { version: 1 })).rejects.toMatchObject(
      {
        code: 'RECORD_VERSION_CONFLICT',
      },
    );
    const page = await products.list({ filter: { price: { gte: 10 } }, sort: ['-price'] });
    expect(page.data.map((r) => r.data.name)).toEqual(['Lamp']);
    const all = [];
    for await (const record of client.iterate<Product>('product', { pageSize: 1 }))
      all.push(record);
    expect(all).toHaveLength(1);
    await products.delete(created.id);
    await expect(products.get(created.id)).rejects.toBeInstanceOf(PlatformError);
  });

  it('generates TypeScript types', async () => {
    const out = join(dir, 'types', 'platform-types.ts');
    await writeTypes(client, out);
    const source = await readFile(out, 'utf8');
    expect(source).toContain('export interface Product {');
    expect(source).toContain('  price: string;');
    expect(await readdir(join(dir, 'types'))).toEqual(['platform-types.ts']);
  });

  it('fetches the tenant OpenAPI document', async () => {
    const doc = (await client.openapi.tenant()) as {
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.components.schemas.ProductRecord).toBeDefined();
  });
});
