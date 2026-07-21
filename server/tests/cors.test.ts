import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const adminOrigin = 'https://www.surroundsmallshops.com';

describe('CORS boundary', () => {
  it('allows only the configured admin origin without using a wildcard', async () => {
    const response = await request(createApp({ corsAllowedOrigins: [adminOrigin] }).callback())
      .get('/api/v1/health')
      .set('Origin', adminOrigin)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(adminOrigin);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers.vary).toContain('Origin');
  });

  it('answers an allowed authorization preflight without entering API routing', async () => {
    const response = await request(createApp({ corsAllowedOrigins: [adminOrigin] }).callback())
      .options('/api/v1/admin/operations/dashboard')
      .set('Origin', adminOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-request-id')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(adminOrigin);
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
  });

  it('rejects an origin outside the allowlist with the stable API envelope', async () => {
    const response = await request(createApp({ corsAllowedOrigins: [adminOrigin] }).callback())
      .get('/api/v1/health')
      .set('Origin', 'https://attacker.example')
      .expect(403);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: '该页面来源不允许访问接口',
      data: null,
    });
  });
});
