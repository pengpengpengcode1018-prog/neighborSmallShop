import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const communityIds: string[] = [];
const storeIds: string[] = [];
let enabledCommunityId = '';
let disabledCommunityId = '';
let deletedCommunityId = '';
let otherCommunityId = '';
let openStoreId = '';
let pausedStoreId = '';
let relationPausedStoreId = '';
let otherCommunityStoreId = '';
let disabledStoreId = '';
let deletedStoreId = '';

const app = () => createApp().callback();

function storeData(name: string, sortOrder: number) {
  return {
    name: `${name}_${runId}`,
    phone: '13800000000',
    address: '测试路 1 号',
    description: `${name}详情`,
    announcement: `${name}公告`,
    businessStartTime: '08:30',
    businessEndTime: '21:30',
    minimumOrderAmount: '20.00',
    defaultDeliveryFee: '4.00',
    estimatedDeliveryMinutes: 45,
    sortOrder,
  };
}

describe('resident store browsing', () => {
  beforeAll(async () => {
    const communities = await Promise.all([
      prisma.community.create({
        data: {
          name: `可配送小区_${runId}`,
          city: '测试市',
          district: '一区',
          detailedAddress: '配送路 1 号',
          sortOrder: 20,
        },
      }),
      prisma.community.create({
        data: {
          name: `其他小区_${runId}`,
          city: '测试市',
          district: '二区',
          detailedAddress: '其他路 2 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `停用小区_${runId}`,
          city: '测试市',
          district: '三区',
          detailedAddress: '停用路 3 号',
          status: 'DISABLED',
        },
      }),
      prisma.community.create({
        data: {
          name: `删除小区_${runId}`,
          city: '测试市',
          district: '四区',
          detailedAddress: '删除路 4 号',
          status: 'DISABLED',
          deletedAt: new Date(),
        },
      }),
    ]);
    communityIds.push(...communities.map((community) => community.id));
    [enabledCommunityId, otherCommunityId, disabledCommunityId, deletedCommunityId] =
      communities.map((community) => community.id);

    const stores = await Promise.all([
      prisma.store.create({
        data: {
          ...storeData('阳光生鲜', 60),
          logoUrl: 'https://example.test/logo.png',
          coverUrl: 'https://example.test/cover.png',
          communities: {
            create: [
              {
                communityId: enabledCommunityId,
                minimumOrderAmountOverride: '35.50',
                deliveryFeeOverride: '2.50',
                estimatedDeliveryMinutesOverride: 25,
              },
              { communityId: otherCommunityId },
            ],
          },
        },
      }),
      prisma.store.create({
        data: {
          ...storeData('暂停接单店', 50),
          status: 'PAUSED',
          communities: { create: { communityId: enabledCommunityId } },
        },
      }),
      prisma.store.create({
        data: {
          ...storeData('暂停配送店', 40),
          communities: {
            create: { communityId: enabledCommunityId, status: 'PAUSED' },
          },
        },
      }),
      prisma.store.create({
        data: {
          ...storeData('异地配送店', 30),
          communities: { create: { communityId: otherCommunityId } },
        },
      }),
      prisma.store.create({
        data: {
          ...storeData('平台停用店', 20),
          status: 'DISABLED',
          communities: { create: { communityId: enabledCommunityId } },
        },
      }),
      prisma.store.create({
        data: {
          ...storeData('已经删除店', 10),
          status: 'DISABLED',
          deletedAt: new Date(),
          communities: { create: { communityId: enabledCommunityId } },
        },
      }),
    ]);
    storeIds.push(...stores.map((store) => store.id));
    [
      openStoreId,
      pausedStoreId,
      relationPausedStoreId,
      otherCommunityStoreId,
      disabledStoreId,
      deletedStoreId,
    ] = stores.map((store) => store.id);
  });

  afterAll(async () => {
    await prisma.storeCommunity.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.$disconnect();
  });

  it('lets guests browse open and paused stores without implying delivery or ordering', async () => {
    const response = await request(app()).get('/api/v1/stores').expect(200);
    const matching = response.body.data.list.filter((store: { name: string }) =>
      store.name.endsWith(runId),
    );

    expect(matching.map((store: { id: string }) => store.id)).toEqual([
      openStoreId,
      pausedStoreId,
      relationPausedStoreId,
      otherCommunityStoreId,
    ]);
    expect(matching[0]).toMatchObject({
      id: openStoreId,
      status: 'OPEN',
      minimumOrderAmount: '20.00',
      deliveryFee: '4.00',
      estimatedDeliveryMinutes: 45,
      isDeliverable: false,
      canOrder: false,
    });
    expect(matching[0].deliveryCommunities.map((item: { id: string }) => item.id)).toEqual([
      enabledCommunityId,
      otherCommunityId,
    ]);
    expect(JSON.stringify(matching)).not.toContain('sortOrder');
    expect(JSON.stringify(matching)).not.toContain('deletedAt');
    expect(JSON.stringify(matching)).not.toContain(disabledStoreId);
    expect(JSON.stringify(matching)).not.toContain(deletedStoreId);
  });

  it('filters by an active community relation and merges its delivery overrides', async () => {
    const response = await request(app())
      .get('/api/v1/stores')
      .query({ communityId: enabledCommunityId })
      .expect(200);
    const matching = response.body.data.list.filter((store: { name: string }) =>
      store.name.endsWith(runId),
    );

    expect(matching.map((store: { id: string }) => store.id)).toEqual([openStoreId, pausedStoreId]);
    expect(matching[0]).toMatchObject({
      minimumOrderAmount: '35.50',
      deliveryFee: '2.50',
      estimatedDeliveryMinutes: 25,
      isDeliverable: true,
      canOrder: true,
    });
    expect(matching[1]).toMatchObject({
      status: 'PAUSED',
      isDeliverable: true,
      canOrder: false,
    });
  });

  it('supports trimmed name search and validates pagination inputs', async () => {
    const searched = await request(app())
      .get('/api/v1/stores')
      .query({ keyword: '  阳光生鲜  ', page: 1, pageSize: 10 })
      .expect(200);
    expect(searched.body.data).toMatchObject({ page: 1, pageSize: 10 });
    expect(searched.body.data.list.some((store: { id: string }) => store.id === openStoreId)).toBe(
      true,
    );

    const invalid = await request(app()).get('/api/v1/stores').query({ pageSize: 101 }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['missing', 'missing-community'],
    ['disabled', () => disabledCommunityId],
    ['deleted', () => deletedCommunityId],
  ])('rejects a %s community with a stable public error', async (_label, id) => {
    const communityId = typeof id === 'function' ? id() : id;
    const response = await request(app()).get('/api/v1/stores').query({ communityId }).expect(404);
    expect(response.body).toEqual({
      code: 'COMMUNITY_NOT_FOUND',
      message: '配送小区不存在或已停用',
      data: null,
    });
  });

  it('returns public store details and preserves paused stores as non-orderable', async () => {
    const detail = await request(app())
      .get(`/api/v1/stores/${openStoreId}`)
      .query({ communityId: enabledCommunityId })
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: openStoreId,
      logoUrl: 'https://example.test/logo.png',
      coverUrl: 'https://example.test/cover.png',
      description: `阳光生鲜详情`,
      announcement: `阳光生鲜公告`,
      phone: '13800000000',
      address: '测试路 1 号',
      canOrder: true,
    });
    expect(JSON.stringify(detail.body.data)).not.toContain('sortOrder');

    const paused = await request(app())
      .get(`/api/v1/stores/${pausedStoreId}`)
      .query({ communityId: enabledCommunityId })
      .expect(200);
    expect(paused.body.data).toMatchObject({ status: 'PAUSED', canOrder: false });
  });

  it('distinguishes a non-deliverable store from a hidden store', async () => {
    for (const id of [relationPausedStoreId, otherCommunityStoreId]) {
      const response = await request(app())
        .get(`/api/v1/stores/${id}`)
        .query({ communityId: enabledCommunityId })
        .expect(409);
      expect(response.body.code).toBe('STORE_NOT_DELIVERABLE');
    }

    for (const id of [disabledStoreId, deletedStoreId, 'missing-store']) {
      const response = await request(app()).get(`/api/v1/stores/${id}`).expect(404);
      expect(response.body.code).toBe('STORE_NOT_FOUND');
    }
  });
});
