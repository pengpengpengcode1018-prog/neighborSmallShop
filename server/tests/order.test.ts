import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identities = new Map([
  [`order-code-a-${runId}`, `order-open-a-${runId}`],
  [`order-code-b-${runId}`, `order-open-b-${runId}`],
]);
const userIds: string[] = [];
let tokenA = '';
let tokenB = '';
let userAId = '';
let userBId = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
let slotId = '';
let addressAId = '';
let addressBId = '';

const provider: WechatIdentityProvider = {
  async exchangeCode(code) {
    const openId = identities.get(code);
    if (!openId) throw new Error('unexpected test code');
    return { openId };
  },
};
const app = () => createApp({ wechatIdentityProvider: provider }).callback();

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

function shanghaiDate(daysFromToday: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + daysFromToday * 86_400_000));
}

async function login(code: string): Promise<{ token: string; userId: string }> {
  const response = await request(app())
    .post('/api/v1/auth/wechat-login')
    .send({ code })
    .expect(200);
  return { token: response.body.data.token, userId: response.body.data.user.id };
}

async function addCart(token: string, quantity = 2): Promise<void> {
  await request(app())
    .post('/api/v1/cart/items')
    .set(auth(token))
    .send({ productId, quantity })
    .expect(200);
}

function preview(
  token: string,
  addressId: string,
  delivery: Record<string, unknown> = { deliveryType: 'ASAP' },
) {
  return request(app())
    .post('/api/v1/orders/preview')
    .set(auth(token))
    .send({ addressId, ...delivery });
}

interface PreviewData {
  previewVersion: string;
  summary: { payableTotal: string };
}

function createBody(
  previewData: PreviewData,
  addressId: string,
  requestId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    addressId,
    deliveryType: 'ASAP',
    requestId,
    expectedPreviewVersion: previewData.previewVersion,
    expectedPayableAmount: previewData.summary.payableTotal,
    ...overrides,
  };
}

describe('resident order preview and atomic creation', () => {
  beforeAll(async () => {
    const community = await prisma.community.create({
      data: {
        name: `订单小区_${runId}`,
        city: '上海市',
        district: '测试区',
        detailedAddress: '订单路 1 号',
      },
    });
    communityId = community.id;
    const store = await prisma.store.create({
      data: {
        name: `订单店铺_${runId}`,
        phone: '13800000000',
        address: '订单路 2 号',
        businessStartTime: '00:00',
        businessEndTime: '23:59',
        minimumOrderAmount: '20.00',
        defaultDeliveryFee: '4.00',
      },
    });
    storeId = store.id;
    await prisma.storeCommunity.create({
      data: {
        storeId,
        communityId,
        deliveryFeeOverride: '3.00',
        estimatedDeliveryMinutesOverride: 30,
      },
    });
    const category = await prisma.productCategory.create({
      data: { storeId, name: `订单分类_${runId}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: `订单商品_${runId}`,
        mainImageUrl: 'https://example.test/order-product.png',
        price: '12.00',
        stock: 10,
        status: 'ON_SALE',
      },
    });
    productId = product.id;
    const slot = await prisma.deliverySlot.create({
      data: {
        storeId,
        deliveryTime: '18:00',
        cutoffTime: '16:00',
        maxOrders: 1,
      },
    });
    slotId = slot.id;

    const userA = await login(`order-code-a-${runId}`);
    const userB = await login(`order-code-b-${runId}`);
    tokenA = userA.token;
    tokenB = userB.token;
    userAId = userA.userId;
    userBId = userB.userId;
    userIds.push(userAId, userBId);
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { currentCommunityId: communityId },
    });
    const addresses = await Promise.all([
      prisma.address.create({
        data: {
          userId: userAId,
          communityId,
          recipientName: '甲用户',
          phone: '13812345678',
          building: '1号楼',
          unit: '2单元',
          room: '301室',
          detail: '东门',
          isDefault: true,
          defaultKey: userAId,
        },
      }),
      prisma.address.create({
        data: {
          userId: userBId,
          communityId,
          recipientName: '乙用户',
          phone: '13912345678',
          building: '2号楼',
          room: '401室',
          isDefault: true,
          defaultKey: userBId,
        },
      }),
    ]);
    [addressAId, addressBId] = addresses.map((address) => address.id);
  });

  beforeEach(async () => {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.product.update({
      where: { id: productId },
      data: { price: '12.00', stock: 10, status: 'ON_SALE', purchaseLimit: null },
    });
    await prisma.store.update({
      where: { id: storeId },
      data: {
        status: 'OPEN',
        minimumOrderAmount: '20.00',
        asapDeliveryEnabled: true,
        scheduledDeliveryEnabled: true,
      },
    });
    await prisma.storeCommunity.update({
      where: { storeId_communityId: { storeId, communityId } },
      data: { status: 'ACTIVE', deliveryFeeOverride: '3.00' },
    });
    await prisma.deliverySlot.update({
      where: { id: slotId },
      data: { status: 'ENABLED', maxOrders: 1 },
    });
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userLoginLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.deliverySlot.delete({ where: { id: slotId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.storeCommunity.delete({
      where: { storeId_communityId: { storeId, communityId } },
    });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.community.delete({ where: { id: communityId } });
    await prisma.$disconnect();
  });

  it('previews from the server cart and authoritative prices', async () => {
    await addCart(tokenA);
    const response = await preview(tokenA, addressAId).expect(200);
    expect(response.body.data).toMatchObject({
      store: { id: storeId, name: `订单店铺_${runId}` },
      address: {
        id: addressAId,
        recipientName: '甲用户',
        phone: '13812345678',
        communityName: `订单小区_${runId}`,
      },
      items: [
        {
          productId,
          name: `订单商品_${runId}`,
          unitPrice: '12.00',
          quantity: 2,
          lineTotal: '24.00',
        },
      ],
      delivery: { type: 'ASAP', estimatedDeliveryMinutes: 30 },
      summary: {
        merchandiseTotal: '24.00',
        deliveryFee: '3.00',
        payableTotal: '27.00',
        minimumOrderAmount: '20.00',
      },
    });
    expect(response.body.data.previewVersion).toMatch(/^[a-f0-9]{64}$/);
  });

  it('atomically snapshots the order, deducts stock, clears cart and records initial status', async () => {
    await addCart(tokenA);
    const previewResponse = await preview(tokenA, addressAId).expect(200);
    const body = createBody(previewResponse.body.data, addressAId, `success-${runId}`);
    const created = await request(app())
      .post('/api/v1/orders')
      .set(auth(tokenA))
      .send(body)
      .expect(200);

    expect(created.body.data).toMatchObject({
      idempotentReplay: false,
      order: {
        orderNo: expect.stringMatching(/^NS\d{8}[A-F0-9]{10}$/),
        status: 'PENDING_PAYMENT',
        store: { id: storeId, name: `订单店铺_${runId}` },
        address: { recipientName: '甲用户', phone: '13812345678' },
        summary: { merchandiseTotal: '24.00', deliveryFee: '3.00', payableTotal: '27.00' },
      },
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 8,
      salesVolume: 0,
    });
    expect(await prisma.cart.findUnique({ where: { userId: userAId } })).toBeNull();
    const saved = await prisma.order.findUniqueOrThrow({
      where: { userId_requestId: { userId: userAId, requestId: `success-${runId}` } },
      include: { items: true, statusLogs: true },
    });
    expect(saved.items[0]).toMatchObject({
      productName: `订单商品_${runId}`,
      quantity: 2,
    });
    expect(saved.statusLogs).toHaveLength(1);
    expect(saved.statusLogs[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'PENDING_PAYMENT',
      operatorType: 'USER',
      operatorId: userAId,
    });
  });

  it('serializes concurrent retries and rejects a changed payload for that request id', async () => {
    await addCart(tokenA);
    const previewResponse = await preview(tokenA, addressAId).expect(200);
    const body = createBody(previewResponse.body.data, addressAId, `replay-${runId}`);
    const [first, replay] = await Promise.all([
      request(app()).post('/api/v1/orders').set(auth(tokenA)).send(body).expect(200),
      request(app()).post('/api/v1/orders').set(auth(tokenA)).send(body).expect(200),
    ]);
    expect([first.body.data.idempotentReplay, replay.body.data.idempotentReplay].sort()).toEqual([
      false,
      true,
    ]);
    expect(replay.body.data.order.id).toBe(first.body.data.order.id);
    expect(await prisma.order.count({ where: { userId: userAId } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(8);

    const conflict = await request(app())
      .post('/api/v1/orders')
      .set(auth(tokenA))
      .send({ ...body, remark: 'changed' })
      .expect(409);
    expect(conflict.body.code).toBe('DUPLICATE_REQUEST');
  });

  it('rolls back when the preview becomes stale', async () => {
    await addCart(tokenA);
    const previewResponse = await preview(tokenA, addressAId).expect(200);
    await prisma.product.update({ where: { id: productId }, data: { price: '13.00' } });
    const response = await request(app())
      .post('/api/v1/orders')
      .set(auth(tokenA))
      .send(createBody(previewResponse.body.data, addressAId, `stale-${runId}`))
      .expect(409);
    expect(response.body.code).toBe('ORDER_PREVIEW_STALE');
    expect(await prisma.order.count({ where: { userId: userAId } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(10);
    expect(await prisma.cart.findUnique({ where: { userId: userAId } })).not.toBeNull();
  });

  it('uses conditional stock updates so two residents cannot oversell the last unit', async () => {
    await prisma.store.update({ where: { id: storeId }, data: { minimumOrderAmount: '0.00' } });
    await prisma.product.update({ where: { id: productId }, data: { stock: 1 } });
    await Promise.all([addCart(tokenA, 1), addCart(tokenB, 1)]);
    const [previewA, previewB] = await Promise.all([
      preview(tokenA, addressAId).expect(200),
      preview(tokenB, addressBId).expect(200),
    ]);
    const results = await Promise.all([
      request(app())
        .post('/api/v1/orders')
        .set(auth(tokenA))
        .send(createBody(previewA.body.data, addressAId, `stock-a-${runId}`)),
      request(app())
        .post('/api/v1/orders')
        .set(auth(tokenB))
        .send(createBody(previewB.body.data, addressBId, `stock-b-${runId}`)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe(
      'PRODUCT_STOCK_NOT_ENOUGH',
    );
    expect(await prisma.order.count({ where: { userId: { in: userIds } } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);
  });

  it('validates address ownership, minimum amount and scheduled-slot capacity', async () => {
    await addCart(tokenA, 1);
    const foreignAddress = await preview(tokenA, addressBId).expect(404);
    expect(foreignAddress.body.code).toBe('ADDRESS_NOT_FOUND');
    const minimum = await preview(tokenA, addressAId).expect(409);
    expect(minimum.body.code).toBe('MINIMUM_ORDER_NOT_REACHED');

    await request(app())
      .put(
        `/api/v1/cart/items/${
          (await prisma.cartItem.findFirstOrThrow({ where: { cart: { userId: userAId } } })).id
        }`,
      )
      .set(auth(tokenA))
      .send({ quantity: 2 })
      .expect(200);
    await addCart(tokenB, 2);
    const delivery = {
      deliveryType: 'SCHEDULED',
      deliveryDate: shanghaiDate(1),
      deliverySlotId: slotId,
    };
    const [scheduledA, scheduledB] = await Promise.all([
      preview(tokenA, addressAId, delivery).expect(200),
      preview(tokenB, addressBId, delivery).expect(200),
    ]);
    const capacityRace = await Promise.all([
      request(app())
        .post('/api/v1/orders')
        .set(auth(tokenA))
        .send(createBody(scheduledA.body.data, addressAId, `slot-a-${runId}`, delivery)),
      request(app())
        .post('/api/v1/orders')
        .set(auth(tokenB))
        .send(createBody(scheduledB.body.data, addressBId, `slot-b-${runId}`, delivery)),
    ]);
    expect(capacityRace.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(capacityRace.find((response) => response.status === 409)?.body.code).toBe(
      'DELIVERY_SLOT_UNAVAILABLE',
    );
    expect(
      await prisma.order.count({
        where: {
          deliverySlotId: slotId,
          deliveryDate: new Date(`${delivery.deliveryDate}T00:00:00.000Z`),
        },
      }),
    ).toBe(1);
  });
});
