import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('readiness returns 503 when the database is unreachable', async () => {
    const broken = await createTestApp({
      DATABASE_URL: 'postgresql://nobody:wrong@localhost:1/none?connect_timeout=1',
    });
    try {
      const res = await request(broken.getHttpServer()).get('/api/v1/health/ready').expect(503);
      expect(res.body).toEqual({ status: 'error', checks: { database: 'down' } });
    } finally {
      await broken.close();
    }
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400 with an error envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('does not expose the x-powered-by header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
