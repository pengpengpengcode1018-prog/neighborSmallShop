import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `auth_test_${Date.now()}`;
const password = 'IntegrationPass123!';

describe('admin authentication', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        username,
        displayName: '认证测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
  });

  afterAll(async () => {
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('logs in and returns the current enabled administrator', async () => {
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password })
      .expect(200);

    expect(login.body).toMatchObject({
      code: 0,
      message: 'success',
      data: {
        expiresIn: 28_800,
        admin: { username, displayName: '认证测试管理员', role: 'PLATFORM_ADMIN' },
      },
    });
    expect(login.body.data.token).toBeTypeOf('string');

    const current = await request(createApp().callback())
      .get('/api/v1/admin/auth/me')
      .set('authorization', `Bearer ${login.body.data.token}`)
      .expect(200);

    expect(current.body.data).toMatchObject({ username, role: 'PLATFORM_ADMIN' });
    expect(await prisma.adminLoginLog.count({ where: { username, result: 'SUCCESS' } })).toBe(1);
  });

  it('rejects invalid input and missing authentication', async () => {
    const invalid = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username: '', password: '' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const unauthorized = await request(createApp().callback())
      .get('/api/v1/admin/auth/me')
      .expect(401);
    expect(unauthorized.body.code).toBe('UNAUTHORIZED');
  });

  it('does not reveal whether an account exists or is disabled', async () => {
    const missing = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username: `${username}_missing`, password })
      .expect(401);

    await prisma.admin.update({ where: { username }, data: { status: 'DISABLED' } });
    const disabled = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password })
      .expect(401);
    await prisma.admin.update({ where: { username }, data: { status: 'ACTIVE' } });

    expect(disabled.body).toEqual(missing.body);
    expect(disabled.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after five failed attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(createApp().callback())
        .post('/api/v1/admin/auth/login')
        .send({ username, password: 'DefinitelyWrong123!' })
        .expect(401);
    }

    const admin = await prisma.admin.findUniqueOrThrow({ where: { username } });
    expect(admin.failedLoginAttempts).toBe(5);
    expect(admin.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    const locked = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password })
      .expect(401);
    expect(locked.body.code).toBe('INVALID_CREDENTIALS');
    expect(await prisma.adminLoginLog.count({ where: { username, result: 'LOCKED' } })).toBe(2);
  });
});
