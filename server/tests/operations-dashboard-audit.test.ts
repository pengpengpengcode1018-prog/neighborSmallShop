import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { auditRepository } from '../src/repositories/audit.repository.js';
import { operationsService } from '../src/services/operations.service.js';

const suffix = `${Date.now()}`;
const fixedNow = new Date('2037-06-15T04:00:00.000Z');
const adminId = `op_admin_${suffix}`.slice(0, 30);
const userId = `op_user_${suffix}`.slice(0, 30);
const communityId = `op_comm_${suffix}`.slice(0, 30);
const storeId = `op_store_${suffix}`.slice(0, 30);
const addressId = `op_addr_${suffix}`.slice(0, 30);
const orderIds = [`op_o1_${suffix}`, `op_o2_${suffix}`, `op_o3_${suffix}`].map((id) =>
  id.slice(0, 30),
);
const requestIds = [`op-audit-${suffix}-1`, `op-audit-${suffix}-2`];
let token = '';

function auth() {
  return { authorization: `Bearer ${token}` };
}

function orderData(id: string, orderNo: string, requestId: string) {
  return {
    id,
    orderNo,
    userId,
    storeId,
    addressId,
    requestId,
    requestFingerprint: 'f'.repeat(64),
    previewVersion: 'v'.repeat(64),
    deliveryType: 'ASAP' as const,
    storeName: '看板测试店铺',
    merchandiseTotal: '10.00',
    deliveryFee: '2.34',
    payableTotal: '12.34',
    addressRecipientName: '测试居民',
    addressPhone: '13800138000',
    addressCommunityName: '看板测试小区',
    addressBuilding: '1栋',
    addressRoom: '101',
    expiresAt: new Date('2037-06-15T05:00:00.000Z'),
    createdAt: fixedNow,
  };
}

describe('operations dashboard and audit log', () => {
  beforeAll(async () => {
    await prisma.admin.create({
      data: {
        id: adminId,
        username: `operations_${suffix}`,
        displayName: '经营测试管理员',
        passwordHash: 'not-used-by-token-test',
      },
    });
    token = jwt.sign(
      { kind: 'ADMIN', username: `operations_${suffix}`, role: 'PLATFORM_ADMIN' },
      env.JWT_SECRET,
      { subject: adminId, expiresIn: 300 },
    );
    await prisma.community.create({
      data: {
        id: communityId,
        name: '看板测试小区',
        city: '测试市',
        district: '测试区',
        detailedAddress: '不会进入审计的详细地址',
      },
    });
    await prisma.store.create({
      data: {
        id: storeId,
        name: '看板测试店铺',
        phone: '13800138000',
        address: '不会进入审计的店铺地址',
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        wechatOpenId: `openid_operations_${suffix}`,
        createdAt: fixedNow,
      },
    });
    await prisma.address.create({
      data: {
        id: addressId,
        userId,
        communityId,
        recipientName: '测试居民',
        phone: '13800138000',
        building: '1栋',
        room: '101',
      },
    });

    await prisma.order.create({
      data: {
        ...orderData(orderIds[0], `OPS1${suffix}`.slice(0, 32), `ops-order-${suffix}-1`),
        status: 'PAID',
        paidAt: fixedNow,
      },
    });
    await prisma.payment.create({
      data: {
        orderId: orderIds[0],
        outTradeNo: `OPSP1${suffix}`.slice(0, 32),
        status: 'SUCCESS',
        amount: '12.34',
        succeededAt: fixedNow,
      },
    });

    await prisma.order.create({
      data: {
        ...orderData(orderIds[1], `OPS2${suffix}`.slice(0, 32), `ops-order-${suffix}-2`),
        status: 'REFUNDED',
        paidAt: fixedNow,
        refundedAt: fixedNow,
        stockReleased: true,
        payableTotal: '20.00',
        merchandiseTotal: '20.00',
        deliveryFee: '0.00',
      },
    });
    const refundedPayment = await prisma.payment.create({
      data: {
        orderId: orderIds[1],
        outTradeNo: `OPSP2${suffix}`.slice(0, 32),
        status: 'SUCCESS',
        amount: '20.00',
        succeededAt: fixedNow,
      },
    });
    await prisma.refund.create({
      data: {
        refundNo: `OPSR${suffix}`.slice(0, 64),
        orderId: orderIds[1],
        paymentId: refundedPayment.id,
        userId,
        requestId: `ops-refund-${suffix}`,
        requestFingerprint: 'r'.repeat(64),
        status: 'SUCCESS',
        amount: '20.00',
        reason: 'OTHER',
        completedAt: fixedNow,
      },
    });

    await prisma.order.create({
      data: {
        ...orderData(orderIds[2], `OPS3${suffix}`.slice(0, 32), `ops-order-${suffix}-3`),
        status: 'PENDING_PAYMENT',
      },
    });

    for (const [index, requestId] of requestIds.entries()) {
      await auditRepository.create(prisma, {
        actor: {
          adminId,
          operatorName: '经营测试管理员',
          requestIp: '127.0.0.1',
          requestPath: '/api/v1/admin/communities/example',
          requestId,
        },
        module: 'community',
        action: index === 0 ? 'update' : 'status',
        businessDataId: communityId,
        description: `编辑测试记录 13800138000`,
        beforeData: { name: '原名称', detailedAddress: '绝密地址', status: 'ENABLED' },
        afterData: {
          name: '新名称',
          phone: '13800138000',
          token: 'secret-token',
          status: index === 0 ? 'ENABLED' : 'DISABLED',
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.operationLog.deleteMany({ where: { adminId } });
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.address.deleteMany({ where: { id: addressId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.admin.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('uses successful payment and refund events with an explicit Shanghai-day definition', async () => {
    const dashboard = await operationsService.dashboard(7, fixedNow);
    expect(dashboard.businessDate).toBe('2037-06-15');
    expect(dashboard.overview).toMatchObject({
      todayOrders: 3,
      todayEffectivePaidOrders: 1,
      todaySuccessfulPayments: 2,
      todayGrossAmount: '32.34',
      todaySuccessfulRefunds: 1,
      todayRefundAmount: '20.00',
      todayNetAmount: '12.34',
    });
    expect(dashboard.overview.pendingAcceptanceOrders).toBeGreaterThanOrEqual(1);
    expect(dashboard.definitions.transactionAmount).toContain('成功支付金额');
    expect(dashboard.trend.at(-1)).toMatchObject({
      date: '2037-06-15',
      successfulPayments: 2,
      netAmount: '12.34',
    });
    expect(dashboard.stores[0]).toMatchObject({
      storeId,
      effectivePaidOrders: 1,
      grossAmount: '32.34',
      refundAmount: '20.00',
      netAmount: '12.34',
    });
  });

  it('requires an administrator for the dashboard and audit APIs', async () => {
    await request(createApp().callback()).get('/api/v1/admin/operations/dashboard').expect(401);
    const dashboard = await request(createApp().callback())
      .get('/api/v1/admin/operations/dashboard')
      .query({ trendDays: 7 })
      .set(auth())
      .expect(200);
    expect(dashboard.body).toMatchObject({ code: 0, data: { timeZone: 'Asia/Shanghai' } });
  });

  it('filters and paginates immutable audit entries without exposing sensitive fields', async () => {
    const list = await request(createApp().callback())
      .get('/api/v1/admin/operation-logs')
      .query({ module: 'community', businessDataId: communityId, page: 1, pageSize: 1 })
      .set(auth())
      .expect(200);
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(list.body.data.list[0]).not.toHaveProperty('beforeData');

    const detail = await request(createApp().callback())
      .get(`/api/v1/admin/operation-logs/${list.body.data.list[0].id}`)
      .set(auth())
      .expect(200);
    const serialized = JSON.stringify(detail.body.data);
    expect(serialized).not.toContain('13800138000');
    expect(serialized).not.toContain('绝密地址');
    expect(serialized).not.toContain('secret-token');
    expect(detail.body.data.description).toContain('[手机号已隐藏]');
    expect(detail.body.data.requestId).toMatch(/^op-audit-/);

    await request(createApp().callback())
      .delete(`/api/v1/admin/operation-logs/${list.body.data.list[0].id}`)
      .set(auth())
      .expect(405);
  });
});
