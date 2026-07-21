import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const communityIds: string[] = [];
const storeIds: string[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
let communityId = '';
let otherCommunityId = '';
let disabledCommunityId = '';
let storeId = '';
let pausedStoreId = '';
let otherStoreId = '';
let disabledStoreId = '';
let featuredCategoryId = '';
let regularCategoryId = '';
let disabledCategoryId = '';
let deletedCategoryId = '';
let otherCategoryId = '';
let onSaleProductId = '';
let soldOutProductId = '';
let zeroStockProductId = '';
let regularProductId = '';
let offShelfProductId = '';
let deletedProductId = '';
let disabledCategoryProductId = '';
let deletedCategoryProductId = '';
let pausedStoreProductId = '';

const app = () => createApp().callback();

function storeData(name: string, status: 'OPEN' | 'PAUSED' | 'DISABLED' = 'OPEN') {
  return {
    name: `${name}_${runId}`,
    phone: '13800000000',
    address: '测试路 1 号',
    status,
  };
}

function productData(targetStoreId: string, categoryId: string, name: string, sortOrder: number) {
  return {
    storeId: targetStoreId,
    categoryId,
    name: `${name}_${runId}`,
    mainImageUrl: 'https://example.test/product-main.png',
    description: `${name}简短描述`,
    detail: `${name}图文详情`,
    afterSaleNotes: '生鲜商品请在签收后及时检查',
    remark: '后台备注不得公开',
    price: '8.50',
    originalPrice: '10.00',
    stock: 12,
    salesVolume: 5,
    purchaseLimit: 3,
    stockWarningThreshold: 4,
    isHot: true,
    status: 'ON_SALE' as const,
    sortOrder,
  };
}

describe('resident product browsing', () => {
  beforeAll(async () => {
    const communities = await Promise.all([
      prisma.community.create({
        data: {
          name: `商品小区_${runId}`,
          city: '测试市',
          district: '一区',
          detailedAddress: '商品路 1 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `其他商品小区_${runId}`,
          city: '测试市',
          district: '二区',
          detailedAddress: '其他路 2 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `停用商品小区_${runId}`,
          city: '测试市',
          district: '三区',
          detailedAddress: '停用路 3 号',
          status: 'DISABLED',
        },
      }),
    ]);
    communityIds.push(...communities.map((item) => item.id));
    [communityId, otherCommunityId, disabledCommunityId] = communities.map((item) => item.id);

    const stores = await Promise.all([
      prisma.store.create({ data: storeData('商品浏览店') }),
      prisma.store.create({ data: storeData('暂停商品店', 'PAUSED') }),
      prisma.store.create({ data: storeData('异地商品店') }),
      prisma.store.create({ data: storeData('停用商品店', 'DISABLED') }),
    ]);
    storeIds.push(...stores.map((item) => item.id));
    [storeId, pausedStoreId, otherStoreId, disabledStoreId] = stores.map((item) => item.id);
    await prisma.storeCommunity.createMany({
      data: [
        { storeId, communityId },
        { storeId: pausedStoreId, communityId },
        { storeId: disabledStoreId, communityId },
        { storeId: otherStoreId, communityId: otherCommunityId },
      ],
    });

    const categories = await Promise.all([
      prisma.productCategory.create({
        data: { storeId, name: `精选_${runId}`, sortOrder: 40 },
      }),
      prisma.productCategory.create({
        data: { storeId, name: `日常_${runId}`, sortOrder: 30 },
      }),
      prisma.productCategory.create({
        data: { storeId, name: `停用_${runId}`, status: 'DISABLED', sortOrder: 20 },
      }),
      prisma.productCategory.create({
        data: {
          storeId,
          name: `删除_${runId}`,
          status: 'DISABLED',
          deletedAt: new Date(),
          sortOrder: 10,
        },
      }),
      prisma.productCategory.create({
        data: { storeId: otherStoreId, name: `异店_${runId}` },
      }),
      prisma.productCategory.create({
        data: { storeId: pausedStoreId, name: `暂停店分类_${runId}` },
      }),
    ]);
    categoryIds.push(...categories.map((item) => item.id));
    [
      featuredCategoryId,
      regularCategoryId,
      disabledCategoryId,
      deletedCategoryId,
      otherCategoryId,
    ] = categories.map((item) => item.id);
    const pausedCategoryId = categories[5].id;

    const products = await Promise.all([
      prisma.product.create({
        data: {
          ...productData(storeId, featuredCategoryId, '鲜牛奶', 80),
          galleryImageUrls: [
            'https://example.test/product-1.png',
            'https://example.test/product-2.png',
          ],
        },
      }),
      prisma.product.create({
        data: {
          ...productData(storeId, featuredCategoryId, '售罄面包', 70),
          status: 'SOLD_OUT',
          stock: 0,
        },
      }),
      prisma.product.create({
        data: {
          ...productData(storeId, featuredCategoryId, '库存归零商品', 60),
          stock: 0,
        },
      }),
      prisma.product.create({
        data: productData(storeId, regularCategoryId, '日常纸巾', 50),
      }),
      prisma.product.create({
        data: {
          ...productData(storeId, featuredCategoryId, '下架商品', 40),
          status: 'OFF_SHELF',
        },
      }),
      prisma.product.create({
        data: {
          ...productData(storeId, featuredCategoryId, '删除商品', 30),
          status: 'OFF_SHELF',
          deletedAt: new Date(),
        },
      }),
      prisma.product.create({
        data: productData(storeId, disabledCategoryId, '停用分类商品', 20),
      }),
      prisma.product.create({
        data: productData(storeId, deletedCategoryId, '删除分类商品', 10),
      }),
      prisma.product.create({
        data: productData(pausedStoreId, pausedCategoryId, '暂停店商品', 10),
      }),
    ]);
    productIds.push(...products.map((item) => item.id));
    [
      onSaleProductId,
      soldOutProductId,
      zeroStockProductId,
      regularProductId,
      offShelfProductId,
      deletedProductId,
      disabledCategoryProductId,
      deletedCategoryProductId,
      pausedStoreProductId,
    ] = products.map((item) => item.id);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.productCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.storeCommunity.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.$disconnect();
  });

  it('lists only public categories and visible products for guest browsing', async () => {
    const response = await request(app()).get(`/api/v1/stores/${storeId}/products`).expect(200);

    expect(response.body.data.categories.map((item: { id: string }) => item.id)).toEqual([
      featuredCategoryId,
      regularCategoryId,
    ]);
    expect(response.body.data.list.map((item: { id: string }) => item.id)).toEqual([
      onSaleProductId,
      soldOutProductId,
      zeroStockProductId,
      regularProductId,
    ]);
    expect(response.body.data.list[0]).toMatchObject({
      price: '8.50',
      originalPrice: '10.00',
      stock: 12,
      status: 'ON_SALE',
      canPurchase: false,
    });
    expect(response.body.data.list[1]).toMatchObject({
      status: 'SOLD_OUT',
      canPurchase: false,
    });
    expect(response.body.data.list[2]).toMatchObject({
      status: 'SOLD_OUT',
      canPurchase: false,
    });
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toContain('sortOrder');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('stockWarningThreshold');
    expect(serialized).not.toContain('后台备注不得公开');
  });

  it('returns purchase eligibility only inside an orderable store context', async () => {
    const orderable = await request(app())
      .get(`/api/v1/stores/${storeId}/products`)
      .query({ communityId })
      .expect(200);
    expect(orderable.body.data.list[0]).toMatchObject({
      id: onSaleProductId,
      canPurchase: true,
    });
    expect(orderable.body.data.list[1].canPurchase).toBe(false);

    const paused = await request(app())
      .get(`/api/v1/stores/${pausedStoreId}/products`)
      .query({ communityId })
      .expect(200);
    expect(paused.body.data.list).toHaveLength(1);
    expect(paused.body.data.list[0]).toMatchObject({
      id: pausedStoreProductId,
      status: 'ON_SALE',
      canPurchase: false,
    });
  });

  it('filters by a visible category and rejects cross-store or hidden categories', async () => {
    const filtered = await request(app())
      .get(`/api/v1/stores/${storeId}/products`)
      .query({ categoryId: regularCategoryId, communityId })
      .expect(200);
    expect(filtered.body.data.list.map((item: { id: string }) => item.id)).toEqual([
      regularProductId,
    ]);

    for (const categoryId of [otherCategoryId, disabledCategoryId, deletedCategoryId]) {
      const response = await request(app())
        .get(`/api/v1/stores/${storeId}/products`)
        .query({ categoryId })
        .expect(404);
      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    }
  });

  it('reuses store and community visibility errors', async () => {
    const missingStore = await request(app())
      .get('/api/v1/stores/missing-store/products')
      .expect(404);
    expect(missingStore.body.code).toBe('STORE_NOT_FOUND');

    const disabledStore = await request(app())
      .get(`/api/v1/stores/${disabledStoreId}/products`)
      .expect(404);
    expect(disabledStore.body.code).toBe('STORE_NOT_FOUND');

    const notDeliverable = await request(app())
      .get(`/api/v1/stores/${otherStoreId}/products`)
      .query({ communityId })
      .expect(409);
    expect(notDeliverable.body.code).toBe('STORE_NOT_DELIVERABLE');

    const invalidCommunity = await request(app())
      .get(`/api/v1/stores/${storeId}/products`)
      .query({ communityId: disabledCommunityId })
      .expect(404);
    expect(invalidCommunity.body.code).toBe('COMMUNITY_NOT_FOUND');
  });

  it('returns complete public product details with server purchase eligibility', async () => {
    const detail = await request(app())
      .get(`/api/v1/products/${onSaleProductId}`)
      .query({ communityId })
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: onSaleProductId,
      name: `鲜牛奶_${runId}`,
      mainImageUrl: 'https://example.test/product-main.png',
      galleryImageUrls: [
        'https://example.test/product-1.png',
        'https://example.test/product-2.png',
      ],
      description: '鲜牛奶简短描述',
      detail: '鲜牛奶图文详情',
      afterSaleNotes: '生鲜商品请在签收后及时检查',
      price: '8.50',
      originalPrice: '10.00',
      salesVolume: 5,
      stock: 12,
      purchaseLimit: 3,
      status: 'ON_SALE',
      canPurchase: true,
    });
    expect(JSON.stringify(detail.body.data)).not.toContain('后台备注不得公开');

    const guest = await request(app()).get(`/api/v1/products/${onSaleProductId}`).expect(200);
    expect(guest.body.data.canPurchase).toBe(false);

    const soldOut = await request(app())
      .get(`/api/v1/products/${zeroStockProductId}`)
      .query({ communityId })
      .expect(200);
    expect(soldOut.body.data).toMatchObject({ status: 'SOLD_OUT', canPurchase: false });
  });

  it('hides off-shelf, deleted and hidden-category products from details', async () => {
    for (const id of [
      offShelfProductId,
      deletedProductId,
      disabledCategoryProductId,
      deletedCategoryProductId,
      'missing-product',
    ]) {
      const response = await request(app()).get(`/api/v1/products/${id}`);
      expect(response.status, `product ${id} must stay hidden`).toBe(404);
      expect(response.body.code, `product ${id} must use the stable error`).toBe(
        'PRODUCT_NOT_FOUND',
      );
    }
  });

  it('validates list pagination inputs', async () => {
    const response = await request(app())
      .get(`/api/v1/stores/${storeId}/products`)
      .query({ pageSize: 101 })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
