import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `community_admin_${Date.now()}`;
const password = 'CommunityTest123!';
let token = '';
const createdIds: string[] = [];

describe('community administration', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        username,
        displayName: '小区测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password });
    token = login.body.data.token;
  });

  afterAll(async () => {
    await prisma.operationLog.deleteMany({ where: { businessDataId: { in: createdIds } } });
    await prisma.community.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('requires authentication and validates input', async () => {
    await request(createApp().callback()).get('/api/v1/admin/communities').expect(401);
    const invalid = await request(createApp().callback())
      .post('/api/v1/admin/communities')
      .set('authorization', `Bearer ${token}`)
      .send({ name: '' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('creates, paginates, filters and rejects duplicates', async () => {
    for (const suffix of ['甲', '乙']) {
      const response = await request(createApp().callback())
        .post('/api/v1/admin/communities')
        .set('authorization', `Bearer ${token}`)
        .send({
          name: `${username}${suffix}`,
          city: '测试市',
          district: '测试区',
          detailedAddress: `${suffix}号`,
          status: 'ENABLED',
          sortOrder: suffix === '甲' ? 10 : 5,
        })
        .expect(201);
      createdIds.push(response.body.data.id);
    }

    const list = await request(createApp().callback())
      .get('/api/v1/admin/communities')
      .query({ page: 1, pageSize: 1, keyword: username, status: 'ENABLED' })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(list.body.data.list).toHaveLength(1);

    const duplicate = await request(createApp().callback())
      .post('/api/v1/admin/communities')
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `${username}甲`,
        city: '测试市',
        district: '测试区',
        detailedAddress: '重复地址',
      })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');
  });

  it('updates, disables and soft deletes with audit evidence', async () => {
    const id = createdIds[0];
    await request(createApp().callback())
      .put(`/api/v1/admin/communities/${id}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `${username}甲更新`,
        city: '测试市',
        district: '测试区',
        detailedAddress: '更新地址',
        status: 'ENABLED',
        sortOrder: 20,
      })
      .expect(200);

    await request(createApp().callback())
      .patch(`/api/v1/admin/communities/${id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' })
      .expect(200);

    await request(createApp().callback())
      .delete(`/api/v1/admin/communities/${id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const list = await request(createApp().callback())
      .get('/api/v1/admin/communities')
      .query({ keyword: `${username}甲更新` })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.total).toBe(0);

    const deleted = await prisma.community.findUniqueOrThrow({ where: { id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.status).toBe('DISABLED');
    expect(await prisma.operationLog.count({ where: { businessDataId: id } })).toBe(4);

    const missing = await request(createApp().callback())
      .put(`/api/v1/admin/communities/${id}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        name: '不可更新',
        city: '测试市',
        district: '测试区',
        detailedAddress: '测试地址',
      })
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });
});
