import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import {
  WechatProviderError,
  type WechatIdentityProvider,
} from '../src/providers/wechat-identity.provider.js';
import type { WechatPhoneProvider } from '../src/providers/wechat-phone.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identityPrefix = `test_identity_${runId}`;
const validCode = `valid_${runId}`;
const disabledCode = `disabled_${runId}`;
const invalidCode = `invalid_${runId}`;
const unavailableCode = `unavailable_${runId}`;
const secondCode = `second_${runId}`;
const validPhoneCode = `phone_${runId}`;
const invalidPhoneCode = `phone_invalid_${runId}`;
const testPhone = `139${String(Date.now()).slice(-8)}`;
const testAvatarBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const provider: WechatIdentityProvider = {
  async exchangeCode(code) {
    if (code === invalidCode) throw new WechatProviderError('invalid_code');
    if (code === unavailableCode) throw new WechatProviderError('unavailable');
    if (code === disabledCode) return { openId: `${identityPrefix}_disabled` };
    if (code === validCode) {
      return { openId: `${identityPrefix}_active`, unionId: `${identityPrefix}_union` };
    }
    if (code === secondCode) return { openId: `${identityPrefix}_second` };
    throw new WechatProviderError('invalid_code');
  },
};

const phoneProvider: WechatPhoneProvider = {
  async exchangeCode(code) {
    if (code === invalidPhoneCode) throw new WechatProviderError('invalid_code');
    if (code === validPhoneCode) return { phoneNumber: testPhone, countryCode: '86' };
    throw new WechatProviderError('unavailable');
  },
};

const app = () =>
  createApp({ wechatIdentityProvider: provider, wechatPhoneProvider: phoneProvider }).callback();

describe('miniapp user authentication', () => {
  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { wechatOpenId: { startsWith: identityPrefix } },
      select: { id: true },
    });
    await prisma.userLoginLog.deleteMany({
      where: {
        OR: [
          { userId: { in: users.map((user) => user.id) } },
          { failureReason: { in: ['invalid_code', 'provider_unavailable'] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  });

  it('creates one user, restores the same identity, and returns an authenticated profile', async () => {
    const first = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: validCode })
      .expect(200);

    expect(first.body).toMatchObject({
      code: 0,
      message: 'success',
      data: {
        expiresIn: 28_800,
        user: { nickname: null, avatarUrl: null, phone: null, phoneBound: false },
      },
    });
    expect(first.body.data.token).toBeTypeOf('string');
    expect(JSON.stringify(first.body)).not.toContain(identityPrefix);

    const createdUser = await prisma.user.findUniqueOrThrow({
      where: { wechatOpenId: `${identityPrefix}_active` },
    });
    await prisma.user.update({
      where: { id: createdUser.id },
      data: { lastLoginAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    const repeated = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: validCode })
      .expect(200);
    expect(repeated.body.data.user.id).toBe(createdUser.id);
    expect(await prisma.user.count({ where: { wechatOpenId: `${identityPrefix}_active` } })).toBe(
      1,
    );
    expect(
      (
        await prisma.user.findUniqueOrThrow({ where: { id: createdUser.id } })
      ).lastLoginAt?.getTime(),
    ).toBeGreaterThan(new Date('2020-01-01T00:00:00.000Z').getTime());

    const profile = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${repeated.body.data.token}`)
      .expect(200);
    expect(profile.body.data).toEqual(repeated.body.data.user);
    expect(
      await prisma.userLoginLog.count({ where: { userId: createdUser.id, result: 'SUCCESS' } }),
    ).toBe(2);
  });

  it('normalizes invalid codes and provider outages without exposing sensitive values', async () => {
    const invalid = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: invalidCode })
      .expect(401);
    expect(invalid.body).toEqual({
      code: 'WECHAT_LOGIN_FAILED',
      message: '微信登录凭证无效，请重试',
      data: null,
    });

    const unavailable = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: unavailableCode })
      .expect(503);
    expect(unavailable.body.code).toBe('SERVICE_UNAVAILABLE');

    const anonymousAudits = await prisma.userLoginLog.findMany({
      where: { failureReason: { in: ['invalid_code', 'provider_unavailable'] }, userId: null },
      select: { failureReason: true, result: true },
    });
    expect(anonymousAudits).toEqual(
      expect.arrayContaining([
        { failureReason: 'invalid_code', result: 'FAILED' },
        { failureReason: 'provider_unavailable', result: 'FAILED' },
      ]),
    );
    const serialized = JSON.stringify({ invalid: invalid.body, unavailable: unavailable.body });
    expect(serialized).not.toContain(invalidCode);
    expect(serialized).not.toContain(unavailableCode);
    expect(serialized).not.toContain(identityPrefix);
  });

  it('binds a phone from a one-time code and refuses invalid or cross-account reuse', async () => {
    const firstLogin = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: validCode })
      .expect(200);
    const token = firstLogin.body.data.token as string;

    const invalid = await request(app())
      .post('/api/v1/users/phone')
      .set('authorization', `Bearer ${token}`)
      .send({ code: invalidPhoneCode })
      .expect(401);
    expect(invalid.body).toEqual({
      code: 'WECHAT_PHONE_FAILED',
      message: '手机号授权凭证无效，请重新授权',
      data: null,
    });
    expect(JSON.stringify(invalid.body)).not.toContain(invalidPhoneCode);

    const bound = await request(app())
      .post('/api/v1/users/phone')
      .set('authorization', `Bearer ${token}`)
      .send({ code: validPhoneCode })
      .expect(200);
    expect(bound.body.data).toMatchObject({ phone: testPhone, phoneBound: true });

    const repeated = await request(app())
      .post('/api/v1/users/phone')
      .set('authorization', `Bearer ${token}`)
      .send({ code: validPhoneCode })
      .expect(200);
    expect(repeated.body.data.phone).toBe(testPhone);

    const secondLogin = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: secondCode })
      .expect(200);
    const conflict = await request(app())
      .post('/api/v1/users/phone')
      .set('authorization', `Bearer ${secondLogin.body.data.token as string}`)
      .send({ code: validPhoneCode })
      .expect(409);
    expect(conflict.body.code).toBe('PHONE_ALREADY_BOUND');
    expect(JSON.stringify(conflict.body)).not.toContain(testPhone);
  });

  it('saves an optional nickname and avatar, then serves the persisted avatar publicly', async () => {
    const login = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: validCode })
      .expect(200);
    const token = login.body.data.token as string;
    const userId = login.body.data.user.id as string;

    const updated = await request(app())
      .put('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .send({ nickname: '邻里小明', avatarBase64: testAvatarBase64 })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      id: userId,
      nickname: '邻里小明',
    });
    expect(updated.body.data.avatarUrl).toMatch(
      new RegExp(`^/api/v1/users/${userId}/avatar\\?v=\\d+$`),
    );

    const avatar = await request(app()).get(updated.body.data.avatarUrl).expect(200);
    expect(avatar.headers['content-type']).toMatch(/^image\/png/);
    expect(avatar.headers['cache-control']).toBe('public, max-age=3600');
    expect(avatar.body).toEqual(Buffer.from(testAvatarBase64, 'base64'));

    const profile = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(profile.body.data).toEqual(updated.body.data);
  });

  it('rejects empty or invalid resident profile updates', async () => {
    const login = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: validCode })
      .expect(200);
    const token = login.body.data.token as string;

    const empty = await request(app())
      .patch('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');

    const invalidAvatar = await request(app())
      .patch('/api/v1/users/profile')
      .set('authorization', `Bearer ${token}`)
      .send({ avatarBase64: 'not-an-image' })
      .expect(400);
    expect(invalidAvatar.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '头像文件格式无效',
    });
  });

  it('rechecks account status and audits a disabled user', async () => {
    const login = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: disabledCode })
      .expect(200);
    const userId = login.body.data.user.id as string;
    await prisma.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });

    const disabled = await request(app())
      .post('/api/v1/auth/wechat-login')
      .send({ code: disabledCode })
      .expect(403);
    expect(disabled.body.code).toBe('ACCOUNT_UNAVAILABLE');
    expect(await prisma.userLoginLog.count({ where: { userId, result: 'DISABLED' } })).toBe(1);
  });

  it('rejects missing, expired, and administrator sessions on user routes', async () => {
    const missing = await request(app()).get('/api/v1/users/profile').expect(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');

    const expired = jwt.sign({ kind: 'USER' }, env.JWT_SECRET, {
      subject: 'expired-test-user',
      expiresIn: -1,
    });
    const expiredResponse = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${expired}`)
      .expect(401);
    expect(expiredResponse.body.code).toBe('UNAUTHORIZED');

    const adminToken = jwt.sign(
      { kind: 'ADMIN', role: 'PLATFORM_ADMIN', username: 'test-admin' },
      env.JWT_SECRET,
      { subject: 'test-admin', expiresIn: 60 },
    );
    const forbidden = await request(app())
      .get('/api/v1/users/profile')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });
});
