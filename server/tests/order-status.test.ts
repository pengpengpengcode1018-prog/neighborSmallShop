import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { OrderStatus } from '../src/generated/prisma/client.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const adminUsername = `order_status_admin_${runId}`;
const adminPassword = 'OrderStatusPass123!';
const identities = new Map([
  [`order-status-a-${runId}`, `order-status-open-a-${runId}`],
  [`order-status-b-${runId}`, `order-status-open-b-${runId}`],
]);
const userIds: string[] = [];
let tokenA = '';
let adminToken = '';
let userAId = '';
let userBId = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
let addressAId = '';
let addressBId = '';
let orderSequence = 0;

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

async function loginResident(code: string): Promise<{ token: string; userId: string }> {
  const response = await request(app())
    .post('/api/v1/auth/wechat-login')
    .send({ code })
    .expect(200);
  return { token: response.body.data.token, userId: response.body.data.user.id };
}

async function createTestOrder(
  userId: string,
  status: OrderStatus,
  overrides: {
    quantity?: number;
    adminRemark?: string;
    stockReleased?: boolean;
    expiresAt?: Date;
  } = {},
) {
  orderSequence += 1;
  const address = userId === userAId ? addressAId : addressBId;
  const recipientName = userId === userAId ? '甲用户' : '乙用户';
  const phone = userId === userAId ? '13812345678' : '13912345678';
  const quantity = overrides.quantity ?? 1;
  const unitPrice = '12.00';
  const lineTotal = (12 * quantity).toFixed(2);
  const paidAt = status === 'PENDING_PAYMENT' ? null : new Date();
  return prisma.order.create({
    data: {
      orderNo: `NST${runId.replaceAll('_', '').slice(-10)}${String(orderSequence).padStart(4, '0')}`,
      userId,
      storeId,
      addressId: address,
      requestId: `status-${runId}-${orderSequence}`,
      requestFingerprint: String(orderSequence).padStart(64, '0'),
      previewVersion: String(orderSequence + 10).padStart(64, '0'),
      status,
      deliveryType: 'ASAP',
      storeName: `状态店铺_${runId}`,
      storeLogoUrl: 'https://example.test/store.png',
      storePhone: '13700000000',
      merchandiseTotal: lineTotal,
      deliveryFee: '3.00',
      payableTotal: (12 * quantity + 3).toFixed(2),
      addressRecipientName: recipientName,
      addressPhone: phone,
      addressCommunityName: `状态小区_${runId}`,
      addressBuilding: '1号楼',
      addressUnit: null,
      addressRoom: '301室',
      addressDetail: null,
      adminRemark: overrides.adminRemark,
      stockReleased: overrides.stockReleased ?? false,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
      paidAt,
      items: {
        create: {
          productId,
          productName: `状态商品_${runId}`,
          productImageUrl: 'https://example.test/product.png',
          unitPrice,
          quantity,
          lineTotal,
        },
      },
      statusLogs: {
        create: {
          fromStatus: null,
          toStatus: status,
          operatorType: status === 'PENDING_PAYMENT' ? 'USER' : 'WECHAT',
          operatorId: status === 'PENDING_PAYMENT' ? userId : null,
          description: status === 'PENDING_PAYMENT' ? '居民提交订单' : '测试支付成功',
        },
      },
    },
  });
}

async function cleanupOrders(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await prisma.operationLog.deleteMany({
    where: { module: 'order', businessDataId: { in: orderIds } },
  });
  await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

describe('resident and admin order status truth', () => {
  beforeAll(async () => {
    const community = await prisma.community.create({
      data: {
        name: `状态小区_${runId}`,
        city: '上海市',
        district: '状态区',
        detailedAddress: '状态路 1 号',
      },
    });
    communityId = community.id;
    const store = await prisma.store.create({
      data: {
        name: `状态店铺_${runId}`,
        phone: '13700000000',
        address: '状态路 2 号',
      },
    });
    storeId = store.id;
    await prisma.storeCommunity.create({ data: { storeId, communityId } });
    const category = await prisma.productCategory.create({
      data: { storeId, name: `状态分类_${runId}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: `状态商品_${runId}`,
        price: '12.00',
        stock: 5,
        status: 'ON_SALE',
      },
    });
    productId = product.id;
    const residentA = await loginResident(`order-status-a-${runId}`);
    const residentB = await loginResident(`order-status-b-${runId}`);
    tokenA = residentA.token;
    userAId = residentA.userId;
    userBId = residentB.userId;
    userIds.push(userAId, userBId);
    await prisma.user.update({ where: { id: userAId }, data: { nickname: '甲昵称' } });
    await prisma.user.update({ where: { id: userBId }, data: { nickname: '乙昵称' } });
    const addresses = await Promise.all([
      prisma.address.create({
        data: {
          userId: userAId,
          communityId,
          recipientName: '甲用户',
          phone: '13812345678',
          building: '1号楼',
          room: '301室',
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
        },
      }),
    ]);
    [addressAId, addressBId] = addresses.map((address) => address.id);
    await prisma.admin.create({
      data: {
        username: adminUsername,
        displayName: '订单状态管理员',
        passwordHash: await bcrypt.hash(adminPassword, 4),
      },
    });
    const adminLogin = await request(app())
      .post('/api/v1/admin/auth/login')
      .send({ username: adminUsername, password: adminPassword })
      .expect(200);
    adminToken = adminLogin.body.data.token;
  });

  beforeEach(async () => {
    await cleanupOrders();
    await prisma.product.update({ where: { id: productId }, data: { stock: 5, salesVolume: 0 } });
  });

  afterAll(async () => {
    await cleanupOrders();
    await prisma.adminLoginLog.deleteMany({ where: { username: adminUsername } });
    await prisma.admin.deleteMany({ where: { username: adminUsername } });
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userLoginLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.storeCommunity.delete({
      where: { storeId_communityId: { storeId, communityId } },
    });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.community.delete({ where: { id: communityId } });
    await prisma.$disconnect();
  });

  it('isolates resident lists/details and returns snapshot cards with allowed actions', async () => {
    const pending = await createTestOrder(userAId, 'PENDING_PAYMENT');
    await createTestOrder(userAId, 'COMPLETED');
    const foreign = await createTestOrder(userBId, 'PENDING_PAYMENT');

    const list = await request(app())
      .get('/api/v1/orders?page=1&pageSize=10')
      .set(auth(tokenA))
      .expect(200);
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    expect(list.body.data.list).toHaveLength(2);
    expect(list.body.data.list.map((order: { id: string }) => order.id)).not.toContain(foreign.id);
    const pendingCard = list.body.data.list.find(
      (order: { id: string }) => order.id === pending.id,
    );
    expect(pendingCard).toMatchObject({
      status: 'PENDING_PAYMENT',
      store: { name: `状态店铺_${runId}`, logoUrl: 'https://example.test/store.png' },
      productSummary: { totalQuantity: 1, distinctCount: 1 },
      payableAmount: '15.00',
      allowedActions: ['PAY', 'CANCEL'],
    });

    const filtered = await request(app())
      .get('/api/v1/orders?status=COMPLETED&page=1&pageSize=10')
      .set(auth(tokenA))
      .expect(200);
    expect(filtered.body.data).toMatchObject({ total: 1, list: [{ status: 'COMPLETED' }] });

    const detail = await request(app())
      .get(`/api/v1/orders/${pending.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: pending.id,
      address: { phone: '13812345678' },
      store: { phone: '13700000000' },
      allowedActions: ['PAY', 'CANCEL'],
    });
    expect(detail.body.data.timeline).toHaveLength(1);
    expect(detail.body.data).not.toHaveProperty('adminRemark');
    await request(app()).get(`/api/v1/orders/${foreign.id}`).set(auth(tokenA)).expect(404);
  });

  it('hides payment actions while an expired order is waiting for the close worker', async () => {
    const expired = await createTestOrder(userAId, 'PENDING_PAYMENT', {
      expiresAt: new Date(Date.now() - 60_000),
    });
    const detail = await request(app())
      .get(`/api/v1/orders/${expired.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      status: 'PENDING_PAYMENT',
      statusLabel: '关闭处理中',
      isExpired: true,
      allowedActions: [],
    });
  });

  it('gives admins filterable masked lists and authorized full details', async () => {
    const order = await createTestOrder(userAId, 'PAID', { adminRemark: '内部测试备注' });
    await createTestOrder(userBId, 'PENDING_PAYMENT');
    const list = await request(app())
      .get(
        `/api/v1/admin/orders?phone=13812345678&storeId=${storeId}&status=PAID&page=1&pageSize=20`,
      )
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.data).toMatchObject({ total: 1 });
    expect(list.body.data.list[0]).toMatchObject({
      id: order.id,
      user: { nickname: '甲昵称', phone: '138****5678' },
      communityName: `状态小区_${runId}`,
      status: 'PAID',
      paymentStatus: 'PAID',
      deliveryType: 'ASAP',
    });

    const detail = await request(app())
      .get(`/api/v1/admin/orders/${order.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: order.id,
      user: { nickname: '甲昵称' },
      address: { phone: '13812345678' },
      adminRemark: '内部测试备注',
      allowedActions: ['ACCEPT'],
    });
    expect(detail.body.data.statusLogs).toHaveLength(1);
  });

  it('cancels a pending order idempotently and restores stock only once', async () => {
    const order = await createTestOrder(userAId, 'PENDING_PAYMENT', { quantity: 2 });
    const responses = await Promise.all([
      request(app())
        .post(`/api/v1/orders/${order.id}/cancel`)
        .set(auth(tokenA))
        .send({ reason: '不需要了' }),
      request(app())
        .post(`/api/v1/orders/${order.id}/cancel`)
        .set(auth(tokenA))
        .send({ reason: '不需要了' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.body.data.idempotentReplay).sort()).toEqual([
      false,
      true,
    ]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(7);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({
      status: 'CANCELLED',
      stockReleased: true,
      cancellationReason: '不需要了',
    });
    expect(saved.cancelledAt).not.toBeNull();
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('lets an administrator close a pending order through the audited close service', async () => {
    const order = await createTestOrder(userAId, 'PENDING_PAYMENT', { quantity: 2 });
    const body = {
      action: 'CLOSE',
      expectedStatus: 'PENDING_PAYMENT',
      remark: '管理员确认关闭',
    };
    const first = await request(app())
      .post(`/api/v1/admin/orders/${order.id}/status`)
      .set(auth(adminToken))
      .send(body)
      .expect(200);
    const replay = await request(app())
      .post(`/api/v1/admin/orders/${order.id}/status`)
      .set(auth(adminToken))
      .send(body)
      .expect(200);
    expect(first.body.data).toMatchObject({
      idempotentReplay: false,
      order: { status: 'CANCELLED', cancellationReason: '管理员确认关闭' },
    });
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(7);
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      await prisma.operationLog.count({ where: { module: 'order', businessDataId: order.id } }),
    ).toBe(1);
  });

  it('moves paid orders through the exact admin fulfillment state machine', async () => {
    const order = await createTestOrder(userAId, 'PAID');
    const transitions = [
      ['ACCEPT', 'PAID', 'ACCEPTED'],
      ['START_PREPARING', 'ACCEPTED', 'PREPARING'],
      ['MARK_READY', 'PREPARING', 'WAITING_DELIVERY'],
      ['START_DELIVERY', 'WAITING_DELIVERY', 'DELIVERING'],
      ['COMPLETE', 'DELIVERING', 'COMPLETED'],
    ] as const;
    for (const [action, expectedStatus, targetStatus] of transitions) {
      const response = await request(app())
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set(auth(adminToken))
        .send({ action, expectedStatus, remark: `${action} 测试` })
        .expect(200);
      expect(response.body.data).toMatchObject({
        idempotentReplay: false,
        order: { status: targetStatus },
      });
    }
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe('COMPLETED');
    expect(saved.acceptedAt).not.toBeNull();
    expect(saved.preparingAt).not.toBeNull();
    expect(saved.waitingDeliveryAt).not.toBeNull();
    expect(saved.deliveringAt).not.toBeNull();
    expect(saved.completedAt).not.toBeNull();
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(6);
    expect(
      await prisma.operationLog.count({ where: { module: 'order', businessDataId: order.id } }),
    ).toBe(5);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
  });

  it('serializes duplicate admin actions without duplicate status or operation logs', async () => {
    const order = await createTestOrder(userAId, 'PAID');
    const body = { action: 'ACCEPT', expectedStatus: 'PAID', remark: '并发接单' };
    const responses = await Promise.all([
      request(app())
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set(auth(adminToken))
        .send(body),
      request(app())
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set(auth(adminToken))
        .send(body),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.body.data.idempotentReplay).sort()).toEqual([
      false,
      true,
    ]);
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      await prisma.operationLog.count({ where: { module: 'order', businessDataId: order.id } }),
    ).toBe(1);
  });

  it('rejects payment forgery and illegal user or admin transitions', async () => {
    const pending = await createTestOrder(userAId, 'PENDING_PAYMENT');
    const paid = await createTestOrder(userAId, 'PAID');
    const forged = await request(app())
      .post(`/api/v1/admin/orders/${pending.id}/status`)
      .set(auth(adminToken))
      .send({ action: 'MARK_PAID', expectedStatus: 'PENDING_PAYMENT' })
      .expect(400);
    expect(forged.body.code).toBe('VALIDATION_ERROR');
    const skipped = await request(app())
      .post(`/api/v1/admin/orders/${pending.id}/status`)
      .set(auth(adminToken))
      .send({ action: 'ACCEPT', expectedStatus: 'PENDING_PAYMENT' })
      .expect(409);
    expect(skipped.body.code).toBe('INVALID_ORDER_STATUS');
    const residentCancel = await request(app())
      .post(`/api/v1/orders/${paid.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '已付款不能直接取消' })
      .expect(409);
    expect(residentCancel.body.code).toBe('ORDER_ALREADY_PAID');
  });

  it('updates internal admin remarks without exposing them to residents', async () => {
    const order = await createTestOrder(userAId, 'PAID');
    const updated = await request(app())
      .put(`/api/v1/admin/orders/${order.id}/remark`)
      .set(auth(adminToken))
      .send({ remark: '仅后台可见的履约说明' })
      .expect(200);
    expect(updated.body.data.adminRemark).toBe('仅后台可见的履约说明');
    const resident = await request(app())
      .get(`/api/v1/orders/${order.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(resident.body.data).not.toHaveProperty('adminRemark');
    expect(
      await prisma.operationLog.count({ where: { module: 'order', businessDataId: order.id } }),
    ).toBe(1);
  });
});
