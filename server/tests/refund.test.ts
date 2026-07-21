import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { OrderStatus } from '../src/generated/prisma/client.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';
import {
  WechatPaymentProviderError,
  type CreateWechatRefundInput,
  type WechatRefundNotification,
  type WechatRefundProvider,
  type WechatRefundProviderStatus,
  type WechatRefundResult,
} from '../src/providers/wechat-payment.provider.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const adminUsername = `refund_admin_${runId}`;
const adminPassword = 'RefundAdminPass123!';
const merchant = { appId: 'wx-refund-fixture', merchantId: '1900000001' };
const identities = new Map([
  [`refund-user-a-${runId}`, `refund-open-a-${runId}`],
  [`refund-user-b-${runId}`, `refund-open-b-${runId}`],
]);
const userIds: string[] = [];
let tokenA = '';
let tokenB = '';
let adminToken = '';
let userAId = '';
let userBId = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
let addressAId = '';
let addressBId = '';
let sequence = 0;
let createInputs: CreateWechatRefundInput[] = [];
let queryInputs: string[] = [];
let createStatus: WechatRefundProviderStatus = 'PROCESSING';
let queryStatus: WechatRefundProviderStatus = 'PROCESSING';
let createFailure: WechatPaymentProviderError | null = null;
let queryFailure: WechatPaymentProviderError | null = null;
let notificationValue: WechatRefundNotification | null = null;

const identityProvider: WechatIdentityProvider = {
  async exchangeCode(code) {
    const openId = identities.get(code);
    if (!openId) throw new Error('unexpected test code');
    return { openId };
  },
};

function resultFor(
  input: { transactionId: string; outRefundNo: string; outTradeNo: string },
  status: WechatRefundProviderStatus,
  overrides: Partial<WechatRefundResult> = {},
): WechatRefundResult {
  return {
    refundId: `503${input.outRefundNo.replaceAll(/[^A-Za-z0-9]/g, '').slice(-27)}`.slice(0, 32),
    outRefundNo: input.outRefundNo,
    transactionId: input.transactionId,
    outTradeNo: input.outTradeNo,
    status,
    amountRefund: 2700,
    amountTotal: 2700,
    currency: 'CNY',
    successTime: status === 'SUCCESS' ? new Date().toISOString() : null,
    ...overrides,
  };
}

async function refundContext(outRefundNo: string) {
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { refundNo: outRefundNo },
    include: { payment: true },
  });
  return {
    transactionId: refund.payment.transactionId!,
    outRefundNo,
    outTradeNo: refund.payment.outTradeNo,
  };
}

const refundProvider: WechatRefundProvider = {
  merchant,
  async createRefund(input) {
    createInputs.push(input);
    if (createFailure) throw createFailure;
    const refund = await prisma.refund.findUniqueOrThrow({
      where: { refundNo: input.outRefundNo },
      include: { payment: true },
    });
    return resultFor(
      {
        transactionId: input.transactionId,
        outRefundNo: input.outRefundNo,
        outTradeNo: refund.payment.outTradeNo,
      },
      createStatus,
    );
  },
  async queryRefund(outRefundNo) {
    queryInputs.push(outRefundNo);
    if (queryFailure) throw queryFailure;
    return resultFor(await refundContext(outRefundNo), queryStatus);
  },
  async verifyRefundNotification() {
    if (!notificationValue) throw new WechatPaymentProviderError('invalid_notification');
    return notificationValue;
  },
};

const app = () =>
  createApp({
    wechatIdentityProvider: identityProvider,
    wechatRefundProvider: refundProvider,
  }).callback();

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function login(code: string): Promise<{ token: string; userId: string }> {
  const response = await request(app())
    .post('/api/v1/auth/wechat-login')
    .send({ code })
    .expect(200);
  return { token: response.body.data.token, userId: response.body.data.user.id };
}

async function cleanupOrders(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const refunds = await prisma.refund.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const refundIds = refunds.map((refund) => refund.id);
  await prisma.refundNotification.deleteMany({ where: { refundId: { in: refundIds } } });
  await prisma.operationLog.deleteMany({
    where: {
      OR: [
        { module: 'refund', businessDataId: { in: refundIds } },
        { module: 'order', businessDataId: { in: orderIds } },
      ],
    },
  });
  await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function createPaidOrder(userId = userAId, status: OrderStatus = 'PAID', quantity = 2) {
  sequence += 1;
  const addressId = userId === userAId ? addressAId : addressBId;
  const orderNo = `NR${runId.replaceAll('_', '').slice(-14)}${String(sequence).padStart(4, '0')}`;
  const payableTotal = (12 * quantity + 3).toFixed(2);
  const transactionId =
    `42${runId.replaceAll('_', '').slice(-22)}${String(sequence).padStart(4, '0')}`
      .slice(0, 32)
      .padEnd(32, '0');
  return prisma.order.create({
    data: {
      orderNo,
      userId,
      storeId,
      addressId,
      requestId: `refund-order-${runId}-${sequence}`,
      requestFingerprint: String(sequence).padStart(64, '0'),
      previewVersion: String(sequence + 100).padStart(64, '0'),
      status,
      deliveryType: 'ASAP',
      storeName: `退款店铺_${runId}`,
      storePhone: '13700000000',
      merchandiseTotal: (12 * quantity).toFixed(2),
      deliveryFee: '3.00',
      payableTotal,
      addressRecipientName: userId === userAId ? '退款甲居民' : '退款乙居民',
      addressPhone: userId === userAId ? '13812345678' : '13912345678',
      addressCommunityName: `退款小区_${runId}`,
      addressBuilding: '1号楼',
      addressRoom: '301室',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      paidAt: new Date(),
      items: {
        create: {
          productId,
          productName: `退款商品_${runId}`,
          unitPrice: '12.00',
          quantity,
          lineTotal: (12 * quantity).toFixed(2),
        },
      },
      statusLogs: {
        create: {
          fromStatus: 'PENDING_PAYMENT',
          toStatus: status,
          operatorType: 'WECHAT',
          description: '测试支付成功',
        },
      },
      payment: {
        create: {
          outTradeNo: orderNo,
          status: 'SUCCESS',
          amount: payableTotal,
          currency: 'CNY',
          transactionId,
          tradeState: 'SUCCESS',
          succeededAt: new Date(),
        },
      },
    },
  });
}

function applyRefund(orderId: string, requestId = `refund-request-${runId}`) {
  return request(app())
    .post(`/api/v1/orders/${orderId}/refunds`)
    .set(auth(tokenA))
    .send({ requestId, reason: 'NO_LONGER_NEEDED', note: null });
}

function notification(result: WechatRefundResult, id: string): WechatRefundNotification {
  return {
    ...result,
    merchantId: merchant.merchantId,
    notificationId: id,
    eventType: `REFUND.${result.status}`,
    payloadDigest: id.padEnd(64, 'a').slice(0, 64),
  };
}

describe('resident application and audited WeChat refund recovery', () => {
  beforeAll(async () => {
    const community = await prisma.community.create({
      data: {
        name: `退款小区_${runId}`,
        city: '上海市',
        district: '退款区',
        detailedAddress: '退款路 1 号',
      },
    });
    communityId = community.id;
    const store = await prisma.store.create({
      data: { name: `退款店铺_${runId}`, phone: '13700000000', address: '退款路 2 号' },
    });
    storeId = store.id;
    await prisma.storeCommunity.create({ data: { storeId, communityId } });
    const category = await prisma.productCategory.create({
      data: { storeId, name: `退款分类_${runId}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: `退款商品_${runId}`,
        price: '12.00',
        stock: 8,
        salesVolume: 2,
        status: 'ON_SALE',
      },
    });
    productId = product.id;
    const userA = await login(`refund-user-a-${runId}`);
    const userB = await login(`refund-user-b-${runId}`);
    tokenA = userA.token;
    tokenB = userB.token;
    userAId = userA.userId;
    userBId = userB.userId;
    userIds.push(userAId, userBId);
    const addresses = await Promise.all([
      prisma.address.create({
        data: {
          userId: userAId,
          communityId,
          recipientName: '退款甲居民',
          phone: '13812345678',
          building: '1号楼',
          room: '301室',
        },
      }),
      prisma.address.create({
        data: {
          userId: userBId,
          communityId,
          recipientName: '退款乙居民',
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
        displayName: '退款审核管理员',
        passwordHash: await bcrypt.hash(adminPassword, 4),
      },
    });
    const admin = await request(app())
      .post('/api/v1/admin/auth/login')
      .send({ username: adminUsername, password: adminPassword })
      .expect(200);
    adminToken = admin.body.data.token;
  });

  beforeEach(async () => {
    await cleanupOrders();
    createInputs = [];
    queryInputs = [];
    createStatus = 'PROCESSING';
    queryStatus = 'PROCESSING';
    createFailure = null;
    queryFailure = null;
    notificationValue = null;
    await prisma.product.update({
      where: { id: productId },
      data: { stock: 8, salesVolume: 2 },
    });
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

  it('allows only the owner of a paid unaccepted order to apply once with server amount', async () => {
    const order = await createPaidOrder();
    const foreign = await createPaidOrder(userBId);
    const accepted = await createPaidOrder(userAId, 'ACCEPTED');
    await request(app()).post(`/api/v1/orders/${order.id}/refunds`).send({}).expect(401);
    await request(app())
      .post(`/api/v1/orders/${foreign.id}/refunds`)
      .set(auth(tokenA))
      .send({ requestId: `foreign-${runId}`, reason: 'NO_LONGER_NEEDED', note: null })
      .expect(404);
    const blocked = await applyRefund(accepted.id, `accepted-${runId}`).expect(409);
    expect(blocked.body.code).toBe('REFUND_NOT_ALLOWED');
    await request(app())
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set(auth(tokenA))
      .send({
        requestId: `forged-${runId}`,
        reason: 'NO_LONGER_NEEDED',
        note: null,
        amount: '0.01',
      })
      .expect(400);

    const first = await applyRefund(order.id).expect(200);
    const replay = await applyRefund(order.id).expect(200);
    expect(first.body.data).toMatchObject({
      idempotentReplay: false,
      refund: {
        amount: '27.00',
        status: 'PENDING_REVIEW',
        order: { id: order.id, status: 'REFUND_PENDING' },
      },
    });
    expect(replay.body.data.idempotentReplay).toBe(true);
    const duplicate = await applyRefund(order.id, `second-${runId}`).expect(409);
    expect(duplicate.body.code).toBe('REFUND_ALREADY_EXISTS');
    const detail = await request(app())
      .get(`/api/v1/orders/${order.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      status: 'REFUND_PENDING',
      allowedActions: [],
      refund: { id: first.body.data.refund.id, status: 'PENDING_REVIEW', amount: '27.00' },
    });
    await request(app())
      .get(`/api/v1/refunds/${first.body.data.refund.id}`)
      .set(auth(tokenB))
      .expect(404);
  });

  it('lets an admin reject once, restores the order to paid and audits the decision', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    const refundId = applied.body.data.refund.id;
    const list = await request(app())
      .get('/api/v1/admin/refunds?status=PENDING_REVIEW&page=1&pageSize=20')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.data.list[0]).toMatchObject({
      id: refundId,
      order: { orderNo: order.orderNo, phone: '138****5678' },
      allowedActions: ['APPROVE', 'REJECT'],
    });
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });

    const first = await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/reject`)
      .set(auth(adminToken))
      .send({ reviewNote: '店铺可以正常履约' })
      .expect(200);
    const replay = await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/reject`)
      .set(auth(adminToken))
      .send({ reviewNote: '店铺可以正常履约' })
      .expect(200);
    expect(first.body.data).toMatchObject({
      idempotentReplay: false,
      refund: { status: 'REJECTED', reviewNote: '店铺可以正常履约' },
    });
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'PAID',
      stockReleased: false,
    });
    expect(
      await prisma.operationLog.count({ where: { module: 'refund', businessDataId: refundId } }),
    ).toBe(1);
  });

  it('confirms processing through trusted query and restores inventory and sales only once', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    const refundId = applied.body.data.refund.id;
    const approved = await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set(auth(adminToken))
      .send({ reviewNote: '同意整单退款' })
      .expect(200);
    expect(approved.body.data.refund.status).toBe('PROCESSING');
    expect(createInputs[0]).toMatchObject({
      transactionId: expect.any(String),
      outRefundNo: approved.body.data.refund.refundNo,
      amountRefund: 2700,
      amountTotal: 2700,
      currency: 'CNY',
    });

    queryStatus = 'SUCCESS';
    const resident = await request(app())
      .get(`/api/v1/refunds/${refundId}`)
      .set(auth(tokenA))
      .expect(200);
    expect(resident.body.data).toMatchObject({
      status: 'SUCCESS',
      statusLabel: '退款成功',
      refreshPending: false,
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'REFUNDED',
      stockReleased: true,
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 10,
      salesVolume: 0,
    });

    const savedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    const successResult = resultFor(await refundContext(savedRefund.refundNo), 'SUCCESS', {
      refundId: savedRefund.providerRefundId!,
    });
    notificationValue = notification(successResult, `refund-notify-${runId}`);
    const notify = () =>
      request(app())
        .post('/api/v1/refunds/wechat/notify')
        .set({
          'wechatpay-serial': 'fixture',
          'wechatpay-signature': 'fixture',
          'wechatpay-timestamp': Math.floor(Date.now() / 1000).toString(),
          'wechatpay-nonce': 'fixture',
        })
        .send({ fixture: true });
    expect((await notify().expect(200)).body.data.idempotentReplay).toBe(true);
    expect((await notify().expect(200)).body.data.idempotentReplay).toBe(true);
    expect(await prisma.refundNotification.count({ where: { refundId } })).toBe(1);
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(3);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 10,
      salesVolume: 0,
    });
  });

  it('keeps one refund number and reserved stock while an unknown application is retried', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    const refundId = applied.body.data.refund.id;
    createFailure = new WechatPaymentProviderError('unavailable');
    queryFailure = new WechatPaymentProviderError('unavailable');
    const unknown = await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set(auth(adminToken))
      .send({})
      .expect(503);
    expect(unknown.body.code).toBe('REFUND_UNAVAILABLE');
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).toMatchObject({
      status: 'APPROVED',
      failureReason: 'refund_apply_unavailable',
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'REFUND_PENDING',
      stockReleased: false,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(8);

    createFailure = null;
    queryFailure = null;
    const retried = await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set(auth(adminToken))
      .send({})
      .expect(200);
    expect(retried.body.data.refund.status).toBe('PROCESSING');
    expect(createInputs).toHaveLength(2);
    expect(new Set(createInputs.map((input) => input.outRefundNo)).size).toBe(1);
  });

  it('serializes concurrent approvals and uses one merchant refund number', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    const refundId = applied.body.data.refund.id;
    const responses = await Promise.all([
      request(app())
        .post(`/api/v1/admin/refunds/${refundId}/approve`)
        .set(auth(adminToken))
        .send({ reviewNote: '并发审核甲' }),
      request(app())
        .post(`/api/v1/admin/refunds/${refundId}/approve`)
        .set(auth(adminToken))
        .send({ reviewNote: '并发审核乙' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const externalRefundNumbers = [
      ...createInputs.map((input) => input.outRefundNo),
      ...queryInputs,
    ];
    expect(externalRefundNumbers.length).toBeGreaterThanOrEqual(2);
    expect(new Set(externalRefundNumbers)).toEqual(
      new Set([responses[0].body.data.refund.refundNo]),
    );
    expect(
      await prisma.operationLog.count({ where: { module: 'refund', businessDataId: refundId } }),
    ).toBe(1);
    const saved = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(saved.status).toBe('PROCESSING');
    expect(['并发审核甲', '并发审核乙']).toContain(saved.reviewNote);
  });

  it('records a provider terminal failure without releasing stock or claiming success', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    createStatus = 'ABNORMAL';
    const approved = await request(app())
      .post(`/api/v1/admin/refunds/${applied.body.data.refund.id}/approve`)
      .set(auth(adminToken))
      .send({})
      .expect(200);
    expect(approved.body.data.refund).toMatchObject({
      status: 'FAILED',
      failureReason: 'provider_abnormal',
      failureMessage: '微信退款异常，请联系平台处理',
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'REFUND_PENDING',
      stockReleased: false,
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 8,
      salesVolume: 2,
    });
  });

  it('rejects a mismatched signed result without changing order or inventory', async () => {
    const order = await createPaidOrder();
    const applied = await applyRefund(order.id).expect(200);
    const refundId = applied.body.data.refund.id;
    await request(app())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set(auth(adminToken))
      .send({})
      .expect(200);
    const saved = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    notificationValue = notification(
      resultFor(await refundContext(saved.refundNo), 'SUCCESS', { amountRefund: 1 }),
      `refund-mismatch-${runId}`,
    );
    const response = await request(app())
      .post('/api/v1/refunds/wechat/notify')
      .set({
        'wechatpay-serial': 'fixture',
        'wechatpay-signature': 'fixture',
        'wechatpay-timestamp': Math.floor(Date.now() / 1000).toString(),
        'wechatpay-nonce': 'fixture',
      })
      .send({ fixture: true })
      .expect(400);
    expect(response.body.code).toBe('REFUND_NOTIFICATION_INVALID');
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).toMatchObject({
      status: 'PROCESSING',
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'REFUND_PENDING',
      stockReleased: false,
    });
    expect(await prisma.refundNotification.count({ where: { refundId } })).toBe(0);
  });

  it('serializes resident refund application against admin order acceptance', async () => {
    const order = await createPaidOrder();
    const [refundResponse, acceptResponse] = await Promise.all([
      applyRefund(order.id, `race-${runId}`),
      request(app())
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set(auth(adminToken))
        .send({ action: 'ACCEPT', expectedStatus: 'PAID', remark: '并发接单' }),
    ]);
    expect([refundResponse.status, acceptResponse.status].sort()).toEqual([200, 409]);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(['ACCEPTED', 'REFUND_PENDING']).toContain(saved.status);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(
      saved.status === 'REFUND_PENDING' ? 1 : 0,
    );
  });
});
