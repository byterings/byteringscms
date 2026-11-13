import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

const v1 = {
  id: 'blog',
  name: 'Blog',
  version: '1.0.0',
  entities: [
    {
      key: 'post',
      name: 'Post',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'body', label: 'Body', type: 'longtext' },
        { key: 'summary', label: 'Summary', type: 'text' },
        { key: 'legacy', label: 'Legacy', type: 'text' },
        { key: 'rating', label: 'Rating', type: 'integer' },
      ],
    },
  ],
};

function v2(overrides: { ratingType?: string } = {}) {
  return {
    ...v1,
    version: '1.1.0',
    changelog: { '1.1.0': 'Adds authors and SEO.', '1.0.0': 'Initial.' },
    entities: [
      {
        key: 'post',
        name: 'Blog post',
        fields: [
          { key: 'title', label: 'Headline', type: 'text', required: true },
          { key: 'body', label: 'Body', type: 'longtext', required: true },
          { key: 'summary', label: 'Short summary', type: 'text' },
          { key: 'rating', label: 'Rating', type: overrides.ratingType ?? 'integer' },
          { key: 'seoTitle', label: 'SEO title', type: 'text' },
          { key: 'author', label: 'Author', type: 'relation', config: { targetEntity: 'author' } },
        ],
      },
      {
        key: 'author',
        name: 'Author',
        fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
      },
    ],
  };
}

describe('template upgrades', () => {
  let app: NestExpressApplication;
  let dir: string;
  let owner: LoggedIn;

  const write = async (manifest: object) => {
    await mkdir(join(dir, 'blog'), { recursive: true });
    await writeFile(join(dir, 'blog', 'template.json'), JSON.stringify(manifest));
  };
  const send = (method: 'post' | 'patch', path: string, body: unknown = {}) =>
    owner.agent[method](`/api/v1${path}`)
      .set('x-csrf-token', owner.csrf)
      .send(body as object);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'byterings-templates-'));
    await write(v1);
    app = await createTestApp({ TENANCY_MODE: 'multi', TEMPLATES_DIR: dir });
    owner = await login(app.getHttpServer(), (await seedTenant()).owner);
    await send('post', '/admin/templates/blog/install').expect(201);

    // Tenant customizations: edit a template field, add an own field, create content.
    const post = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data[0];
    const summary = post.fields.find((f: { key: string }) => f.key === 'summary');
    await send('patch', `/admin/entities/${post.id}/fields/${summary.id}`, {
      label: 'Teaser',
    }).expect(200);
    await send('post', `/admin/entities/${post.id}/fields`, {
      key: 'internalNote',
      type: 'text',
      label: 'Internal note',
    }).expect(201);
    await send('post', '/entities/post/records', {
      data: { title: 'Kept', body: 'Text', legacy: 'old', internalNote: 'mine' },
    }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('reports that an installed template is up to date', async () => {
    const plan = await owner.agent.get('/api/v1/admin/templates/blog/upgrade-plan').expect(200);
    expect(plan.body.data).toMatchObject({ upToDate: true, items: [] });
    const res = await send('post', '/admin/templates/blog/upgrade').expect(409);
    expect(res.body.error.code).toBe('TEMPLATE_UP_TO_DATE');
  });

  it('previews the upgrade without changing anything', async () => {
    await write(v2());
    const res = await owner.agent.get('/api/v1/admin/templates/blog/upgrade-plan').expect(200);
    const plan = res.body.data;
    expect(plan).toMatchObject({
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      upToDate: false,
      breaking: true,
      conflicts: 0,
    });
    expect(plan.changelog).toEqual([{ version: '1.1.0', notes: 'Adds authors and SEO.' }]);
    const summarize = (i: { action: string; entity: string; field?: string }) =>
      `${i.action}:${i.entity}${i.field ? `.${i.field}` : ''}`;
    expect(plan.items.map(summarize).sort()).toEqual(
      [
        'createEntity:author',
        'createField:author.name',
        'updateEntity:post',
        'updateField:post.title',
        'updateField:post.body',
        'skipOverridden:post.summary',
        'createField:post.seoTitle',
        'createField:post.author',
        'deprecated:post.legacy',
      ].sort(),
    );
    expect(plan.items.find((i: { field?: string }) => i.field === 'body').breaking).toBe(true);
    const entities = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
    expect(entities.map((e: { key: string }) => e.key)).toEqual(['post']);
  });

  it('requires accepting breaking changes', async () => {
    const res = await send('post', '/admin/templates/blog/upgrade').expect(409);
    expect(res.body.error.code).toBe('TEMPLATE_UPGRADE_BREAKING');
  });

  it('applies the upgrade while preserving customizations and data', async () => {
    const res = await send('post', '/admin/templates/blog/upgrade', {
      acceptBreaking: true,
    }).expect(200);
    expect(res.body.data.toVersion).toBe('1.1.0');

    const entities = (await owner.agent.get('/api/v1/admin/entities').expect(200)).body.data;
    const post = entities.find((e: { key: string }) => e.key === 'post');
    const author = entities.find((e: { key: string }) => e.key === 'author');
    const field = (key: string) => post.fields.find((f: { key: string }) => f.key === key);
    expect(post).toMatchObject({ name: 'Blog post', owner: 'template:blog', overridden: false });
    expect(field('title')).toMatchObject({
      label: 'Headline',
      owner: 'template:blog',
      overridden: false,
    });
    expect(field('summary')).toMatchObject({ label: 'Teaser', overridden: true });
    expect(field('internalNote')).toMatchObject({ owner: 'tenant' });
    expect(field('legacy')).toBeDefined();
    expect(field('seoTitle')).toMatchObject({ owner: 'template:blog' });
    expect(field('author').config.targetEntityId).toBe(author.id);
    expect(author.owner).toBe('template:blog');

    const records = await owner.agent.get('/api/v1/entities/post/records').expect(200);
    expect(records.body.data[0].data).toMatchObject({
      title: 'Kept',
      legacy: 'old',
      internalNote: 'mine',
    });

    const templates = await owner.agent.get('/api/v1/admin/templates').expect(200);
    expect(templates.body.data[0].installedVersion).toBe('1.1.0');
    const history = await owner.agent.get('/api/v1/admin/templates/blog/upgrades').expect(200);
    expect(history.body.data[0]).toMatchObject({
      status: 'applied',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
    });
  });

  it('blocks type changes as conflicts', async () => {
    await write({ ...v2({ ratingType: 'decimal' }), version: '1.2.0' });
    const plan = await owner.agent.get('/api/v1/admin/templates/blog/upgrade-plan').expect(200);
    expect(plan.body.data.conflicts).toBe(1);
    const res = await send('post', '/admin/templates/blog/upgrade', {
      acceptBreaking: true,
    }).expect(409);
    expect(res.body.error.code).toBe('TEMPLATE_UPGRADE_CONFLICTS');
  });

  it('records failed upgrades and leaves the installation unchanged', async () => {
    // Two posts share a summary... but summary is overridden, so use seoTitle.
    await send('post', '/entities/post/records', {
      data: { title: 'A', body: 'x', seoTitle: 'Same' },
    }).expect(201);
    await send('post', '/entities/post/records', {
      data: { title: 'B', body: 'x', seoTitle: 'same' },
    }).expect(201);
    const manifest = v2();
    manifest.version = '1.3.0';
    (manifest.entities[0]!.fields as { key: string; unique?: boolean }[]).find(
      (f) => f.key === 'seoTitle',
    )!.unique = true;
    await write(manifest);
    const res = await send('post', '/admin/templates/blog/upgrade', {
      acceptBreaking: true,
    }).expect(409);
    expect(res.body.error.code).toBe('UNIQUE_CONFLICT_EXISTING');
    const history = await owner.agent.get('/api/v1/admin/templates/blog/upgrades').expect(200);
    expect(history.body.data[0]).toMatchObject({ status: 'failed', toVersion: '1.3.0' });
    expect(history.body.data[0].report.code).toBe('UNIQUE_CONFLICT_EXISTING');
    const templates = await owner.agent.get('/api/v1/admin/templates').expect(200);
    expect(templates.body.data[0].installedVersion).toBe('1.1.0');
  });

  it('requires the template to be installed', async () => {
    const other = await login(app.getHttpServer(), (await seedTenant()).owner);
    const res = await other.agent.get('/api/v1/admin/templates/blog/upgrade-plan').expect(409);
    expect(res.body.error.code).toBe('TEMPLATE_NOT_INSTALLED');
  });
});
