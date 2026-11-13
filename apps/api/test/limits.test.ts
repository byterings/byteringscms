import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeFixtureDb } from './fixtures';
import { createTestApp } from './helpers';

describe('request limits', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      TENANCY_MODE: 'multi',
      RATE_LIMIT_PER_MINUTE: '20',
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
      MAX_JSON_BODY: '2kb',
    });
  });

  afterAll(async () => {
    await app.close();
    await closeFixtureDb();
  });

  it('throttles repeated login attempts per IP', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.test', password: 'wrong password' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/setup')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(5000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('applies the global rate limit', async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it('sends security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/setup/status');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
