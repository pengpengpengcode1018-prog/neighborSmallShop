import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WechatIdentityProvider } from '../src/providers/wechat-identity.provider.js';
import {
  WechatPaymentProviderError,
  type CreateWechatTransactionInput,
  type WechatPaymentNotification,
  type WechatPaymentProvider,
} from '../src/providers/wechat-payment.provider.js';
import { OrderClosingService } from '../src/services/order-closing.service.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const identities = new Map([
  [`payment-code-a-${runId}`, `payment-open-a-${runId}`],
  [`payment-code-b-${runId}`, `payment-open-b-${runId}`],
]);
const merchant = { appId: 'wx-payment-fixture', merchantId: '1900000001' };
const userIds: string[] = [];
let tokenA = '';
let tokenB = '';
let userAId = '';
let userBId = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
let addressAId = '';
let sequence = 0;
let createInputs: CreateWechatTransactionInput[] = [];
let queryTradeState = 'NOTPAY';
let querySuccess: WechatPaymentNotification | null = null;
let queryFailure: WechatPaymentProviderError | null = null;
let closeFailure: WechatPaymentProviderError | null = null;
let closeInputs: string[] = [];
let closeTransactionGate: Promise<void> | null = null;
let reportCloseStarted: (() => void) | null = null;
let createTransactionGate: Promise<void> | null = null;
let reportCreateStarted: (() => void) | null = null;

const identityProvider: WechatIdentityProvider = {
  async exchangeCode(code) {
    const openId = identities.get(code);
    if (!openId) throw new Error('unexpected test code');
    return { openId };
  },
};

function clientParameters(prepayId: string) {
  return {
    timeStamp: '1784268000',
    nonceStr: 'fixture-payment-nonce',
    package: `prepay_id=${prepayId}`,
    signType: 'RSA' as const,
    paySign: 'fixture-payment-signature',
  };
}

const paymentProvider: WechatPaymentProvider = {
  merchant,
  async createTransaction(input) {
    createInputs.push(input);
    reportCreateStarted?.();
    if (createTransactionGate) await createTransactionGate;
    const prepayId = `prepay-${input.orderNo}`;
    return { prepayId, clientParameters: clientParameters(prepayId) };
  },
  buildClientParameters: clientParameters,
  async verifyNotification(input) {
    if (input.signature !== 'fixture-valid') {
      throw new WechatPaymentProviderError('invalid_notification');
    }
    return JSON.parse(input.rawBody) as WechatPaymentNotification;
  },
  async queryTransaction(orderNo) {
    if (queryFailure) throw queryFailure;
    return {
      appId: merchant.appId,
      merchantId: merchant.merchantId,
      outTradeNo: orderNo,
      tradeState: querySuccess ? 'SUCCESS' : queryTradeState,
      success: querySuccess,
    };
  },
  async closeTransaction(orderNo) {
    closeInputs.push(orderNo);
    reportCloseStarted?.();
    if (closeTransactionGate) await closeTransactionGate;
    if (closeFailure) throw closeFailure;
  },
};

const app = () =>
  createApp({
    wechatIdentityProvider: identityProvider,
    wechatPaymentProvider: paymentProvider,
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
  const payments = await prisma.payment.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const paymentIds = payments.map((payment) => payment.id);
  await prisma.paymentNotification.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function createPendingOrder(quantity = 2, expiresAt = new Date(Date.now() + 15 * 60 * 1000)) {
  sequence += 1;
  const orderNo = `NP${runId.replaceAll('_', '').slice(-16)}${String(sequence).padStart(4, '0')}`;
  return prisma.order.create({
    data: {
      orderNo,
      userId: userAId,
      storeId,
      addressId: addressAId,
      requestId: `payment-${runId}-${sequence}`,
      requestFingerprint: String(sequence).padStart(64, '0'),
      previewVersion: String(sequence + 100).padStart(64, '0'),
      status: 'PENDING_PAYMENT',
      deliveryType: 'ASAP',
      storeName: `支付店铺_${runId}`,
      storePhone: '13700000000',
      merchandiseTotal: (12 * quantity).toFixed(2),
      deliveryFee: '3.00',
      payableTotal: (12 * quantity + 3).toFixed(2),
      addressRecipientName: '支付居民',
      addressPhone: '13812345678',
      addressCommunityName: `支付小区_${runId}`,
      addressBuilding: '1号楼',
      addressRoom: '301室',
      expiresAt,
      items: {
        create: {
          productId,
          productName: `支付商品_${runId}`,
          unitPrice: '12.00',
          quantity,
          lineTotal: (12 * quantity).toFixed(2),
        },
      },
      statusLogs: {
        create: {
          fromStatus: null,
          toStatus: 'PENDING_PAYMENT',
          operatorType: 'USER',
          operatorId: userAId,
          description: '居民提交订单',
        },
      },
    },
  });
}

function notification(
  orderNo: string,
  notificationId = `notify-${runId}`,
  overrides: Partial<WechatPaymentNotification> = {},
): WechatPaymentNotification {
  return {
    notificationId,
    eventType: 'TRANSACTION.SUCCESS',
    payloadDigest: 'a'.repeat(64),
    appId: merchant.appId,
    merchantId: merchant.merchantId,
    outTradeNo: orderNo,
    transactionId: `4200${runId.replaceAll('_', '').slice(-20)}`.slice(0, 32),
    tradeState: 'SUCCESS',
    successTime: new Date().toISOString(),
    amountTotal: 2700,
    currency: 'CNY',
    ...overrides,
  };
}

function sendNotification(value: WechatPaymentNotification, signature = 'fixture-valid') {
  return request(app())
    .post('/api/v1/payments/wechat/notify')
    .set({
      'wechatpay-serial': 'fixture-serial',
      'wechatpay-signature': signature,
      'wechatpay-timestamp': Math.floor(Date.now() / 1000).toString(),
      'wechatpay-nonce': 'fixture-callback-nonce',
    })
    .send(value);
}

describe('WeChat payment initialization and idempotent settlement', () => {
  beforeAll(async () => {
    const community = await prisma.community.create({
      data: {
        name: `支付小区_${runId}`,
        city: '上海市',
        district: '支付区',
        detailedAddress: '支付路 1 号',
      },
    });
    communityId = community.id;
    const store = await prisma.store.create({
      data: {
        name: `支付店铺_${runId}`,
        phone: '13700000000',
        address: '支付路 2 号',
      },
    });
    storeId = store.id;
    await prisma.storeCommunity.create({ data: { storeId, communityId } });
    const category = await prisma.productCategory.create({
      data: { storeId, name: `支付分类_${runId}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: `支付商品_${runId}`,
        price: '12.00',
        stock: 8,
        status: 'ON_SALE',
      },
    });
    productId = product.id;

    const userA = await login(`payment-code-a-${runId}`);
    const userB = await login(`payment-code-b-${runId}`);
    tokenA = userA.token;
    tokenB = userB.token;
    userAId = userA.userId;
    userBId = userB.userId;
    userIds.push(userAId, userBId);
    const address = await prisma.address.create({
      data: {
        userId: userAId,
        communityId,
        recipientName: '支付居民',
        phone: '13812345678',
        building: '1号楼',
        room: '301室',
        isDefault: true,
        defaultKey: userAId,
      },
    });
    addressAId = address.id;
  });

  beforeEach(async () => {
    await cleanupOrders();
    createInputs = [];
    createTransactionGate = null;
    reportCreateStarted = null;
    queryTradeState = 'NOTPAY';
    querySuccess = null;
    queryFailure = null;
    closeFailure = null;
    closeInputs = [];
    closeTransactionGate = null;
    reportCloseStarted = null;
    await prisma.product.update({
      where: { id: productId },
      data: { stock: 8, salesVolume: 0 },
    });
  });

  afterAll(async () => {
    await cleanupOrders();
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

  it('uses only the owned server order amount and OpenID, then reuses one payment record', async () => {
    const order = await createPendingOrder();
    await request(app()).post('/api/v1/payments/wechat').send({ orderId: order.id }).expect(401);
    const hidden = await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenB))
      .send({ orderId: order.id })
      .expect(404);
    expect(hidden.body.code).toBe('ORDER_NOT_FOUND');

    const initialized = await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id, amount: '0.01', openId: 'forged' })
      .expect(400);
    expect(initialized.body.code).toBe('VALIDATION_ERROR');

    const first = await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const replay = await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    expect(first.body.data).toMatchObject({
      orderId: order.id,
      amount: '27.00',
      idempotentReplay: false,
      parameters: { package: `prepay_id=prepay-${order.orderNo}`, signType: 'RSA' },
    });
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(createInputs).toHaveLength(1);
    expect(createInputs[0]).toMatchObject({
      orderNo: order.orderNo,
      amountTotal: 2700,
      openId: `payment-open-a-${runId}`,
    });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('serializes duplicate initialization while the provider request is in progress', async () => {
    const order = await createPendingOrder();
    let releaseCreate!: () => void;
    createTransactionGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const createStarted = new Promise<void>((resolve) => {
      reportCreateStarted = resolve;
    });
    const firstRequest = request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200)
      .then((response) => response);

    await createStarted;
    const concurrent = await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(409);
    expect(concurrent.body.code).toBe('PAYMENT_PROCESSING');
    releaseCreate();
    await firstRequest;
    expect(createInputs).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects invalid signatures before touching payment, order or sales state', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const response = await sendNotification(notification(order.orderNo), 'invalid').expect(400);
    expect(response.body.code).toBe('PAYMENT_NOTIFICATION_INVALID');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).salesVolume).toBe(
      0,
    );
    expect(await prisma.paymentNotification.count()).toBe(0);
  });

  it.each([
    ['amount', { amountTotal: 2701 }],
    ['merchant', { merchantId: 'wrong-merchant' }],
    ['appid', { appId: 'wrong-appid' }],
  ])('rejects a validly delivered notification with mismatched %s', async (_name, patch) => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const response = await sendNotification(
      notification(order.orderNo, `notify-mismatch-${_name}-${runId}`, patch),
    ).expect(400);
    expect(response.body.code).toBe('PAYMENT_NOTIFICATION_INVALID');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
  });

  it('settles duplicate notifications once and increments product sales only once', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const event = notification(order.orderNo);
    const first = await sendNotification(event).expect(200);
    const replay = await sendNotification(event).expect(200);
    const secondNotification = await sendNotification({
      ...event,
      notificationId: `notify-second-${runId}`,
      payloadDigest: 'b'.repeat(64),
    }).expect(200);
    expect(first.body.data.idempotentReplay).toBe(false);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(secondNotification.body.data.idempotentReplay).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).salesVolume).toBe(
      2,
    );
    expect(
      await prisma.orderStatusLog.count({
        where: { orderId: order.id, fromStatus: 'PENDING_PAYMENT', toStatus: 'PAID' },
      }),
    ).toBe(1);
    expect(await prisma.paymentNotification.count()).toBe(2);
  });

  it('recovers a missed callback through a trusted order query', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const success = notification(order.orderNo, `query-source-${runId}`);
    querySuccess = success;
    const response = await request(app())
      .get(`/api/v1/payments/orders/${order.id}/status`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.data).toMatchObject({
      orderId: order.id,
      orderStatus: 'PAID',
      paymentStatus: 'PAID',
      transactionId: success.transactionId,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).salesVolume).toBe(
      2,
    );
  });

  it('queries and closes an active WeChat payment before resident cancellation', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    const cancelled = await request(app())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '居民不需要了' })
      .expect(200);
    expect(cancelled.body.data).toMatchObject({
      idempotentReplay: false,
      order: { status: 'CANCELLED', cancellationReason: '居民不需要了' },
    });
    const replay = await request(app())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '居民不需要了' })
      .expect(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(closeInputs).toEqual([order.orderNo]);
    const savedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(savedOrder).toMatchObject({ status: 'CANCELLED', stockReleased: true });
    expect(payment).toMatchObject({
      status: 'CLOSED',
      tradeState: 'CLOSED',
      closeAttemptCount: 1,
    });
    expect(payment.closedAt).not.toBeNull();
    expect(product).toMatchObject({ stock: 10, salesVolume: 0 });
    expect(await prisma.orderStatusLog.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('settles a successful query instead of cancelling or restoring stock', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    querySuccess = notification(order.orderNo, `query-before-close-${runId}`);

    const cancelled = await request(app())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '支付成功时不能取消' })
      .expect(409);
    expect(cancelled.body.code).toBe('ORDER_ALREADY_PAID');
    expect(closeInputs).toEqual([]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'PAID',
      stockReleased: false,
    });
    expect(await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      status: 'SUCCESS',
      tradeState: 'SUCCESS',
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 8,
      salesVolume: 2,
    });
  });

  it('retains stock when a successful query amount does not match the order', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    querySuccess = notification(order.orderNo, `query-amount-mismatch-${runId}`, {
      amountTotal: 2701,
    });

    const response = await request(app())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '支付金额异常时不能取消' })
      .expect(503);
    expect(response.body.code).toBe('PAYMENT_CLOSE_UNCONFIRMED');
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'PENDING_PAYMENT',
      stockReleased: false,
    });
    expect(await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      status: 'CLOSING',
      failureReason: 'close_query_payment_mismatch',
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 8,
      salesVolume: 0,
    });
  });

  it('keeps stock reserved after an unknown close result and recovers through a stale lease', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    closeFailure = new WechatPaymentProviderError('unavailable');

    const uncertain = await request(app())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(tokenA))
      .send({ reason: '网络未知关单' })
      .expect(503);
    expect(uncertain.body.code).toBe('PAYMENT_CLOSE_UNCONFIRMED');
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'PENDING_PAYMENT',
      stockReleased: false,
    });
    expect(await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      status: 'CLOSING',
      failureReason: 'close_result_unconfirmed',
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(8);

    closeFailure = null;
    await prisma.payment.update({
      where: { orderId: order.id },
      data: { lastCloseAttemptAt: new Date(Date.now() - 1_000) },
    });
    const recoveryService = new OrderClosingService(paymentProvider, { leaseMs: 1 });
    await expect(
      recoveryService.closeResident(userAId, order.id, '网络未知关单'),
    ).resolves.toMatchObject({ outcome: 'CANCELLED' });
    expect(closeInputs).toEqual([order.orderNo, order.orderNo]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(10);
  });

  it('closes expired orders with and without payment exactly once across repeated batches', async () => {
    const withoutPayment = await createPendingOrder(1, new Date(Date.now() - 60_000));
    const withPayment = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: withPayment.id })
      .expect(200);
    await prisma.order.update({
      where: { id: withPayment.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const closingService = new OrderClosingService(paymentProvider, { leaseMs: 1 });

    await expect(closingService.closeExpiredBatch(10)).resolves.toEqual({
      scanned: 2,
      closed: 2,
      paid: 0,
      deferred: 0,
    });
    await expect(closingService.closeExpiredBatch(10)).resolves.toEqual({
      scanned: 0,
      closed: 0,
      paid: 0,
      deferred: 0,
    });
    expect(closeInputs).toEqual([withPayment.orderNo]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(11);
    expect(
      await prisma.orderStatusLog.count({
        where: { orderId: { in: [withoutPayment.id, withPayment.id] }, toStatus: 'CANCELLED' },
      }),
    ).toBe(2);
  });

  it('allows only one worker to own a fresh external close lease', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    let releaseClose!: () => void;
    closeTransactionGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const closeStarted = new Promise<void>((resolve) => {
      reportCloseStarted = resolve;
    });
    const closingService = new OrderClosingService(paymentProvider, { leaseMs: 30_000 });
    const firstBatch = closingService.closeExpiredBatch(10);
    await closeStarted;

    await expect(closingService.closeExpiredBatch(10)).resolves.toEqual({
      scanned: 1,
      closed: 0,
      paid: 0,
      deferred: 1,
    });
    releaseClose();
    await expect(firstBatch).resolves.toMatchObject({ closed: 1, deferred: 0 });
    expect(closeInputs).toEqual([order.orderNo]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(10);
  });

  it('lets a trusted payment win against an expired-order close race', async () => {
    const order = await createPendingOrder();
    await request(app())
      .post('/api/v1/payments/wechat')
      .set(auth(tokenA))
      .send({ orderId: order.id })
      .expect(200);
    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    let releaseClose!: () => void;
    closeTransactionGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const closeStarted = new Promise<void>((resolve) => {
      reportCloseStarted = resolve;
    });
    const event = notification(order.orderNo, `notify-close-race-${runId}`);
    const closingService = new OrderClosingService(paymentProvider, { leaseMs: 30_000 });
    const batch = closingService.closeExpiredBatch(10);
    await closeStarted;
    await sendNotification(event).expect(200);
    querySuccess = event;
    closeFailure = new WechatPaymentProviderError('rejected');
    releaseClose();

    await expect(batch).resolves.toMatchObject({ paid: 1, closed: 0, deferred: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'PAID',
      stockReleased: false,
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      stock: 8,
      salesVolume: 2,
    });
  });
});
