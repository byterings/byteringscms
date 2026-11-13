import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

const document = {
  version: 1,
  entities: [
    {
      key: 'category',
      name: 'Category',
      pluralName: 'Categories',
      fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
    },
    {
      key: 'article',
      name: 'Article',
      titleField: 'title',
      publicRead: true,
      publishField: 'status',
      publishValue: 'published',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          defaultValue: 'draft',
          config: {
            options: [
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ],
          },
        },
        {
          key: 'category',
          label: 'Category',
          type: 'relation',
          config: { targetEntity: 'category' },
        },
      ],
    },
  ],
};

describe('configuration as code', () => {
  let app: NestExpressApplication;
  let owner: LoggedIn;

  const post = (as: LoggedIn, path: string, body: unknown) =>
    as.agent
      .post(`/api/v1${path}`)
      .set('x-csrf-token', as.csrf)
      .send(body as object);

  beforeAll(async () => {
    app = await createTestApp({ TENANCY_MODE: 'multi' });
    owner = await login(app.getHttpServer(), (await seedTenant()).owner);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('plans without changing anything (diff is read-only)', async () => {
    const res = await post(owner, '/admin/config/diff', document).expect(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.changes.map((c: { action: string }) => c.action)).toEqual([
      'createEntity',
      'createField',
      'createEntity',
      'createField',
      'createField',
      'createField',
    ]);
    const entities = await owner.agent.get('/api/v1/admin/entities').expect(200);
    expect(entities.body.data).toEqual([]);
  });

  it('applies a document atomically, including relations by key', async () => {
    const res = await post(owner, '/admin/config/apply', document).expect(200);
    expect(res.body.data.applied).toBe(true);
    const entities = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
    const article = entities.find((e: { key: string }) => e.key === 'article');
    const category = entities.find((e: { key: string }) => e.key === 'category');
    expect(article).toMatchObject({
      publicRead: true,
      publishField: 'status',
      publishValue: 'published',
    });
    expect(
      article.fields.find((f: { key: string }) => f.key === 'category').config.targetEntityId,
    ).toBe(category.id);
  });

  it('round-trips: export then diff yields no changes', async () => {
    const exported = await owner.agent.get('/api/v1/admin/config/export').expect(200);
    expect(JSON.stringify(exported.body.data)).not.toContain('targetEntityId');
    const diff = await post(owner, '/admin/config/diff', exported.body.data).expect(200);
    expect(diff.body.data.changes).toEqual([]);
    const original = await post(owner, '/admin/config/diff', document).expect(200);
    expect(original.body.data.changes).toEqual([]);
  });

  it('reports updates with changed attributes', async () => {
    const changed = structuredClone(document);
    changed.entities[1]!.name = 'News article';
    changed.entities[1]!.fields[0]!.label = 'Headline';
    const res = await post(owner, '/admin/config/diff', changed).expect(200);
    expect(res.body.data.changes).toEqual([
      {
        action: 'updateField',
        entity: 'article',
        field: 'title',
        changes: ['label'],
        destructive: false,
      },
      // pluralName is not declared, so its default (name + "s") changes too.
      {
        action: 'updateEntity',
        entity: 'article',
        changes: ['name', 'pluralName'],
        destructive: false,
      },
    ]);
    await post(owner, '/admin/config/apply', changed).expect(200);
  });

  it('requires confirmation for destructive changes and refuses type changes', async () => {
    const pruned = { version: 1, entities: [document.entities[0]] };
    const plan = await owner.agent
      .post('/api/v1/admin/config/diff?prune=true')
      .set('x-csrf-token', owner.csrf)
      .send(pruned)
      .expect(200);
    expect(plan.body.data.destructive).toBe(true);
    const refused = await post(owner, '/admin/config/apply', { ...pruned, prune: true }).expect(
      409,
    );
    expect(refused.body.error.code).toBe('DESTRUCTIVE_CHANGES');
    // Without prune, undeclared entities are left alone.
    const safe = await post(owner, '/admin/config/diff', pruned).expect(200);
    expect(safe.body.data.destructive).toBe(false);

    const typeChange = structuredClone(document);
    typeChange.entities[0]!.fields[0]!.type = 'integer';
    const conflict = await post(owner, '/admin/config/apply', typeChange).expect(409);
    expect(conflict.body.error.code).toBe('CONFIG_CONFLICTS');
  });

  it('rolls back everything when one change fails', async () => {
    await owner.agent
      .post('/api/v1/entities/category/records')
      .set('x-csrf-token', owner.csrf)
      .send({ data: { title: 'Kept' } })
      .expect(201);
    // Deleting "category" fails (it has records and is referenced) - the
    // new "tag" entity in the same document must not be created either.
    const doc = {
      version: 1,
      entities: [{ key: 'tag', name: 'Tag', fields: [] }],
      prune: true,
      confirmDestructive: true,
    };
    const res = await post(owner, '/admin/config/apply', doc);
    expect(res.status).toBe(409);
    const keys = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data.map(
      (e: { key: string }) => e.key,
    );
    expect(keys.sort()).toEqual(['article', 'category']);
  });

  it('rejects unknown relation targets', async () => {
    const res = await post(owner, '/admin/config/diff', {
      version: 1,
      entities: [
        {
          key: 'x',
          name: 'X',
          fields: [{ key: 'r', label: 'R', type: 'relation', config: { targetEntity: 'nope' } }],
        },
      ],
    }).expect(200);
    expect(res.body.data.conflicts[0].message).toMatch(/Unknown target entity/);
  });
});
