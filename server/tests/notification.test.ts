import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import {
  WechatSubscriptionProviderError,
  type WechatSubscriptionMessage,
  type WechatSubscriptionProvider,
} from '../src/providers/wechat-subscription.provider.js';
import { NotificationService } from '../src/services/notification.service.js';
import type { WechatSubscriptionTemplates } from '../src/types/notification.js';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const templates: WechatSubscriptionTemplates = {
  ORDER_PAID: {
    templateId: `paid-template-${runId}`,
    fields: { orderNo: 'character_string1', status: 'phrase2', amount: 'amount3' },
  },
  ORDER_ACCEPTED: {
    templateId: `accepted-template-${runId}`,
    fields: { orderNo: 'character_string1', storeName: 'thing2', status: 'phrase3' },
  },
};
let sendMode: 'success' | 'unknown' = 'success';
const sentMessages: WechatSubscriptionMessage[] = [];
const provider: WechatSubscriptionProvider = {
  async send(message) {
    sentMessages.push(message);
    if (sendMode === 'unknown') {
      throw new WechatSubscriptionProviderError('unavailable', 'UNKNOWN', false);
    }
  },
};

let userId = '';
let adminId = '';
let communityId = '';
let storeId = '';
let categoryId = '';
let productId = '';
let addressId = '';
let orderId = '';
let userToken = '';
let adminToken = '';

const app = () =>
  createApp({
    wechatSubscriptionProvider: provider,
    wechatSubscriptionTemplates: templates,
    notificationServiceOptions: {
      scope: {
        userId,
        orderIds: orderId ? [orderId] : [],
        refundIds: [],
        productIds: productId ? [productId] : [],
      },
    },
  }).callback();

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('resident subscriptions and admin alerts', () => {
  beforeAll(async () => {
    const community = await prisma.community.create({
      data: {
        name: `通知小区_${runId}`,
        city: '上海市',
        district: '通知区',
        detailedAddress: '通知路 1 号',
      },
    });
    communityId = community.id;
    const store = await prisma.store.create({
      data: {
        name: `通知店铺_${runId}`,
        phone: '13700000000',
        address: '通知路 2 号',
      },
    });
    storeId = store.id;
    await prisma.storeCommunity.create({ data: { storeId, communityId } });
    const category = await prisma.productCategory.create({
      data: { storeId, name: `通知分类_${runId}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: `低库存商品_${runId}`,
        price: '12.00',
        stock: 5,
        stockWarningThreshold: 10,
        status: 'ON_SALE',
      },
    });
    productId = product.id;
    const user = await prisma.user.create({
      data: {
        wechatOpenId: `notification-open-id-${runId}`,
        nickname: '通知测试居民',
        currentCommunityId: communityId,
      },
    });
    userId = user.id;
    const address = await prisma.address.create({
      data: {
        userId,
        communityId,
        recipientName: '不应进入提醒的姓名',
        phone: '13812345678',
        building: '敏感楼栋',
        room: '敏感房间',
      },
    });
    addressId = address.id;
    const paidAt = new Date(Date.now() - 11 * 60_000);
    const order = await prisma.order.create({
      data: {
        orderNo: `NT${runId.replaceAll('_', '').slice(-20)}`.slice(0, 32),
        userId,
        storeId,
        addressId,
        requestId: `notification-order-${runId}`,
        requestFingerprint: 'a'.repeat(64),
        previewVersion: 'b'.repeat(64),
        status: 'PAID',
        deliveryType: 'ASAP',
        storeName: store.name,
        merchandiseTotal: '12.00',
        deliveryFee: '3.00',
        payableTotal: '15.00',
        addressRecipientName: '不应进入提醒的姓名',
        addressPhone: '13812345678',
        addressCommunityName: community.name,
        addressBuilding: '敏感楼栋',
        addressRoom: '敏感房间',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        paidAt,
        statusLogs: {
          create: {
            fromStatus: 'PENDING_PAYMENT',
            toStatus: 'PAID',
            operatorType: 'WECHAT',
            description: '微信支付成功',
            createdAt: paidAt,
          },
        },
      },
    });
    orderId = order.id;
    const admin = await prisma.admin.create({
      data: {
        username: `notification_admin_${runId}`.slice(0, 64),
        displayName: '通知管理员',
        passwordHash: 'not-used-by-token-test',
      },
    });
    adminId = admin.id;
    userToken = jwt.sign({ kind: 'USER' }, env.JWT_SECRET, {
      subject: userId,
      expiresIn: 3600,
    });
    adminToken = jwt.sign(
      { kind: 'ADMIN', username: admin.username, role: 'PLATFORM_ADMIN' },
      env.JWT_SECRET,
      { subject: adminId, expiresIn: 3600 },
    );
  });

  afterAll(async () => {
    await prisma.adminAlert.deleteMany({
      where: {
        OR: [{ resourceId: orderId }, { resourceId: productId }, { readByAdminId: adminId }],
      },
    });
    await prisma.userNotification.deleteMany({ where: { userId } });
    await prisma.subscriptionConsentReceipt.deleteMany({ where: { userId } });
    await prisma.subscriptionConsent.deleteMany({ where: { userId } });
    await prisma.orderStatusLog.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.address.deleteMany({ where: { id: addressId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.storeCommunity.deleteMany({ where: { storeId, communityId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.admin.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('records one-time client results idempotently and rejects unknown templates', async () => {
    const settings = await request(app())
      .get('/api/v1/notifications/subscriptions')
      .set(authorization(userToken))
      .expect(200);
    expect(settings.body.data).toMatchObject({
      authorizationMode: 'ONE_TIME',
      maxTemplatesPerRequest: 5,
      groups: [{ key: 'ORDER_PROGRESS' }],
      consents: [],
    });

    const body = {
      requestId: `subscribe-${runId}`,
      results: [{ templateId: templates.ORDER_PAID!.templateId, decision: 'accept' }],
    };
    const first = await request(app())
      .post('/api/v1/notifications/subscriptions/report')
      .set(authorization(userToken))
      .send(body)
      .expect(200);
    expect(first.body.data).toMatchObject({
      idempotentReplay: false,
      consents: [{ reportedAvailableCount: 1, decision: 'ACCEPT' }],
    });

    const replay = await request(app())
      .post('/api/v1/notifications/subscriptions/report')
      .set(authorization(userToken))
      .send(body)
      .expect(200);
    expect(replay.body.data).toMatchObject({
      idempotentReplay: true,
      consents: [{ reportedAvailableCount: 1 }],
    });

    const conflict = await request(app())
      .post('/api/v1/notifications/subscriptions/report')
      .set(authorization(userToken))
      .send({ ...body, results: [{ ...body.results[0], decision: 'reject' }] })
      .expect(409);
    expect(conflict.body.code).toBe('SUBSCRIPTION_REPORT_CONFLICT');

    const unknown = await request(app())
      .post('/api/v1/notifications/subscriptions/report')
      .set(authorization(userToken))
      .send({
        requestId: `subscribe-unknown-${runId}`,
        results: [{ templateId: 'not-configured', decision: 'accept' }],
      })
      .expect(400);
    expect(unknown.body.code).toBe('SUBSCRIPTION_TEMPLATE_INVALID');
  });

  it('delivers each order event once and exposes de-identified admin alerts', async () => {
    const service = new NotificationService(provider, {
      templates,
      unacceptedMinutes: 10,
      retryDelayMs: 1_000,
      maxAttempts: 3,
      scope: { userId, orderIds: [orderId], refundIds: [], productIds: [productId] },
    });
    const first = await service.runBatch(50);
    expect(first.delivery).toMatchObject({ claimed: 1, sent: 1, unknown: 0 });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      templateId: templates.ORDER_PAID!.templateId,
      page: `pages/order/detail?id=${orderId}`,
    });
    const serializedData = JSON.stringify(sentMessages[0]?.data);
    expect(serializedData).not.toContain('13812345678');
    expect(serializedData).not.toContain('敏感楼栋');
    expect(serializedData).not.toContain('不应进入提醒的姓名');

    await service.runBatch(50);
    expect(sentMessages).toHaveLength(1);
    expect(await prisma.userNotification.count({ where: { orderId, status: 'SENT' } })).toBe(1);
    expect(
      await prisma.subscriptionConsent.findUniqueOrThrow({
        where: {
          userId_templateId: { userId, templateId: templates.ORDER_PAID!.templateId },
        },
      }),
    ).toMatchObject({ availableCount: 0 });

    const summary = await request(app())
      .get('/api/v1/admin/alerts/summary')
      .set(authorization(adminToken))
      .expect(200);
    expect(summary.body.data.byType).toEqual({
      NEW_PAID_ORDER: 1,
      UNACCEPTED_ORDER: 1,
      REFUND_REQUEST: 0,
      LOW_STOCK: 1,
    });
    expect(summary.body.data.unread).toBe(3);

    const alerts = await request(app())
      .get('/api/v1/admin/alerts?status=UNREAD')
      .set(authorization(adminToken))
      .expect(200);
    const serializedAlerts = JSON.stringify(alerts.body.data.list);
    expect(serializedAlerts).not.toContain('13812345678');
    expect(serializedAlerts).not.toContain('敏感楼栋');
    expect(serializedAlerts).not.toContain('不应进入提醒的姓名');

    const firstAlertId = alerts.body.data.list[0].id as string;
    await request(app())
      .post(`/api/v1/admin/alerts/${firstAlertId}/read`)
      .set(authorization(adminToken))
      .expect(200);
    expect(
      await prisma.adminAlert.findUniqueOrThrow({ where: { id: firstAlertId } }),
    ).toMatchObject({
      status: 'READ',
      readByAdminId: adminId,
    });
  });

  it('does not retry an external send with an unknown outcome', async () => {
    await request(app())
      .post('/api/v1/notifications/subscriptions/report')
      .set(authorization(userToken))
      .send({
        requestId: `subscribe-accepted-${runId}`,
        results: [{ templateId: templates.ORDER_ACCEPTED!.templateId, decision: 'accept' }],
      })
      .expect(200);
    const acceptedAt = new Date();
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'ACCEPTED', acceptedAt },
      }),
      prisma.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: 'PAID',
          toStatus: 'ACCEPTED',
          operatorType: 'ADMIN',
          operatorId: adminId,
          description: '店铺接单',
          createdAt: acceptedAt,
        },
      }),
    ]);
    sendMode = 'unknown';
    const service = new NotificationService(provider, {
      templates,
      maxAttempts: 3,
      scope: { userId, orderIds: [orderId], refundIds: [], productIds: [productId] },
    });
    const result = await service.runBatch(50);
    expect(result.delivery).toMatchObject({ claimed: 1, unknown: 1, retried: 0 });
    expect(sentMessages).toHaveLength(2);
    expect(
      await prisma.userNotification.findFirstOrThrow({
        where: { orderId, scene: 'ORDER_ACCEPTED' },
      }),
    ).toMatchObject({ status: 'UNKNOWN', lastErrorCode: 'wechat_unavailable' });

    await service.runBatch(50);
    expect(sentMessages).toHaveLength(2);
    expect(
      await prisma.adminAlert.findUniqueOrThrow({
        where: { dedupeKey: `unaccepted-order:${orderId}` },
      }),
    ).toMatchObject({ status: 'RESOLVED' });
  });
});
