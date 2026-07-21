import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import {
  WechatProviderError,
  type WechatIdentityProvider,
} from '../src/providers/wechat-identity.provider.js';
import type { WechatPhoneProvider } from '../src/providers/wechat-phone.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const username = `user_admin_${runId}`;
const password = 'UserAdminPass123!';
const identityPrefix = `admin_user_${runId}`;
const loginCode = `login_${runId}`;
const phoneCode = `phone_${runId}`;
const testPhone = `138${String(Date.now()).slice(-8)}`;
let adminToken = '';
let communityId = '';

const identityProvider: WechatIdentityProvider = {
  async exchangeCode(code) {
    if (code === loginCode) return { openId: `${identityPrefix}_live` };
    throw new WechatProviderError('invalid_code');
  },
};

const phoneProvider: WechatPhoneProvider = {
  async exchangeCode(code) {
    if (code === phoneCode) return { phoneNumber: testPhone, countryCode: '86' };
    throw new WechatProviderError('invalid_code');
  },
};

const app = () =>
  createApp({
    wechatIdentityProvider: identityProvider,
    wechatPhoneProvider: phoneProvider,
  }).callback();

describe('admin resident user directory', () => {
  beforeAll(async () => {
    const admin = await prisma.admin.create({
      data: {
        username,
        displayName: '居民用户测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const community = await prisma.community.create({
      data: {
        name: `用户测试小区_${runId}`,
        city: '测试市',
        district: '测试区',
        detailedAddress: '测试路 1 号',
      },
    });
    communityId = community.id;
    await prisma.user.createMany({
      data: [
        {
          wechatOpenId: `${identityPrefix}_bound`,
          nickname: `已绑定居民_${runId}`,
          phone: `139${String(Date.now() + 1).slice(-8)}`,
          currentCommunityId: community.id,
          lastLoginAt: new Date('2026-07-20T04:00:00.000Z'),
        },
        {
          wechatOpenId: `${identityPrefix}_unbound`,
          nickname: null,
        },
        {
          wechatOpenId: `${identityPrefix}_disabled`,
          nickname: `停用居民_${runId}`,
          status: 'DISABLED',
        },
      ],
    });
    expect(admin.id).toBeTruthy();
    const login = await request(app())
      .post('/api/v1/admin/auth/login')
      .send({ username, password })
      .expect(200);
    adminToken = login.body.data.token as string;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { wechatOpenId: { startsWith: identityPrefix } },
      select: { id: true },
    });
    await prisma.userLoginLog.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('requires an administrator and supports safe pagination and filters', async () => {
    await request(app()).get('/api/v1/admin/users').expect(401);

    const bound = await request(app())
      .get('/api/v1/admin/users')
      .query({ keyword: `已绑定居民_${runId}`, phoneBound: true, status: 'ACTIVE' })
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(bound.body.data).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(bound.body.data.list[0]).toMatchObject({
      displayName: `已绑定居民_${runId}`,
      maskedPhone: expect.stringMatching(/^139\*{4}\d{4}$/),
      phoneBound: true,
      currentCommunity: { id: communityId, name: `用户测试小区_${runId}` },
      status: 'ACTIVE',
    });

    const unbound = await request(app())
      .get('/api/v1/admin/users')
      .query({ phoneBound: false, page: 1, pageSize: 1 })
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(unbound.body.data.pageSize).toBe(1);
    expect(unbound.body.data.list).toHaveLength(1);
    expect(unbound.body.data.list[0].phoneBound).toBe(false);
  });

  it('returns a read-only detail without identity, address, or full-phone fields', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { wechatOpenId: `${identityPrefix}_bound` },
    });
    const response = await request(app())
      .get(`/api/v1/admin/users/${user.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const serialized = JSON.stringify(response.body.data);
    expect(response.body.data.maskedPhone).toMatch(/^139\*{4}\d{4}$/);
    expect(serialized).not.toContain(user.phone);
    for (const key of ['wechatOpenId', 'wechatUnionId', 'phone', 'addresses', 'sessionKey']) {
      expect(response.body.data).not.toHaveProperty(key);
    }
    await request(app())
      .get('/api/v1/admin/users/missing-user')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('shows an identity login immediately and updates the same row after phone binding', async () => {
    const login = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: loginCode })
      .expect(200);
    const userId = login.body.data.user.id as string;

    const before = await request(app())
      .get('/api/v1/admin/users')
      .query({ keyword: userId })
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(before.body.data.list).toHaveLength(1);
    expect(before.body.data.list[0]).toMatchObject({ id: userId, phoneBound: false });

    await request(app())
      .post('/api/v1/users/phone')
      .set('authorization', `Bearer ${login.body.data.token as string}`)
      .send({ code: phoneCode })
      .expect(200);

    const after = await request(app())
      .get('/api/v1/admin/users')
      .query({ keyword: userId })
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data.list).toHaveLength(1);
    expect(after.body.data.list[0]).toMatchObject({
      id: userId,
      phoneBound: true,
      maskedPhone: `${testPhone.slice(0, 3)}****${testPhone.slice(-4)}`,
    });
    expect(JSON.stringify(after.body)).not.toContain(testPhone);
  });
});
