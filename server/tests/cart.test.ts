import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identities = new Map([
  [`cart-code-owner-${runId}`, `cart-owner-${runId}`],
  [`cart-code-other-${runId}`, `cart-other-${runId}`],
  [`cart-code-no-community-${runId}`, `cart-no-community-${runId}`],
]);
const userIds: string[] = [];
const communityIds: string[] = [];
const storeIds: string[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
let ownerToken = '';
let otherToken = '';
let noCommunityToken = '';
let communityId = '';
let otherCommunityId = '';
let storeAId = '';
let storeBId = '';
let pausedStoreId = '';
let noDeliveryStoreId = '';
let productAId = '';
let productA2Id = '';
let productBId = '';
let pausedProductId = '';
let noDeliveryProductId = '';
let soldOutProductId = '';
let offShelfProductId = '';
let disabledCategoryProductId = '';
let ownerItemId = '';

const provider: WechatIdentityProvider = {
  async exchangeCode(code) {
    const openId = identities.get(code);
    if (!openId) throw new Error('unexpected test code');
    return { openId };
  },
};
const app = () => createApp({ wechatIdentityProvider: provider }).callback();

function storeData(name: string, status: 'OPEN' | 'PAUSED' = 'OPEN') {
  return {
    name: `${name}_${runId}`,
    phone: '13800000000',
    address: '购物车测试路 1 号',
    minimumOrderAmount: '20.00',
    defaultDeliveryFee: '4.00',
    status,
  };
}

function productData(
  storeId: string,
  categoryId: string,
  name: string,
  price: string,
  stock: number,
) {
  return {
    storeId,
    categoryId,
    name: `${name}_${runId}`,
    price,
    stock,
    status: 'ON_SALE' as const,
  };
}

async function login(code: string): Promise<{ token: string; userId: string }> {
  const response = await request(app())
    .post('/api/v1/auth/wechat-login')
    .send({ code })
    .expect(200);
  return { token: response.body.data.token, userId: response.body.data.user.id };
}

describe('resident single-store cart', () => {
  beforeAll(async () => {
    const communities = await Promise.all([
      prisma.community.create({
        data: {
          name: `购物车小区_${runId}`,
          city: '测试市',
          district: '一区',
          detailedAddress: '购物车路 1 号',
        },
      }),
      prisma.community.create({
        data: {
          name: `其他购物车小区_${runId}`,
          city: '测试市',
          district: '二区',
          detailedAddress: '其他路 2 号',
        },
      }),
    ]);
    communityIds.push(...communities.map((item) => item.id));
    [communityId, otherCommunityId] = communities.map((item) => item.id);

    const stores = await Promise.all([
      prisma.store.create({ data: storeData('购物车甲店') }),
      prisma.store.create({ data: storeData('购物车乙店') }),
      prisma.store.create({ data: storeData('暂停购物车店', 'PAUSED') }),
      prisma.store.create({ data: storeData('不配送购物车店') }),
    ]);
    storeIds.push(...stores.map((item) => item.id));
    [storeAId, storeBId, pausedStoreId, noDeliveryStoreId] = stores.map((item) => item.id);
    await prisma.storeCommunity.createMany({
      data: [
        {
          storeId: storeAId,
          communityId,
          minimumOrderAmountOverride: '20.00',
          deliveryFeeOverride: '3.00',
        },
        { storeId: storeBId, communityId },
        { storeId: pausedStoreId, communityId },
        { storeId: noDeliveryStoreId, communityId: otherCommunityId },
      ],
    });

    const categories = await Promise.all([
      prisma.productCategory.create({ data: { storeId: storeAId, name: `甲店分类_${runId}` } }),
      prisma.productCategory.create({ data: { storeId: storeBId, name: `乙店分类_${runId}` } }),
      prisma.productCategory.create({
        data: { storeId: pausedStoreId, name: `暂停店分类_${runId}` },
      }),
      prisma.productCategory.create({
        data: { storeId: noDeliveryStoreId, name: `不配送店分类_${runId}` },
      }),
      prisma.productCategory.create({
        data: { storeId: storeAId, name: `停用分类_${runId}`, status: 'DISABLED' },
      }),
    ]);
    categoryIds.push(...categories.map((item) => item.id));

    const products = await Promise.all([
      prisma.product.create({
        data: {
          ...productData(storeAId, categories[0].id, '限购牛奶', '5.50', 10),
          purchaseLimit: 6,
        },
      }),
      prisma.product.create({
        data: productData(storeAId, categories[0].id, '库存面包', '4.00', 2),
      }),
      prisma.product.create({
        data: productData(storeBId, categories[1].id, '乙店商品', '7.00', 3),
      }),
      prisma.product.create({
        data: productData(pausedStoreId, categories[2].id, '暂停店商品', '6.00', 5),
      }),
      prisma.product.create({
        data: productData(noDeliveryStoreId, categories[3].id, '不配送商品', '6.00', 5),
      }),
      prisma.product.create({
        data: {
          ...productData(storeAId, categories[0].id, '售罄商品', '6.00', 0),
          status: 'SOLD_OUT',
        },
      }),
      prisma.product.create({
        data: {
          ...productData(storeAId, categories[0].id, '下架商品', '6.00', 5),
          status: 'OFF_SHELF',
        },
      }),
      prisma.product.create({
        data: productData(storeAId, categories[4].id, '停用分类商品', '6.00', 5),
      }),
    ]);
    productIds.push(...products.map((item) => item.id));
    [
      productAId,
      productA2Id,
      productBId,
      pausedProductId,
      noDeliveryProductId,
      soldOutProductId,
      offShelfProductId,
      disabledCategoryProductId,
    ] = products.map((item) => item.id);

    const owner = await login(`cart-code-owner-${runId}`);
    const other = await login(`cart-code-other-${runId}`);
    const noCommunity = await login(`cart-code-no-community-${runId}`);
    userIds.push(owner.userId, other.userId, noCommunity.userId);
    ownerToken = owner.token;
    otherToken = other.token;
    noCommunityToken = noCommunity.token;

    for (const token of [ownerToken, otherToken]) {
      await request(app())
        .put('/api/v1/users/current-community')
        .set('authorization', `Bearer ${token}`)
        .send({ communityId })
        .expect(200);
    }
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userLoginLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.productCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.storeCommunity.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.$disconnect();
  });

  it('requires a resident session and an account current community for writes', async () => {
    const unauthenticated = await request(app()).get('/api/v1/cart').expect(401);
    expect(unauthenticated.body.code).toBe('UNAUTHORIZED');

    const noCommunity = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${noCommunityToken}`)
      .send({ productId: productAId, quantity: 1 })
      .expect(409);
    expect(noCommunity.body.code).toBe('COMMUNITY_REQUIRED');
  });

  it('adds same-store products, increments duplicates and calculates live amounts', async () => {
    const first = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ productId: productAId, quantity: 2 })
      .expect(200);
    ownerItemId = first.body.data.items[0].id;
    expect(first.body.data).toMatchObject({
      store: { id: storeAId, name: `购物车甲店_${runId}` },
      items: [
        {
          productId: productAId,
          quantity: 2,
          unitPrice: '5.50',
          lineTotal: '11.00',
          available: true,
          unavailableReason: null,
        },
      ],
      summary: {
        itemCount: 2,
        merchandiseTotal: '11.00',
        deliveryFee: '3.00',
        payableTotal: '14.00',
        minimumOrderAmount: '20.00',
        amountToMinimum: '9.00',
        meetsMinimumOrder: false,
        canCheckout: false,
        blockedReason: 'MINIMUM_ORDER_NOT_REACHED',
      },
    });

    const incremented = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ productId: productAId, quantity: 1 })
      .expect(200);
    expect(incremented.body.data.items[0].quantity).toBe(3);

    const reached = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ productId: productA2Id, quantity: 1 })
      .expect(200);
    expect(reached.body.data.summary).toMatchObject({
      itemCount: 4,
      merchandiseTotal: '20.50',
      payableTotal: '23.50',
      amountToMinimum: '0.00',
      meetsMinimumOrder: true,
      canCheckout: true,
      blockedReason: null,
    });
  });

  it('enforces product, stock, limit, store and delivery rules on every add', async () => {
    const cases: Array<[string, string, number]> = [
      [productAId, 'PRODUCT_PURCHASE_LIMIT_EXCEEDED', 4],
      [productA2Id, 'PRODUCT_STOCK_NOT_ENOUGH', 2],
      [soldOutProductId, 'PRODUCT_STOCK_NOT_ENOUGH', 1],
      [offShelfProductId, 'PRODUCT_OFF_SHELF', 1],
      [disabledCategoryProductId, 'PRODUCT_OFF_SHELF', 1],
      [pausedProductId, 'STORE_PAUSED', 1],
      [noDeliveryProductId, 'STORE_NOT_DELIVERABLE', 1],
      ['missing-product', 'PRODUCT_NOT_FOUND', 1],
    ];
    for (const [productId, code, quantity] of cases) {
      const response = await request(app())
        .post('/api/v1/cart/items')
        .set('authorization', `Bearer ${ownerToken}`)
        .send({ productId, quantity });
      expect(response.status, code).toBe(code === 'PRODUCT_NOT_FOUND' ? 404 : 409);
      expect(response.body.code).toBe(code);
    }
  }, 10_000);

  it('requires explicit confirmation before atomically replacing another store', async () => {
    const conflict = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ productId: productBId, quantity: 1 })
      .expect(409);
    expect(conflict.body.code).toBe('CART_STORE_CONFLICT');
    expect((await prisma.cart.findUniqueOrThrow({ where: { userId: userIds[0] } })).storeId).toBe(
      storeAId,
    );

    const replaced = await request(app())
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ productId: productBId, quantity: 1, replaceExistingCart: true })
      .expect(200);
    ownerItemId = replaced.body.data.items[0].id;
    expect(replaced.body.data.store.id).toBe(storeBId);
    expect(replaced.body.data.items).toHaveLength(1);
    expect(replaced.body.data.items[0]).toMatchObject({ productId: productBId, quantity: 1 });
    expect(await prisma.cartItem.count({ where: { cart: { userId: userIds[0] } } })).toBe(1);
  });

  it('isolates residents and validates quantity updates', async () => {
    const otherCart = await request(app())
      .get('/api/v1/cart')
      .set('authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherCart.body.data.items).toEqual([]);

    const crossUser = await request(app())
      .put(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${otherToken}`)
      .send({ quantity: 2 })
      .expect(404);
    expect(crossUser.body.code).toBe('CART_ITEM_NOT_FOUND');

    const invalid = await request(app())
      .put(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 0 })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const overStock = await request(app())
      .put(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 4 })
      .expect(409);
    expect(overStock.body.code).toBe('PRODUCT_STOCK_NOT_ENOUGH');

    const updated = await request(app())
      .put(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 2 })
      .expect(200);
    expect(updated.body.data.items[0].quantity).toBe(2);
  });

  it('keeps invalidated items visible with stable recovery reasons', async () => {
    await prisma.product.update({ where: { id: productBId }, data: { status: 'OFF_SHELF' } });
    const invalidated = await request(app())
      .get('/api/v1/cart')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(invalidated.body.data.items[0]).toMatchObject({
      id: ownerItemId,
      available: false,
      unavailableReason: 'PRODUCT_OFF_SHELF',
    });
    expect(invalidated.body.data.summary).toMatchObject({
      canCheckout: false,
      blockedReason: 'ITEM_UNAVAILABLE',
    });
    expect(await prisma.cartItem.count({ where: { id: ownerItemId } })).toBe(1);
  });

  it('handles concurrent quantity updates without duplicating the item', async () => {
    await prisma.product.update({ where: { id: productBId }, data: { status: 'ON_SALE' } });
    const responses = await Promise.all([
      request(app())
        .put(`/api/v1/cart/items/${ownerItemId}`)
        .set('authorization', `Bearer ${ownerToken}`)
        .send({ quantity: 1 }),
      request(app())
        .put(`/api/v1/cart/items/${ownerItemId}`)
        .set('authorization', `Bearer ${ownerToken}`)
        .send({ quantity: 2 }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const stored = await prisma.cartItem.findUniqueOrThrow({ where: { id: ownerItemId } });
    expect([1, 2]).toContain(stored.quantity);
    expect(await prisma.cartItem.count({ where: { cart: { userId: userIds[0] } } })).toBe(1);
  });

  it('deletes owned items, removes empty carts and clears idempotently', async () => {
    const otherDelete = await request(app())
      .delete(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect(otherDelete.body.code).toBe('CART_ITEM_NOT_FOUND');

    const deleted = await request(app())
      .delete(`/api/v1/cart/items/${ownerItemId}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(deleted.body.data.items).toEqual([]);
    expect(await prisma.cart.count({ where: { userId: userIds[0] } })).toBe(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cleared = await request(app())
        .delete('/api/v1/cart')
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(cleared.body.data.items).toEqual([]);
    }
  });
});
