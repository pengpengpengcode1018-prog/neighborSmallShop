import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { getHealthSnapshot, getReadinessSnapshot } from '../src/services/health.service.js';

describe('health endpoint', () => {
  it('returns the unified success envelope', async () => {
    const response = await request(createApp().callback()).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toBeTypeOf('string');
    expect(response.body).toMatchObject({
      code: 0,
      message: 'success',
      data: {
        service: 'nearby-shop-server',
        status: 'ok',
        version: '0.1.0',
      },
    });
    expect(new Date(response.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns the unified failure envelope for unknown routes', async () => {
    const response = await request(createApp().callback()).get('/api/v1/missing').expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: '请求的资源不存在',
      data: null,
    });
  });

  it('reports MySQL and Redis readiness separately from liveness', async () => {
    const response = await request(createApp().callback()).get('/api/v1/ready').expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      message: 'success',
      data: {
        service: 'nearby-shop-server',
        status: 'ready',
        dependencies: {
          database: 'ready',
          redis: 'ready',
        },
      },
    });
    expect(new Date(response.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('marks a failed dependency unavailable without changing the liveness contract', async () => {
    const snapshot = await getReadinessSnapshot({
      database: async () => {
        throw new Error('database unavailable');
      },
      redis: async () => undefined,
    });

    expect(snapshot).toMatchObject({
      status: 'unavailable',
      dependencies: {
        database: 'unavailable',
        redis: 'ready',
      },
    });
    expect(getHealthSnapshot()).toMatchObject({ status: 'ok' });
  });
});
