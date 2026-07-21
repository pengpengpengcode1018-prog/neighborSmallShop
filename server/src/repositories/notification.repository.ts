import { prisma } from '../config/database.js';
import {
  Prisma,
  type AdminAlertStatus,
  type AdminAlertType,
  type NotificationScene,
  type SubscriptionDecision,
  type UserNotificationStatus,
} from '../generated/prisma/client.js';
import type { NotificationSceneName, WechatSubscriptionTemplates } from '../types/notification.js';

export class SubscriptionReceiptConflictError extends Error {}

const statusScene: Partial<Record<string, NotificationSceneName>> = {
  PAID: 'ORDER_PAID',
  ACCEPTED: 'ORDER_ACCEPTED',
  DELIVERING: 'ORDER_DELIVERING',
  COMPLETED: 'ORDER_COMPLETED',
  CANCELLED: 'ORDER_CANCELLED',
  REFUNDED: 'REFUND_SUCCESS',
};

const notificationClaimInclude = {
  user: { select: { status: true, wechatOpenId: true } },
  order: {
    select: {
      id: true,
      orderNo: true,
      storeName: true,
      status: true,
      payableTotal: true,
    },
  },
  sourceStatusLog: { select: { createdAt: true } },
} satisfies Prisma.UserNotificationInclude;

export type NotificationClaimRecord = Prisma.UserNotificationGetPayload<{
  include: typeof notificationClaimInclude;
}>;

export interface ClaimedNotification {
  kind: 'claimed';
  notification: NotificationClaimRecord;
}

export interface SkippedNotification {
  kind: 'skipped';
  notificationId: string;
}

export type NotificationClaim = ClaimedNotification | SkippedNotification | null;

export interface AlertActor {
  id: string;
  name: string;
}

export interface AdminAlertRefreshScope {
  orderIds?: readonly string[];
  refundIds?: readonly string[];
  productIds?: readonly string[];
}

interface NewOrderAlertCandidate {
  sourceId: string;
  orderId: string;
  orderNo: string;
  storeName: string;
  occurredAt: Date;
}

interface TimeoutAlertCandidate {
  orderId: string;
  orderNo: string;
  storeName: string;
  occurredAt: Date;
}

interface RefundAlertCandidate {
  refundId: string;
  orderNo: string;
  storeName: string;
  occurredAt: Date;
}

function alertMessage(storeName: string, identifier: string): string {
  return `${storeName} · ${identifier}`;
}

function alertScopeWhere(scope?: AdminAlertRefreshScope): Prisma.AdminAlertWhereInput {
  if (!scope) return {};
  const resources: Prisma.AdminAlertWhereInput[] = [];
  if (scope.orderIds?.length) {
    resources.push({ resourceType: 'order', resourceId: { in: [...scope.orderIds] } });
  }
  if (scope.refundIds?.length) {
    resources.push({ resourceType: 'refund', resourceId: { in: [...scope.refundIds] } });
  }
  if (scope.productIds?.length) {
    resources.push({ resourceType: 'product', resourceId: { in: [...scope.productIds] } });
  }
  return resources.length > 0 ? { OR: resources } : { id: { in: [] } };
}

export const notificationRepository = {
  async reportConsents(input: {
    userId: string;
    requestId: string;
    requestFingerprint: string;
    results: { templateId: string; decision: SubscriptionDecision }[];
    now: Date;
  }) {
    return prisma.$transaction(async (transaction) => {
      const receipt = await transaction.subscriptionConsentReceipt.findUnique({
        where: {
          userId_requestId: { userId: input.userId, requestId: input.requestId },
        },
      });
      if (receipt) {
        if (receipt.requestFingerprint !== input.requestFingerprint) {
          throw new SubscriptionReceiptConflictError();
        }
        return {
          idempotentReplay: true,
          consents: await transaction.subscriptionConsent.findMany({
            where: { userId: input.userId },
            orderBy: { updatedAt: 'desc' },
          }),
        };
      }

      await transaction.subscriptionConsentReceipt.create({
        data: {
          userId: input.userId,
          requestId: input.requestId,
          requestFingerprint: input.requestFingerprint,
          createdAt: input.now,
        },
      });
      for (const result of input.results) {
        const update =
          result.decision === 'ACCEPT'
            ? {
                decision: result.decision,
                availableCount: { increment: 1 },
                lastReportedAt: input.now,
              }
            : result.decision === 'BAN'
              ? {
                  decision: result.decision,
                  availableCount: 0,
                  lastReportedAt: input.now,
                }
              : { decision: result.decision, lastReportedAt: input.now };
        await transaction.subscriptionConsent.upsert({
          where: {
            userId_templateId: { userId: input.userId, templateId: result.templateId },
          },
          create: {
            userId: input.userId,
            templateId: result.templateId,
            decision: result.decision,
            availableCount: result.decision === 'ACCEPT' ? 1 : 0,
            lastReportedAt: input.now,
          },
          update,
        });
      }
      return {
        idempotentReplay: false,
        consents: await transaction.subscriptionConsent.findMany({
          where: { userId: input.userId },
          orderBy: { updatedAt: 'desc' },
        }),
      };
    });
  },

  listConsents(userId: string) {
    return prisma.subscriptionConsent.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async discoverUserNotifications(
    templates: WechatSubscriptionTemplates,
    batchSize: number,
    userId?: string,
  ): Promise<number> {
    const logs = await prisma.orderStatusLog.findMany({
      where: {
        toStatus: { in: ['PAID', 'ACCEPTED', 'DELIVERING', 'COMPLETED', 'CANCELLED', 'REFUNDED'] },
        notification: null,
        ...(userId ? { order: { userId } } : {}),
      },
      select: { id: true, orderId: true, toStatus: true, order: { select: { userId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    if (logs.length === 0) return 0;
    const created = await prisma.userNotification.createMany({
      data: logs.flatMap((log) => {
        const scene = statusScene[log.toStatus];
        if (!scene) return [];
        const templateId = templates[scene]?.templateId ?? null;
        return [
          {
            userId: log.order.userId,
            orderId: log.orderId,
            sourceStatusLogId: log.id,
            scene: scene as NotificationScene,
            templateId,
            status: templateId ? ('PENDING' as const) : ('SKIPPED' as const),
            ...(templateId ? {} : { lastErrorCode: 'template_not_configured' }),
          },
        ];
      }),
      skipDuplicates: true,
    });
    return created.count;
  },

  async markStaleSendingUnknown(cutoff: Date): Promise<number> {
    const result = await prisma.userNotification.updateMany({
      where: { status: 'SENDING', sendStartedAt: { lte: cutoff } },
      data: { status: 'UNKNOWN', lastErrorCode: 'worker_interrupted' },
    });
    return result.count;
  },

  async claimNext(now: Date, maxAttempts: number, userId?: string): Promise<NotificationClaim> {
    return prisma.$transaction(async (transaction) => {
      const candidate = await transaction.userNotification.findFirst({
        where: {
          status: 'PENDING',
          attemptCount: { lt: maxAttempts },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          ...(userId ? { userId } : {}),
        },
        include: notificationClaimInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!candidate) return null;
      const claimed = await transaction.userNotification.updateMany({
        where: { id: candidate.id, status: 'PENDING', attemptCount: { lt: maxAttempts } },
        data: {
          status: 'SENDING',
          attemptCount: { increment: 1 },
          sendStartedAt: now,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
      });
      if (claimed.count === 0) return null;

      if (candidate.user.status !== 'ACTIVE' || !candidate.templateId) {
        await transaction.userNotification.update({
          where: { id: candidate.id },
          data: {
            status: 'SKIPPED',
            lastErrorCode:
              candidate.user.status !== 'ACTIVE' ? 'user_disabled' : 'template_not_configured',
          },
        });
        return { kind: 'skipped', notificationId: candidate.id };
      }

      const reserved = await transaction.subscriptionConsent.updateMany({
        where: {
          userId: candidate.userId,
          templateId: candidate.templateId,
          decision: { not: 'BAN' },
          availableCount: { gt: 0 },
        },
        data: { availableCount: { decrement: 1 } },
      });
      if (reserved.count === 0) {
        await transaction.userNotification.update({
          where: { id: candidate.id },
          data: { status: 'SKIPPED', lastErrorCode: 'not_subscribed_reported' },
        });
        return { kind: 'skipped', notificationId: candidate.id };
      }
      return { kind: 'claimed', notification: candidate };
    });
  },

  markSent(notificationId: string, sentAt: Date) {
    return prisma.userNotification.update({
      where: { id: notificationId },
      data: { status: 'SENT', sentAt, lastErrorCode: null },
    });
  },

  async completeFailure(input: {
    notificationId: string;
    userId: string;
    templateId: string;
    status: UserNotificationStatus;
    errorCode: string;
    restoreGrant: boolean;
    clearGrant: boolean;
    nextAttemptAt?: Date;
  }) {
    return prisma.$transaction(async (transaction) => {
      await transaction.userNotification.update({
        where: { id: input.notificationId },
        data: {
          status: input.status,
          lastErrorCode: input.errorCode,
          nextAttemptAt: input.nextAttemptAt ?? null,
        },
      });
      if (input.clearGrant) {
        await transaction.subscriptionConsent.updateMany({
          where: { userId: input.userId, templateId: input.templateId },
          data: { availableCount: 0 },
        });
      } else if (input.restoreGrant) {
        await transaction.subscriptionConsent.updateMany({
          where: { userId: input.userId, templateId: input.templateId },
          data: { availableCount: { increment: 1 } },
        });
      }
    });
  },

  async refreshAdminAlerts(
    now: Date,
    unacceptedMinutes: number,
    batchSize: number,
    scope?: AdminAlertRefreshScope,
  ) {
    const cutoff = new Date(now.getTime() - unacceptedMinutes * 60_000);
    const orderCandidateScope = scope?.orderIds
      ? scope.orderIds.length > 0
        ? Prisma.sql`AND o.id IN (${Prisma.join(scope.orderIds)})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.sql``;
    const orderAlertScope = scope?.orderIds
      ? scope.orderIds.length > 0
        ? Prisma.sql`AND a.resource_id IN (${Prisma.join(scope.orderIds)})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.sql``;
    const refundCandidateScope = scope?.refundIds
      ? scope.refundIds.length > 0
        ? Prisma.sql`AND r.id IN (${Prisma.join(scope.refundIds)})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.sql``;
    const refundAlertScope = scope?.refundIds
      ? scope.refundIds.length > 0
        ? Prisma.sql`AND a.resource_id IN (${Prisma.join(scope.refundIds)})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.sql``;
    const productAlertScope = scope?.productIds
      ? scope.productIds.length > 0
        ? Prisma.sql`AND a.resource_id IN (${Prisma.join(scope.productIds)})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.sql``;
    const [newOrders, timeoutOrders, pendingRefunds, lowStockProducts] = await Promise.all([
      prisma.$queryRaw<NewOrderAlertCandidate[]>(Prisma.sql`
        SELECT l.id AS sourceId, o.id AS orderId, o.order_no AS orderNo,
               o.store_name AS storeName, l.created_at AS occurredAt
        FROM order_status_logs l
        INNER JOIN orders o ON o.id = l.order_id
        LEFT JOIN admin_alerts a ON a.dedupe_key = CONCAT('new-order:', l.id)
        WHERE l.to_status = 'paid' AND a.id IS NULL ${orderCandidateScope}
        ORDER BY l.created_at ASC, l.id ASC
        LIMIT ${batchSize}
      `),
      prisma.$queryRaw<TimeoutAlertCandidate[]>(Prisma.sql`
        SELECT o.id AS orderId, o.order_no AS orderNo, o.store_name AS storeName,
               o.paid_at AS occurredAt
        FROM orders o
        LEFT JOIN admin_alerts a ON a.dedupe_key = CONCAT('unaccepted-order:', o.id)
        WHERE o.status = 'paid' AND o.paid_at <= ${cutoff} AND a.id IS NULL
          ${orderCandidateScope}
        ORDER BY o.paid_at ASC, o.id ASC
        LIMIT ${batchSize}
      `),
      prisma.$queryRaw<RefundAlertCandidate[]>(Prisma.sql`
        SELECT r.id AS refundId, o.order_no AS orderNo, o.store_name AS storeName,
               r.created_at AS occurredAt
        FROM refunds r
        INNER JOIN orders o ON o.id = r.order_id
        LEFT JOIN admin_alerts a ON a.dedupe_key = CONCAT('refund-request:', r.id)
        WHERE r.status = 'pending_review' AND a.id IS NULL ${refundCandidateScope}
        ORDER BY r.created_at ASC, r.id ASC
        LIMIT ${batchSize}
      `),
      prisma.product.findMany({
        where: {
          deletedAt: null,
          status: { in: ['ON_SALE', 'SOLD_OUT'] },
          stock: { lte: prisma.product.fields.stockWarningThreshold },
          ...(scope?.productIds ? { id: { in: [...scope.productIds] } } : {}),
        },
        select: { id: true, name: true, stock: true, store: { select: { name: true } } },
      }),
    ]);

    const [reopenedTimeout, reopenedStock] = await prisma.$transaction([
      prisma.$executeRaw(Prisma.sql`
        UPDATE admin_alerts a
        INNER JOIN orders o ON a.resource_type = 'order' AND a.resource_id = o.id
        SET a.status = 'unread', a.occurred_at = ${now}, a.read_at = NULL,
            a.read_by_admin_id = NULL, a.resolved_at = NULL, a.updated_at = ${now}
        WHERE a.type = 'unaccepted_order' AND a.status = 'resolved'
          AND o.status = 'paid' AND o.paid_at <= ${cutoff}
          ${orderAlertScope}
      `),
      prisma.$executeRaw(Prisma.sql`
        UPDATE admin_alerts a
        INNER JOIN products p ON a.resource_type = 'product' AND a.resource_id = p.id
        SET a.status = 'unread', a.occurred_at = ${now}, a.read_at = NULL,
            a.read_by_admin_id = NULL, a.resolved_at = NULL, a.updated_at = ${now}
        WHERE a.type = 'low_stock' AND a.status = 'resolved'
          AND p.deleted_at IS NULL AND p.status IN ('on_sale', 'sold_out')
          AND p.stock <= p.stock_warning_threshold
          ${productAlertScope}
      `),
    ]);

    const alerts: Prisma.AdminAlertCreateManyInput[] = [
      ...newOrders.map((item) => ({
        type: 'NEW_PAID_ORDER' as const,
        resourceType: 'order',
        resourceId: item.orderId,
        dedupeKey: `new-order:${item.sourceId}`,
        title: '有新订单待处理',
        message: alertMessage(item.storeName, item.orderNo),
        severity: 'URGENT' as const,
        occurredAt: item.occurredAt,
      })),
      ...timeoutOrders.map((item) => ({
        type: 'UNACCEPTED_ORDER' as const,
        resourceType: 'order',
        resourceId: item.orderId,
        dedupeKey: `unaccepted-order:${item.orderId}`,
        title: `订单超过 ${unacceptedMinutes} 分钟未接单`,
        message: alertMessage(item.storeName, item.orderNo),
        severity: 'URGENT' as const,
        occurredAt: item.occurredAt,
      })),
      ...pendingRefunds.map((item) => ({
        type: 'REFUND_REQUEST' as const,
        resourceType: 'refund',
        resourceId: item.refundId,
        dedupeKey: `refund-request:${item.refundId}`,
        title: '有退款申请待审核',
        message: alertMessage(item.storeName, item.orderNo),
        severity: 'WARNING' as const,
        occurredAt: item.occurredAt,
      })),
      ...lowStockProducts.map((item) => ({
        type: 'LOW_STOCK' as const,
        resourceType: 'product',
        resourceId: item.id,
        dedupeKey: `low-stock:${item.id}`,
        title: '商品库存不足',
        message: `${item.store.name} · ${item.name} · 剩余 ${item.stock}`,
        severity: 'WARNING' as const,
        occurredAt: now,
      })),
    ];
    const created = alerts.length
      ? await prisma.adminAlert.createMany({ data: alerts, skipDuplicates: true })
      : { count: 0 };

    const [resolvedTimeout, resolvedRefunds, resolvedStock] = await prisma.$transaction([
      prisma.$executeRaw(Prisma.sql`
        UPDATE admin_alerts a
        LEFT JOIN orders o ON a.resource_type = 'order' AND a.resource_id = o.id
        SET a.status = 'resolved', a.resolved_at = ${now}, a.updated_at = ${now}
        WHERE a.type = 'unaccepted_order' AND a.status <> 'resolved'
          AND (o.id IS NULL OR o.status <> 'paid')
          ${orderAlertScope}
      `),
      prisma.$executeRaw(Prisma.sql`
        UPDATE admin_alerts a
        LEFT JOIN refunds r ON a.resource_type = 'refund' AND a.resource_id = r.id
        SET a.status = 'resolved', a.resolved_at = ${now}, a.updated_at = ${now}
        WHERE a.type = 'refund_request' AND a.status <> 'resolved'
          AND (r.id IS NULL OR r.status <> 'pending_review')
          ${refundAlertScope}
      `),
      prisma.$executeRaw(Prisma.sql`
        UPDATE admin_alerts a
        LEFT JOIN products p ON a.resource_type = 'product' AND a.resource_id = p.id
        SET a.status = 'resolved', a.resolved_at = ${now}, a.updated_at = ${now}
        WHERE a.type = 'low_stock' AND a.status <> 'resolved'
          AND (p.id IS NULL OR p.deleted_at IS NOT NULL OR p.status = 'off_shelf'
               OR p.stock > p.stock_warning_threshold)
          ${productAlertScope}
      `),
    ]);
    return {
      created: created.count,
      reopened: reopenedTimeout + reopenedStock,
      resolved: resolvedTimeout + resolvedRefunds + resolvedStock,
    };
  },

  async listAdminAlerts(
    filters: { type?: AdminAlertType; status?: AdminAlertStatus },
    page: number,
    pageSize: number,
    scope?: AdminAlertRefreshScope,
  ) {
    const where: Prisma.AdminAlertWhereInput = {
      ...alertScopeWhere(scope),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.adminAlert.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminAlert.count({ where }),
    ]);
    return { list, total };
  },

  async adminAlertSummary(scope?: AdminAlertRefreshScope) {
    const scoped = alertScopeWhere(scope);
    const [groups, latestSoundEvent] = await prisma.$transaction([
      prisma.adminAlert.groupBy({
        by: ['type'],
        where: { ...scoped, status: 'UNREAD' },
        _count: { _all: true },
      }),
      prisma.adminAlert.findFirst({
        where: {
          ...scoped,
          status: 'UNREAD',
          type: { in: ['NEW_PAID_ORDER', 'UNACCEPTED_ORDER'] },
        },
        select: { id: true, type: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { groups, latestSoundEvent };
  },

  async markAlertRead(alertId: string, actor: AlertActor, now: Date) {
    const alert = await prisma.adminAlert.findUnique({ where: { id: alertId } });
    if (!alert) return null;
    if (alert.status !== 'UNREAD') return alert;
    return prisma.adminAlert.update({
      where: { id: alertId },
      data: { status: 'READ', readAt: now, readByAdminId: actor.id },
    });
  },
};
