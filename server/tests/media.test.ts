import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const username = `media_admin_${Date.now()}`;
const password = 'MediaAdmin123!';
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let token = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
const mediaIds: string[] = [];

function upload(body: Record<string, unknown>) {
  return request(createApp().callback())
    .post('/api/v1/admin/media/images')
    .set('authorization', `Bearer ${token}`)
    .send(body);
}

describe('catalog image media', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        username,
        displayName: '图片测试管理员',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const login = await request(createApp().callback())
      .post('/api/v1/admin/auth/login')
      .send({ username, password })
      .expect(200);
    token = login.body.data.token;
    const community = await prisma.community.create({
      data: { name: `${username}小区`, city: '测试市', district: '测试区', detailedAddress: '1号' },
    });
    communityId = community.id;
  });

  afterAll(async () => {
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    if (storeId) {
      await prisma.storeCommunity.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    await prisma.operationLog.deleteMany({ where: { admin: { username } } });
    if (mediaIds.length) await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.adminLoginLog.deleteMany({ where: { username } });
    await prisma.admin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });

  it('requires an admin and rejects unsafe image declarations', async () => {
    await request(createApp().callback())
      .post('/api/v1/admin/media/images')
      .send({ fileName: 'logo.png', mimeType: 'image/png', base64: pngBase64 })
      .expect(401);

    const mismatch = await upload({
      fileName: 'logo.jpg',
      mimeType: 'image/jpeg',
      base64: pngBase64,
    }).expect(400);
    expect(mismatch.body.code).toBe('VALIDATION_ERROR');
  });

  it('stores validated images and serves them with safe headers', async () => {
    const created = await upload({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: pngBase64,
    }).expect(201);
    const image = created.body.data;
    mediaIds.push(image.id);
    expect(image).toMatchObject({ mimeType: 'image/png', byteSize: 68 });

    const served = await request(createApp().callback()).get(image.url).expect(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-disposition']).toBe('inline');
    expect(Buffer.from(served.body).toString('base64')).toBe(pngBase64);
  });

  it('links only managed images to stores and products', async () => {
    const image = await upload({
      fileName: 'catalog.webp',
      mimeType: 'image/png',
      base64: pngBase64,
    }).expect(400);
    expect(image.body.code).toBe('VALIDATION_ERROR');

    const uploaded = await upload({
      fileName: 'catalog.png',
      mimeType: 'image/png',
      base64: pngBase64,
    }).expect(201);
    const imageUrl = uploaded.body.data.url as string;
    mediaIds.push(uploaded.body.data.id);

    const createdStore = await request(createApp().callback())
      .post('/api/v1/admin/stores')
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `${username}店铺`,
        logoUrl: imageUrl,
        coverUrl: imageUrl,
        phone: '1',
        address: '1',
        businessStartTime: '08:00',
        businessEndTime: '22:00',
        minimumOrderAmount: '0.00',
        defaultDeliveryFee: '0.00',
        estimatedDeliveryMinutes: 45,
        status: 'OPEN',
        sortOrder: 0,
        communityIds: [communityId],
      })
      .expect(201);
    storeId = createdStore.body.data.id;
    expect(createdStore.body.data.logoUrl).toBe(imageUrl);

    const category = await request(createApp().callback())
      .post('/api/v1/admin/categories')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId, name: '图片分类', status: 'ENABLED', sortOrder: 0 })
      .expect(201);
    categoryId = category.body.data.id;
    const product = await request(createApp().callback())
      .post('/api/v1/admin/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId,
        categoryId,
        name: '图片商品',
        mainImageUrl: imageUrl,
        galleryImageUrls: [imageUrl],
        price: '1.00',
        stock: 1,
        status: 'ON_SALE',
      })
      .expect(201);
    productId = product.body.data.id;
    expect(product.body.data.galleryImageUrls).toEqual([imageUrl]);

    const external = await request(createApp().callback())
      .put(`/api/v1/admin/products/${productId}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId,
        categoryId,
        name: '图片商品',
        mainImageUrl: 'https://example.com/image.png',
        galleryImageUrls: [],
        price: '1.00',
        stock: 1,
        status: 'OFF_SHELF',
      })
      .expect(400);
    expect(external.body.code).toBe('VALIDATION_ERROR');

    const tooManyGalleryImages = await request(createApp().callback())
      .put(`/api/v1/admin/products/${productId}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId,
        categoryId,
        name: '图片商品',
        mainImageUrl: imageUrl,
        galleryImageUrls: Array.from({ length: 7 }, () => imageUrl),
        price: '1.00',
        stock: 1,
        status: 'OFF_SHELF',
      })
      .expect(400);
    expect(tooManyGalleryImages.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects images larger than 512 KiB before content parsing', async () => {
    const oversized = await upload({
      fileName: 'large.png',
      mimeType: 'image/png',
      base64: Buffer.alloc(512 * 1024 + 1).toString('base64'),
    }).expect(413);
    expect(oversized.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
