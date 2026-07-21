import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { developmentJwtSecret, parseEnvironment } from '../src/config/env.js';

const secureProductionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://release_user:random-password@mysql:3306/nearby_shop',
  REDIS_URL: 'redis://:random-password@redis:6379',
  JWT_SECRET: '9e3b5a1f74964531957c719b0fd0ab093f748ca1e9f4f902',
};

describe('release security gates', () => {
  it('accepts only exact HTTPS CORS origins in production', () => {
    expect(
      parseEnvironment({
        ...secureProductionEnvironment,
        CORS_ALLOWED_ORIGINS: 'https://www.surroundsmallshops.com',
      }).CORS_ALLOWED_ORIGINS,
    ).toEqual(['https://www.surroundsmallshops.com']);

    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        CORS_ALLOWED_ORIGINS: 'http://www.surroundsmallshops.com',
      }),
    ).toThrow(/exact HTTPS origins/);
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        CORS_ALLOWED_ORIGINS: 'https://*.surroundsmallshops.com',
      }),
    ).toThrow(/exact HTTPS origins/);
  });

  it('rejects development credentials and partial WeChat production configuration', () => {
    expect(() =>
      parseEnvironment({ ...secureProductionEnvironment, JWT_SECRET: developmentJwtSecret }),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        DATABASE_URL: 'mysql://nearby_shop:nearby_shop_dev@mysql:3306/nearby_shop',
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({ ...secureProductionEnvironment, WECHAT_APP_ID: 'only-an-app-id' }),
    ).toThrow(/WECHAT_APP_ID/);
    expect(() =>
      parseEnvironment({ ...secureProductionEnvironment, REDIS_URL: 'redis://redis:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('requires complete real WeChat configuration before formal release', () => {
    expect(() =>
      parseEnvironment({ ...secureProductionEnvironment, WECHAT_MINIPROGRAM_STATE: 'formal' }),
    ).toThrow(/Formal mini program releases/);
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        WECHAT_APP_ID: 'wx-release-app',
        WECHAT_APP_SECRET: 'release-app-secret',
        WECHAT_MCH_ID: 'release-merchant',
        WECHAT_PAY_MERCHANT_SERIAL_NO: 'release-serial',
        WECHAT_PAY_PRIVATE_KEY: 'private-key-from-secret-store',
        WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_release',
        WECHAT_PAY_PUBLIC_KEYS_JSON:
          '{"PUB_KEY_ID_release":"public-key-from-secret-store","PUB_KEY_ID_replacement":"replacement-key-from-secret-store"}',
        WECHAT_PAY_NOTIFY_URL: 'https://example.com/api/v1/payments/wechat/notify',
        WECHAT_PAY_REFUND_NOTIFY_URL: 'https://shop.example.net/api/v1/refunds/wechat/notify',
        WECHAT_SUBSCRIBE_TEMPLATES_JSON: '{"ORDER_PAID":{"templateId":"id"}}',
        WECHAT_MINIPROGRAM_STATE: 'formal',
      }),
    ).toThrow(/real HTTPS endpoint/);
  });

  it('validates rotation-safe WeChat Pay public-key maps', () => {
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        WECHAT_PAY_PUBLIC_KEYS_JSON: '{',
      }),
    ).toThrow(/WECHAT_PAY_PUBLIC_KEYS_JSON/);
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_active',
        WECHAT_PAY_PUBLIC_KEYS_JSON: '{"PUB_KEY_ID_other":"public-key"}',
      }),
    ).toThrow(/must exist/);
    expect(() =>
      parseEnvironment({
        ...secureProductionEnvironment,
        WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_active',
        WECHAT_PAY_PUBLIC_KEYS_JSON: '{"PUB_KEY_ID_active":"public-key"}',
        WECHAT_PAY_PUBLIC_KEY: 'legacy-public-key',
      }),
    ).toThrow(/never both/);
  });

  it('rate-limits authentication separately and returns the stable API envelope', async () => {
    let timestamp = 1_000;
    const app = createApp({
      rateLimitOptions: {
        enabled: true,
        defaultPolicy: { maxRequests: 10, windowMs: 60_000 },
        authPolicy: { maxRequests: 1, windowMs: 60_000 },
        now: () => timestamp,
      },
    }).callback();

    await request(app).post('/api/v1/admin/auth/login').send({}).expect(400);
    const limited = await request(app).post('/api/v1/admin/auth/login').send({}).expect(429);
    expect(limited.body).toEqual({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后重试',
      data: null,
    });
    expect(limited.headers['retry-after']).toBe('60');

    timestamp += 60_000;
    await request(app).post('/api/v1/admin/auth/login').send({}).expect(400);
  });

  it('accepts only bounded request ids and replaces untrusted values', async () => {
    const app = createApp().callback();
    const accepted = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', 'release-check:123')
      .expect(200);
    expect(accepted.headers['x-request-id']).toBe('release-check:123');

    const replaced = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', 'untrusted value with spaces')
      .expect(200);
    expect(replaced.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('accepts JSON only and rejects malformed or oversized request bodies', async () => {
    const app = createApp().callback();
    const unsupported = await request(app)
      .post('/api/v1/admin/auth/login')
      .type('form')
      .send({ username: 'admin' })
      .expect(415);
    expect(unsupported.body.code).toBe('VALIDATION_ERROR');

    const malformed = await request(app)
      .post('/api/v1/admin/auth/login')
      .set('content-type', 'application/json')
      .send('{')
      .expect(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');

    const oversized = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ padding: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(oversized.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
