import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identity = `community_selection_identity_${runId}`;
const loginCode = `community_selection_code_${runId}`;
const communityIds: string[] = [];
let token = '';
let userId = '';
let enabledHighId = '';
let enabledLowId = '';
let disabledId = '';
let deletedId = '';

const provider: WechatIdentityProvider = {
  async exchangeCode(code) {
    if (code !== loginCode) throw new Error('unexpected test code');
    return { openId: identity };
  },
};

const app = () => createApp({ wechatIdentityProvider: provider }).callback();

describe('resident community selection', () => {
  beforeAll(async () => {
    const communities = await Promise.all([
      prisma.community.create({
        data: {
          name: `高优先小区_${runId}`,
          city: '测试市',
          district: '一区',
          detailedAddress: '高优先路 1 号',
          sortOrder: 20,
        },
      }),
      prisma.community.create({
        data: {
          name: `低优先小区_${runId}`,
          city: '测试市',
          district: '二区',
          detailedAddress: '低优先路 2 号',
          sortOrder: 10,
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
    [enabledHighId, enabledLowId, disabledId, deletedId] = communities.map(
      (community) => community.id,
    );

    const login = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: loginCode })
      .expect(200);
    token = login.body.data.token;
    userId = login.body.data.user.id;
  });

  afterAll(async () => {
    await prisma.userLoginLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.$disconnect();
  });

  it('lists only enabled, non-deleted communities without management fields', async () => {
    const response = await request(app()).get('/api/v1/communities').expect(200);
    const matching = response.body.data.list.filter((community: { name: string }) =>
      community.name.endsWith(runId),
    );

    expect(matching.map((community: { id: string }) => community.id)).toEqual([
      enabledHighId,
      enabledLowId,
    ]);
    expect(matching[0]).toEqual({
      id: enabledHighId,
      name: `高优先小区_${runId}`,
      city: '测试市',
      district: '一区',
      detailedAddress: '高优先路 1 号',
    });
    expect(JSON.stringify(matching)).not.toContain('sortOrder');
    expect(JSON.stringify(matching)).not.toContain('deletedAt');
    expect(JSON.stringify(matching)).not.toContain('DISABLED');
  });

  it('requires a resident session and validates the community identifier', async () => {
    const missing = await request(app())
      .put('/api/v1/users/current-community')
      .send({ communityId: enabledHighId })
      .expect(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');

    const invalid = await request(app())
      .put('/api/v1/users/current-community')
      .set('authorization', `Bearer ${token}`)
      .send({ communityId: '' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['missing', 'missing-community'],
    ['disabled', () => disabledId],
    ['deleted', () => deletedId],
  ])('rejects a %s community with the stable public error', async (_label, id) => {
    const communityId = typeof id === 'function' ? id() : id;
    const response = await request(app())
      .put('/api/v1/users/current-community')
      .set('authorization', `Bearer ${token}`)
      .send({ communityId })
      .expect(404);
    expect(response.body).toEqual({
      code: 'COMMUNITY_NOT_FOUND',
      message: '配送小区不存在或已停用',
      data: null,
    });
  });

  it('persists an available selection and clears it when the community becomes unavailable', async () => {
    const selected = await request(app())
      .put('/api/v1/users/current-community')
      .set('authorization', `Bearer ${token}`)
      .send({ communityId: enabledHighId })
      .expect(200);
    expect(selected.body.data.currentCommunity).toMatchObject({ id: enabledHighId });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).currentCommunityId,
    ).toBe(enabledHighId);

    const profile = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(profile.body.data.currentCommunity).toEqual(selected.body.data.currentCommunity);

    await prisma.community.update({
      where: { id: enabledHighId },
      data: { status: 'DISABLED' },
    });
    const invalidated = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(invalidated.body.data.currentCommunity).toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).currentCommunityId,
    ).toBeNull();
  });
});
