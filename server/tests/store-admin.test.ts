import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `store_admin_${Date.now()}`;
const password = 'StoreAdminTest123!';
let token = '';
let enabledCommunityId = '';
let secondCommunityId = '';
let disabledCommunityId = '';
let storeId = '';

const input = () => ({
  name: `${username}便利店`,
  phone: '0571-12345678',
  address: '测试路 1 号',
  businessStartTime: '08:00',
  businessEndTime: '22:00',
  minimumOrderAmount: '20.00',
  defaultDeliveryFee: '3.50',
  estimatedDeliveryMinutes: 45,
  status: 'OPEN',
  sortOrder: 10,
  communityIds: [enabledCommunityId],
});

describe('store administration', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        username,
        displayName: '店铺测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const communities = await Promise.all([
      prisma.community.create({
        data: { name: `${username}甲`, city: '测试市', district: '测试区', detailedAddress: '1号' },
      }),
      prisma.community.create({
        data: { name: `${username}乙`, city: '测试市', district: '测试区', detailedAddress: '2号' },
      }),
      prisma.community.create({
        data: {
          name: `${username}停用`,
          city: '测试市',
          district: '测试区',
          detailedAddress: '3号',
          status: 'DISABLED',
        },
      }),
    ]);
    [enabledCommunityId, secondCommunityId, disabledCommunityId] = communities.map(
      (item) => item.id,
    );
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password });
    token = login.body.data.token;
  });

  afterAll(async () => {
    if (storeId) {
      await prisma.storeCommunity.deleteMany({ where: { storeId } });
      await prisma.operationLog.deleteMany({ where: { businessDataId: storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    await prisma.community.deleteMany({
      where: { id: { in: [enabledCommunityId, secondCommunityId, disabledCommunityId] } },
    });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('rejects invalid delivery communities without creating a store', async () => {
    const response = await request(createApp().callback())
      .post('/api/v1/admin/stores')
      .set('authorization', `Bearer ${token}`)
      .send({ ...input(), communityIds: [disabledCommunityId] })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.store.count({ where: { name: input().name } })).toBe(0);
  });

  it('creates and lists a store with two-decimal money strings', async () => {
    const created = await request(createApp().callback())
      .post('/api/v1/admin/stores')
      .set('authorization', `Bearer ${token}`)
      .send(input())
      .expect(201);
    storeId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      minimumOrderAmount: '20.00',
      defaultDeliveryFee: '3.50',
    });

    const list = await request(createApp().callback())
      .get('/api/v1/admin/stores')
      .query({ keyword: username, status: 'OPEN' })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.list[0].communities).toHaveLength(1);
  });

  it('atomically replaces delivery scope, updates status and soft deletes', async () => {
    await request(createApp().callback())
      .put(`/api/v1/admin/stores/${storeId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ ...input(), communityIds: [enabledCommunityId, secondCommunityId] })
      .expect(200);
    expect(await prisma.storeCommunity.count({ where: { storeId } })).toBe(2);

    await request(createApp().callback())
      .patch(`/api/v1/admin/stores/${storeId}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'PAUSED' })
      .expect(200);
    await request(createApp().callback())
      .delete(`/api/v1/admin/stores/${storeId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const deleted = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.status).toBe('DISABLED');
    expect(await prisma.operationLog.count({ where: { businessDataId: storeId } })).toBe(4);
  });
});
