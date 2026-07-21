import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `catalog_admin_${Date.now()}`;
const password = 'CatalogAdmin123!';
let token = '';
let communityId = '';
let storeId = '';
let otherStoreId = '';
let categoryId = '';
let productId = '';

describe('catalog administration', () => {
  beforeAll(async () => {
    const admin = await prisma.admin.create({
      data: {
        username,
        displayName: '商品测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const community = await prisma.community.create({
      data: { name: `${username}小区`, city: '测试市', district: '测试区', detailedAddress: '1号' },
    });
    communityId = community.id;
    const stores = await Promise.all([
      prisma.store.create({ data: { name: `${username}店铺`, phone: '1', address: '1' } }),
      prisma.store.create({ data: { name: `${username}其他店`, phone: '2', address: '2' } }),
    ]);
    storeId = stores[0].id;
    otherStoreId = stores[1].id;
    await prisma.storeCommunity.create({ data: { storeId, communityId } });
    expect(admin.id).toBeTruthy();
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password });
    token = login.body.data.token;
  });

  afterAll(async () => {
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.operationLog.deleteMany({ where: { admin: { username } } });
    await prisma.storeCommunity.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('creates and lists categories while rejecting duplicates', async () => {
    const created = await request(createApp().callback())
      .post('/api/v1/admin/categories')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId, name: '饮料', status: 'ENABLED', sortOrder: 10 })
      .expect(201);
    categoryId = created.body.data.id;

    const list = await request(createApp().callback())
      .get('/api/v1/admin/categories')
      .query({ storeId })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    const duplicate = await request(createApp().callback())
      .post('/api/v1/admin/categories')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId, name: '饮料' })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');
  });

  it('rejects cross-store categories and zero-stock on-sale products', async () => {
    const crossStore = await request(createApp().callback())
      .post('/api/v1/admin/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId: otherStoreId,
        categoryId,
        name: '跨店商品',
        price: '5.00',
        stock: 10,
        status: 'ON_SALE',
      })
      .expect(400);
    expect(crossStore.body.code).toBe('VALIDATION_ERROR');

    const zeroStock = await request(createApp().callback())
      .post('/api/v1/admin/products')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId, categoryId, name: '无库存商品', price: '5.00', stock: 0, status: 'ON_SALE' })
      .expect(409);
    expect(zeroStock.body.code).toBe('CONFLICT');
  });

  it('creates, filters and edits a product with fixed money strings', async () => {
    const created = await request(createApp().callback())
      .post('/api/v1/admin/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId,
        categoryId,
        name: '矿泉水',
        price: '2.50',
        originalPrice: '3.00',
        stock: 100,
        stockWarningThreshold: 10,
        isHot: true,
        status: 'ON_SALE',
        sortOrder: 5,
      })
      .expect(201);
    productId = created.body.data.id;
    expect(created.body.data).toMatchObject({ price: '2.50', originalPrice: '3.00' });

    const list = await request(createApp().callback())
      .get('/api/v1/admin/products')
      .query({ storeId, categoryId, keyword: '矿泉', status: 'ON_SALE' })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.total).toBe(1);

    const updated = await request(createApp().callback())
      .put(`/api/v1/admin/products/${productId}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId,
        categoryId,
        name: '矿泉水',
        price: '2.80',
        stock: 80,
        stockWarningThreshold: 8,
        isHot: false,
        status: 'OFF_SHELF',
        sortOrder: 5,
      })
      .expect(200);
    expect(updated.body.data.price).toBe('2.80');
  });

  it('blocks category deletion until products are soft deleted and audits writes', async () => {
    await request(createApp().callback())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(409);
    await request(createApp().callback())
      .delete(`/api/v1/admin/products/${productId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    await request(createApp().callback())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).deletedAt,
    ).not.toBeNull();
    expect(
      (await prisma.productCategory.findUniqueOrThrow({ where: { id: categoryId } })).deletedAt,
    ).not.toBeNull();
    expect(await prisma.operationLog.count({ where: { admin: { username } } })).toBe(5);
  });
});
