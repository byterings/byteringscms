import { describe, expect, it, vi } from 'vitest';
import { createClient, listQuery, PlatformError } from './client';
import { generateTypes } from './codegen';

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('listQuery', () => {
  it('serializes filters, sort, fields and expansion', () => {
    expect(
      listQuery({
        page: 2,
        sort: ['-price', 'name'],
        fields: ['name'],
        expand: ['category'],
        filter: {
          isActive: true,
          price: { gte: 10, lt: 100 },
          tags: { contains: 'sale' },
          id: { in: ['a', 'b'] },
        },
      }),
    ).toMatchObject({
      page: '2',
      sort: '-price,name',
      fields: 'name',
      expand: 'category',
      'filter[isActive]': 'true',
      'filter[price][gte]': '10',
      'filter[price][lt]': '100',
      'filter[tags][contains]': 'sale',
      'filter[id][in]': 'a,b',
    });
  });
});

describe('PlatformClient', () => {
  it('sends the API key and builds record URLs', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        reply(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }),
      );
    const client = createClient({
      baseUrl: 'https://cms.test/',
      apiKey: 'bcms_x_y',
      fetch: fetchImpl,
    });
    await client.records('product').list({ filter: { name: { contains: 'lamp' } } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://cms.test/api/v1/entities/product/records?filter%5Bname%5D%5Bcontains%5D=lamp',
    );
    expect(init.headers.authorization).toBe('Bearer bcms_x_y');
  });

  it('throws PlatformError with the API error code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reply(409, {
        error: {
          code: 'RECORD_VERSION_CONFLICT',
          message: 'stale',
          details: { currentVersion: 3 },
        },
      }),
    );
    const client = createClient({ baseUrl: 'https://cms.test', fetch: fetchImpl });
    const error = await client
      .records('product')
      .update('id', { a: 1 }, { version: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({
      status: 409,
      code: 'RECORD_VERSION_CONFLICT',
      details: { currentVersion: 3 },
    });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ data: { a: 1 }, version: 1 });
  });

  it('iterates over all pages', async () => {
    const page = (n: number, totalPages: number) =>
      reply(200, {
        data: [{ id: `r${n}` }],
        meta: { page: n, pageSize: 1, total: totalPages, totalPages },
      });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(1, 3))
      .mockResolvedValueOnce(page(2, 3))
      .mockResolvedValueOnce(page(3, 3));
    const client = createClient({ baseUrl: 'https://cms.test', fetch: fetchImpl });
    const ids: string[] = [];
    for await (const record of client.iterate('product', { pageSize: 1 })) ids.push(record.id);
    expect(ids).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('generateTypes', () => {
  it('emits interfaces for entities', () => {
    const source = generateTypes([
      {
        id: '1',
        key: 'blog-post',
        name: 'Blog post',
        pluralName: 'Blog posts',
        description: null,
        titleField: 'title',
        publicRead: false,
        publishField: null,
        publishValue: null,
        status: 'active',
        owner: 'tenant',
        overridden: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
        fields: [
          {
            id: 'a',
            entityId: '1',
            key: 'title',
            label: 'Title',
            type: 'text',
            description: null,
            required: true,
            unique: false,
            isPublic: false,
            readMinRole: 'viewer',
            writeMinRole: 'editor',
            defaultValue: null,
            config: {},
            position: 0,
            owner: 'tenant',
            overridden: false,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'b',
            entityId: '1',
            key: 'status',
            label: 'Status',
            type: 'select',
            description: null,
            required: false,
            unique: false,
            isPublic: false,
            readMinRole: 'viewer',
            writeMinRole: 'editor',
            defaultValue: null,
            config: {
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'live', label: 'Live' },
              ],
            },
            position: 1,
            owner: 'tenant',
            overridden: false,
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
    ]);
    expect(source).toContain('export interface BlogPost {');
    expect(source).toContain('  title: string;');
    expect(source).toContain('  status: "draft" | "live" | null;');
    expect(source).toContain('"blog-post": BlogPost;');
  });
});
