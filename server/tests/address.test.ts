import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identities = new Map([
  [`address-code-owner-${runId}`, `address-owner-${runId}`],
  [`address-code-other-${runId}`, `address-other-${runId}`],
]);
const userIds: string[] = [];
const communityIds: string[] = [];
let ownerToken = '';
let otherToken = '';
let ownerId = '';
let enabledCommunityId = '';
let secondCommunityId = '';
let disabledCommunityId = '';
let deletedCommunityId = '';

const provider: WechatIdentityProvider = {
  async exchangeCode(code) {
    const openId = identities.get(code);
    if (!openId) throw new Error('unexpected test code');
    return { openId };
  },
};
const app = () => createApp({ wechatIdentityProvider: provider }).callback();

async function login(code: string): Promise<{ token: string; userId: string }> {
  const response = await request(app())
    .post('/api/v1/auth/wechat-login')
    .send({ code })
    .expect(200);
  return { token: response.body.data.token, userId: response.body.data.user.id };
}

function addressData(communityId = enabledCommunityId, overrides: Record<string, unknown> = {}) {
  return {
    recipientName: ' 张三 ',
    phone: '13812345678',
    communityId,
    building: ' 1号楼 ',
    unit: '2单元',
    room: '301室',
    detail: '东门进入',
    label: 'HOME',
    ...overrides,
  };
}

async function createAddress(overrides: Record<string, unknown> = {}) {
  return request(app())
    .post('/api/v1/addresses')
    .set('authorization', `Bearer ${ownerToken}`)
    .send(addressData(enabledCommunityId, overrides))
    .expect(200);
}

describe('resident address management', () => {
  beforeAll(async () => {
    const communities = await Promise.all([
      prisma.community.create({
        data: {
          name: `地址小区甲_${runId}`,
          city: '测试市',
          district: '地址一区',
          detailedAddress: '地址路 1 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `地址小区乙_${runId}`,
          city: '测试市',
          district: '地址二区',
          detailedAddress: '地址路 2 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `停用地址小区_${runId}`,
          city: '测试市',
          district: '地址三区',
          detailedAddress: '地址路 3 号',
          status: 'DISABLED',
        },
      }),
      prisma.community.create({
        data: {
          name: `删除地址小区_${runId}`,
          city: '测试市',
          district: '地址四区',
          detailedAddress: '地址路 4 号',
          deletedAt: new Date(),
        },
      }),
    ]);
    communityIds.push(...communities.map((community) => community.id));
    [enabledCommunityId, secondCommunityId, disabledCommunityId, deletedCommunityId] =
      communities.map((community) => community.id);

    const owner = await login(`address-code-owner-${runId}`);
    const other = await login(`address-code-other-${runId}`);
    ownerToken = owner.token;
    otherToken = other.token;
    ownerId = owner.userId;
    userIds.push(owner.userId, other.userId);
  });

  beforeEach(async () => {
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.community.update({
      where: { id: secondCommunityId },
      data: { status: 'ENABLED', deletedAt: null },
    });
  });

  afterAll(async () => {
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userLoginLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.$disconnect();
  });

  it('requires a resident session and returns an explicit empty list', async () => {
    const unauthenticated = await request(app()).get('/api/v1/addresses').expect(401);
    expect(unauthenticated.body.code).toBe('UNAUTHORIZED');

    const empty = await request(app())
      .get('/api/v1/addresses')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(empty.body.data).toEqual({ list: [] });
  });

  it('trims fields, makes the first address default and atomically switches defaults', async () => {
    const first = await createAddress({ isDefault: false });
    expect(first.body.data.list[0]).toMatchObject({
      recipientName: '张三',
      phone: '13812345678',
      building: '1号楼',
      unit: '2单元',
      room: '301室',
      detail: '东门进入',
      label: 'HOME',
      isDefault: true,
      available: true,
      unavailableReason: null,
      community: {
        id: enabledCommunityId,
        name: `地址小区甲_${runId}`,
      },
    });

    const second = await createAddress({
      recipientName: '李四',
      phone: '13912345678',
      communityId: secondCommunityId,
      building: '8号楼',
      unit: null,
      room: '902室',
      detail: null,
      label: 'COMPANY',
      isDefault: true,
    });
    expect(second.body.data.list).toHaveLength(2);
    expect(second.body.data.list[0]).toMatchObject({ recipientName: '李四', isDefault: true });
    expect(second.body.data.list[1]).toMatchObject({ recipientName: '张三', isDefault: false });
    expect(await prisma.address.count({ where: { userId: ownerId, isDefault: true } })).toBe(1);
    expect(
      (await prisma.address.findFirstOrThrow({ where: { userId: ownerId, isDefault: true } }))
        .defaultKey,
    ).toBe(ownerId);
  });

  it('rejects invalid fields and unavailable or unknown communities with stable errors', async () => {
    const invalidBodies = [
      addressData(enabledCommunityId, { recipientName: ' ' }),
      addressData(enabledCommunityId, { phone: '123456' }),
      addressData(enabledCommunityId, { building: '' }),
      addressData(enabledCommunityId, { room: '' }),
      addressData(enabledCommunityId, { label: 'FRIEND' }),
    ];
    for (const body of invalidBodies) {
      const response = await request(app())
        .post('/api/v1/addresses')
        .set('authorization', `Bearer ${ownerToken}`)
        .send(body)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('13812345678');
    }

    for (const communityId of ['missing-community', disabledCommunityId, deletedCommunityId]) {
      const response = await request(app())
        .post('/api/v1/addresses')
        .set('authorization', `Bearer ${ownerToken}`)
        .send(addressData(communityId))
        .expect(404);
      expect(response.body.code).toBe('COMMUNITY_NOT_FOUND');
    }
  });

  it('isolates residents across list, update, default and delete operations', async () => {
    const created = await createAddress();
    const addressId = created.body.data.list[0].id;

    const otherList = await request(app())
      .get('/api/v1/addresses')
      .set('authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherList.body.data.list).toEqual([]);

    const attempts = [
      request(app())
        .put(`/api/v1/addresses/${addressId}`)
        .set('authorization', `Bearer ${otherToken}`)
        .send(addressData(secondCommunityId)),
      request(app())
        .put(`/api/v1/addresses/${addressId}/default`)
        .set('authorization', `Bearer ${otherToken}`),
      request(app())
        .delete(`/api/v1/addresses/${addressId}`)
        .set('authorization', `Bearer ${otherToken}`),
    ];
    for (const attempt of attempts) {
      const response = await attempt.expect(404);
      expect(response.body.code).toBe('ADDRESS_NOT_FOUND');
    }

    const updated = await request(app())
      .put(`/api/v1/addresses/${addressId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send(addressData(secondCommunityId, { recipientName: '王五', label: 'SCHOOL' }))
      .expect(200);
    expect(updated.body.data.list[0]).toMatchObject({
      id: addressId,
      recipientName: '王五',
      label: 'SCHOOL',
      community: { id: secondCommunityId },
    });
  });

  it('keeps exactly one default address during concurrent switches', async () => {
    const first = await createAddress({ recipientName: '地址甲' });
    const firstId = first.body.data.list[0].id;
    const second = await createAddress({ recipientName: '地址乙', phone: '13712345678' });
    const secondId = second.body.data.list.find(
      (address: { recipientName: string }) => address.recipientName === '地址乙',
    ).id;
    const third = await createAddress({ recipientName: '地址丙', phone: '13612345678' });
    const thirdId = third.body.data.list.find(
      (address: { recipientName: string }) => address.recipientName === '地址丙',
    ).id;

    const responses = await Promise.all([
      request(app())
        .put(`/api/v1/addresses/${secondId}/default`)
        .set('authorization', `Bearer ${ownerToken}`),
      request(app())
        .put(`/api/v1/addresses/${thirdId}/default`)
        .set('authorization', `Bearer ${ownerToken}`),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.address.count({ where: { userId: ownerId, isDefault: true } })).toBe(1);
    expect(
      await prisma.address.count({
        where: { userId: ownerId, defaultKey: ownerId, id: { in: [firstId, secondId, thirdId] } },
      }),
    ).toBe(1);
  });

  it('soft deletes and promotes the most recently used remaining address', async () => {
    const first = await createAddress({ recipientName: '默认地址' });
    const firstId = first.body.data.list[0].id;
    const second = await createAddress({ recipientName: '最近使用', phone: '13712345678' });
    const secondId = second.body.data.list.find(
      (address: { recipientName: string }) => address.recipientName === '最近使用',
    ).id;
    const third = await createAddress({ recipientName: '较早使用', phone: '13612345678' });
    const thirdId = third.body.data.list.find(
      (address: { recipientName: string }) => address.recipientName === '较早使用',
    ).id;
    await prisma.address.update({
      where: { id: secondId },
      data: { lastUsedAt: new Date('2026-07-17T01:00:00.000Z') },
    });
    await prisma.address.update({
      where: { id: thirdId },
      data: { lastUsedAt: new Date('2026-07-16T01:00:00.000Z') },
    });

    const deleted = await request(app())
      .delete(`/api/v1/addresses/${firstId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      deleted.body.data.list.find((address: { id: string }) => address.id === secondId),
    ).toMatchObject({ isDefault: true });
    expect(deleted.body.data.list.some((address: { id: string }) => address.id === firstId)).toBe(
      false,
    );
    expect(await prisma.address.findUniqueOrThrow({ where: { id: firstId } })).toMatchObject({
      isDefault: false,
      defaultKey: null,
    });
    expect((await prisma.address.findUniqueOrThrow({ where: { id: firstId } })).deletedAt).not.toBe(
      null,
    );

    const alreadyDeleted = await request(app())
      .delete(`/api/v1/addresses/${firstId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(alreadyDeleted.body.code).toBe('ADDRESS_NOT_FOUND');
  });

  it('retains addresses whose community becomes unavailable and blocks writes to it', async () => {
    await createAddress({ communityId: enabledCommunityId });
    const created = await createAddress({
      recipientName: '失效地址',
      phone: '13712345678',
      communityId: secondCommunityId,
    });
    const addressId = created.body.data.list.find(
      (address: { recipientName: string }) => address.recipientName === '失效地址',
    ).id;
    await prisma.community.update({
      where: { id: secondCommunityId },
      data: { status: 'DISABLED' },
    });

    const list = await request(app())
      .get('/api/v1/addresses')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      list.body.data.list.find((address: { id: string }) => address.id === addressId),
    ).toMatchObject({
      id: addressId,
      available: false,
      unavailableReason: 'COMMUNITY_UNAVAILABLE',
    });
    expect(await prisma.address.count({ where: { id: addressId, deletedAt: null } })).toBe(1);

    const update = await request(app())
      .put(`/api/v1/addresses/${addressId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send(addressData(secondCommunityId, { recipientName: '不可写入' }))
      .expect(404);
    expect(update.body.code).toBe('COMMUNITY_NOT_FOUND');

    const setDefault = await request(app())
      .put(`/api/v1/addresses/${addressId}/default`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(setDefault.body.code).toBe('COMMUNITY_NOT_FOUND');
    expect(await prisma.address.count({ where: { userId: ownerId, isDefault: true } })).toBe(1);
  });
});
