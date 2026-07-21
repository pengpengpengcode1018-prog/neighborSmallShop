import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `delivery_admin_${Date.now()}`;
const password = 'DeliveryAdmin123!';
let token = '';
let storeId = '';
let otherStoreId = '';
let slotId = '';

describe('delivery slot administration', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        username,
        displayName: '配送时段测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const stores = await Promise.all([
      prisma.store.create({ data: { name: `${username}店铺`, phone: '1', address: '1' } }),
      prisma.store.create({ data: { name: `${username}其他店`, phone: '2', address: '2' } }),
    ]);
    storeId = stores[0].id;
    otherStoreId = stores[1].id;
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password });
    token = login.body.data.token;
  });

  afterAll(async () => {
    await prisma.deliverySlot.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.operationLog.deleteMany({ where: { admin: { username } } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('requires authentication and keeps at least one delivery mode enabled', async () => {
    await request(createApp().callback())
      .get(`/api/v1/admin/stores/${storeId}/delivery-config`)
      .expect(401);

    const initial = await request(createApp().callback())
      .get(`/api/v1/admin/stores/${storeId}/delivery-config`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(initial.body.data).toMatchObject({
      storeId,
      modes: { asapEnabled: true, scheduledEnabled: true },
      slots: [],
    });

    await request(createApp().callback())
      .put(`/api/v1/admin/stores/${storeId}/delivery-modes`)
      .set('authorization', `Bearer ${token}`)
      .send({ asapEnabled: true, scheduledEnabled: false })
      .expect(200);

    const invalid = await request(createApp().callback())
      .put(`/api/v1/admin/stores/${storeId}/delivery-modes`)
      .set('authorization', `Bearer ${token}`)
      .send({ asapEnabled: false, scheduledEnabled: false })
      .expect(409);
    expect(invalid.body.code).toBe('CONFLICT');
  });

  it('rejects invalid cutoff times and non-positive capacity', async () => {
    const invalidTime = await request(createApp().callback())
      .post(`/api/v1/admin/stores/${storeId}/delivery-slots`)
      .set('authorization', `Bearer ${token}`)
      .send({ deliveryTime: '08:00', cutoffTime: '08:00', maxOrders: 20, sortOrder: 0 })
      .expect(400);
    expect(invalidTime.body.code).toBe('VALIDATION_ERROR');

    await request(createApp().callback())
      .post(`/api/v1/admin/stores/${storeId}/delivery-slots`)
      .set('authorization', `Bearer ${token}`)
      .send({ deliveryTime: '08:00', cutoffTime: '07:30', maxOrders: 0, sortOrder: 0 })
      .expect(400);
  });

  it('creates a daily slot and rejects duplicate delivery times', async () => {
    const created = await request(createApp().callback())
      .post(`/api/v1/admin/stores/${storeId}/delivery-slots`)
      .set('authorization', `Bearer ${token}`)
      .send({
        deliveryTime: '07:00',
        cutoffTime: '06:30',
        maxOrders: 20,
        status: 'ENABLED',
        sortOrder: 10,
      })
      .expect(201);
    slotId = created.body.data.id;

    const duplicate = await request(createApp().callback())
      .post(`/api/v1/admin/stores/${storeId}/delivery-slots`)
      .set('authorization', `Bearer ${token}`)
      .send({ deliveryTime: '07:00', cutoffTime: '06:00', maxOrders: 30, sortOrder: 0 })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');

    const config = await request(createApp().callback())
      .get(`/api/v1/admin/stores/${storeId}/delivery-config`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(config.body.data.slots).toEqual([
      expect.objectContaining({
        id: slotId,
        deliveryTime: '07:00',
        cutoffTime: '06:30',
        maxOrders: 20,
        status: 'ENABLED',
      }),
    ]);
  });

  it('blocks cross-store updates, edits and disables the slot with audit records', async () => {
    await request(createApp().callback())
      .put(`/api/v1/admin/stores/${otherStoreId}/delivery-slots/${slotId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ deliveryTime: '08:00', cutoffTime: '07:30', maxOrders: 30, sortOrder: 5 })
      .expect(404);

    const updated = await request(createApp().callback())
      .put(`/api/v1/admin/stores/${storeId}/delivery-slots/${slotId}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        deliveryTime: '08:00',
        cutoffTime: '07:30',
        maxOrders: 30,
        status: 'ENABLED',
        sortOrder: 5,
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      deliveryTime: '08:00',
      cutoffTime: '07:30',
      maxOrders: 30,
    });

    const disabled = await request(createApp().callback())
      .patch(`/api/v1/admin/stores/${storeId}/delivery-slots/${slotId}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' })
      .expect(200);
    expect(disabled.body.data.status).toBe('DISABLED');

    expect(await prisma.operationLog.count({ where: { admin: { username } } })).toBe(4);
  });
});
