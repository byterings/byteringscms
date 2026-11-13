import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imageDimensions, sniffMimeType } from '../src/media/file-sniffer';
import { safeFilename } from '../src/media/media.service';
import { LocalStorageDriver } from '../src/media/storage';
import { createApiKey, login, seedMember, seedTenant, type LoggedIn } from './auth-helpers';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';
import { PNG } from './png';

describe('file sniffing', () => {
  it('detects types by content and reads image sizes', () => {
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(imageDimensions(PNG, 'image/png')).toEqual({ width: 1, height: 1 });
    expect(sniffMimeType(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(sniffMimeType(Buffer.from('name,price\nlamp,10\n'))).toBe('text');
    expect(sniffMimeType(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x20, 0x00, 0x10, 0x00])]);
    expect(imageDimensions(gif, 'image/gif')).toEqual({ width: 32, height: 16 });
  });

  it('cleans file names', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\Users\\x\\photo "1".png')).toBe('photo 1.png');
    expect(safeFilename('\u0000')).toBe('file');
  });

  it('keeps local storage inside its root', async () => {
    const driver = new LocalStorageDriver(await mkdtemp(join(tmpdir(), 'byterings-storage-')));
    await expect(driver.put('../escape.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      /Invalid storage key/,
    );
    await expect(driver.put('a/../../b.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow();
  });
});

describe('media library', () => {
  let app: NestExpressApplication;
  let owner: LoggedIn;
  let tenantId: string;

  const upload = (as: LoggedIn, content: Buffer, filename: string, contentType: string) =>
    as.agent
      .post('/api/v1/media')
      .set('x-csrf-token', as.csrf)
      .field('alt', 'Alt text')
      .attach('file', content, { filename, contentType });

  beforeAll(async () => {
    app = await createTestApp({
      TENANCY_MODE: 'multi',
      STORAGE_LOCAL_DIR: await mkdtemp(join(tmpdir(), 'byterings-media-')),
      MEDIA_MAX_BYTES: '4096',
    });
    const seeded = await seedTenant();
    tenantId = seeded.tenant.id;
    owner = await login(app.getHttpServer(), seeded.owner);
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('uploads, lists, downloads, updates and deletes files', async () => {
    const res = await upload(owner, PNG, 'pixel.png', 'image/png').expect(201);
    const media = res.body.data;
    expect(media).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      alt: 'Alt text',
      filename: 'pixel.png',
    });

    const list = await owner.agent.get('/api/v1/media').query({ kind: 'image' }).expect(200);
    expect(list.body.data.map((m: { id: string }) => m.id)).toContain(media.id);

    const file = await owner.agent.get(`/api/v1/media/${media.id}/file`).buffer(true).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    const updated = await owner.agent
      .patch(`/api/v1/media/${media.id}`)
      .set('x-csrf-token', owner.csrf)
      .send({ alt: 'A single pixel' })
      .expect(200);
    expect(updated.body.data.alt).toBe('A single pixel');

    await owner.agent
      .delete(`/api/v1/media/${media.id}`)
      .set('x-csrf-token', owner.csrf)
      .expect(204);
    await owner.agent.get(`/api/v1/media/${media.id}`).expect(404);
  });

  it('rejects disallowed types, spoofed content and oversized files', async () => {
    const svg = await upload(
      owner,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'x.svg',
      'image/svg+xml',
    ).expect(415);
    expect(svg.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const spoofed = await upload(
      owner,
      Buffer.from('<script>alert(1)</script>'),
      'x.png',
      'image/png',
    ).expect(415);
    expect(spoofed.body.error.code).toBe('MEDIA_CONTENT_MISMATCH');
    await upload(owner, Buffer.concat([PNG, Buffer.alloc(5000)]), 'big.png', 'image/png').expect(
      413,
    );
    await owner.agent.post('/api/v1/media').set('x-csrf-token', owner.csrf).expect(422);
  });

  it('enforces permissions and tenant isolation', async () => {
    const res = await upload(owner, PNG, 'mine.png', 'image/png').expect(201);
    const viewer = await login(app.getHttpServer(), await seedMember(tenantId, 'viewer'));
    await viewer.agent.get(`/api/v1/media/${res.body.data.id}`).expect(200);
    await upload(viewer, PNG, 'no.png', 'image/png').expect(403);

    const other = await login(app.getHttpServer(), (await seedTenant()).owner);
    await other.agent.get(`/api/v1/media/${res.body.data.id}`).expect(404);
    await other.agent.get(`/api/v1/media/${res.body.data.id}/file`).expect(404);
    const list = await other.agent.get('/api/v1/media').expect(200);
    expect(list.body.data).toEqual([]);

    const key = await createApiKey(owner, ['media:read']);
    await request(app.getHttpServer())
      .get(`/api/v1/media/${res.body.data.id}`)
      .set('authorization', `Bearer ${key.key}`)
      .expect(200);
  });

  it('validates media references in records', async () => {
    await owner.agent
      .post('/api/v1/admin/entities')
      .set('x-csrf-token', owner.csrf)
      .send({
        key: 'gallery',
        name: 'Gallery',
        fields: [
          { key: 'title', type: 'text', label: 'Title' },
          { key: 'cover', type: 'media', label: 'Cover', config: { accept: ['image'] } },
          {
            key: 'files',
            type: 'media',
            label: 'Files',
            config: { multiple: true, accept: ['document'] },
          },
        ],
      })
      .expect(201);
    const image = (await upload(owner, PNG, 'cover.png', 'image/png').expect(201)).body.data;
    const pdf = (
      await upload(owner, Buffer.from('%PDF-1.4\n%%EOF'), 'doc.pdf', 'application/pdf').expect(201)
    ).body.data;
    const post = (data: object) =>
      owner.agent
        .post('/api/v1/entities/gallery/records')
        .set('x-csrf-token', owner.csrf)
        .send({ data });

    await post({ title: 'ok', cover: image.id, files: [pdf.id] }).expect(201);
    const wrongKind = await post({ cover: pdf.id }).expect(422);
    expect(wrongKind.body.error.details[0].message).toMatch(/image/);
    await post({ cover: '00000000-0000-4000-8000-000000000000' }).expect(422);

    const other = await login(app.getHttpServer(), (await seedTenant()).owner);
    await other.agent
      .post('/api/v1/admin/entities')
      .set('x-csrf-token', other.csrf)
      .send({
        key: 'gallery',
        name: 'Gallery',
        fields: [{ key: 'cover', type: 'media', label: 'Cover' }],
      })
      .expect(201);
    await other.agent
      .post('/api/v1/entities/gallery/records')
      .set('x-csrf-token', other.csrf)
      .send({ data: { cover: image.id } })
      .expect(422);
  });
});
