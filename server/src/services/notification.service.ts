import { createHash } from 'node:crypto';

import { env } from '../config/env.js';
import { wechatConfig } from '../config/wechat.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import type {
  AdminAlertStatus,
  AdminAlertType,
  SubscriptionDecision,
  UserNotificationStatus,
} from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  WechatSubscriptionProviderError,
  type WechatSubscriptionProvider,
} from '../providers/wechat-subscription.provider.js';
import {
  notificationRepository,
  SubscriptionReceiptConflictError,
  type AlertActor,
  type AdminAlertRefreshScope,
  type NotificationClaimRecord,
} from '../repositories/notification.repository.js';
import type {
  NotificationField,
  NotificationSceneName,
  WechatSubscriptionTemplate,
  WechatSubscriptionTemplates,
} from '../types/notification.js';
import type { PublicUser } from '../types/api.js';

const sceneLabels: Record<NotificationSceneName, string> = {
  ORDER_PAID: '支付成功',
  ORDER_ACCEPTED: '店铺已接单',
  ORDER_DELIVERING: '商品开始配送',
  ORDER_COMPLETED: '商品已送达',
  ORDER_CANCELLED: '订单已取消',
  REFUND_SUCCESS: '退款成功',
};

const orderScenes = new Set<NotificationSceneName>([
  'ORDER_PAID',
  'ORDER_ACCEPTED',
  'ORDER_DELIVERING',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
]);

function httpError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

function configuredTemplateIds(templates: WechatSubscriptionTemplates): Set<string> {
  return new Set(Object.values(templates).map((template) => template.templateId));
}

function publicConsents(consents: Awaited<ReturnType<typeof notificationRepository.listConsents>>) {
  return consents.map((consent) => ({
    templateId: consent.templateId,
    decision: consent.decision,
    reportedAvailableCount: consent.availableCount,
    lastReportedAt: consent.lastReportedAt.toISOString(),
  }));
}

function templateGroups(templates: WechatSubscriptionTemplates) {
  const grouped = new Map<
    string,
    { templateId: string; scenes: NotificationSceneName[]; labels: string[] }
  >();
  for (const [scene, template] of Object.entries(templates) as [
    NotificationSceneName,
    WechatSubscriptionTemplate,
  ][]) {
    const current = grouped.get(template.templateId) ?? {
      templateId: template.templateId,
      scenes: [],
      labels: [],
    };
    current.scenes.push(scene);
    current.labels.push(sceneLabels[scene]);
    grouped.set(template.templateId, current);
  }
  const entries = [...grouped.values()].map((entry) => ({
    templateId: entry.templateId,
    scenes: entry.scenes,
    label: entry.labels.join('、'),
  }));
  return [
    {
      key: 'ORDER_PROGRESS',
      title: '订单进度通知',
      templates: entries.filter((entry) => entry.scenes.some((scene) => orderScenes.has(scene))),
    },
    {
      key: 'REFUND_RESULT',
      title: '退款结果通知',
      templates: entries.filter((entry) => entry.scenes.includes('REFUND_SUCCESS')),
    },
  ].filter((group) => group.templates.length > 0);
}

function shanghaiDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

function semanticValues(notification: NotificationClaimRecord): Record<NotificationField, string> {
  return {
    orderNo: notification.order.orderNo.slice(0, 32),
    storeName: notification.order.storeName.slice(0, 20),
    status: sceneLabels[notification.scene].slice(0, 20),
    occurredAt: shanghaiDateTime(notification.sourceStatusLog.createdAt),
    amount: `${notification.order.payableTotal.toFixed(2)}元`,
  };
}

function messageData(template: WechatSubscriptionTemplate, notification: NotificationClaimRecord) {
  const values = semanticValues(notification);
  return Object.fromEntries(
    Object.entries(template.fields).map(([field, keyword]) => [
      keyword,
      { value: values[field as NotificationField] },
    ]),
  );
}

function publicAlert(alert: {
  id: string;
  type: AdminAlertType;
  resourceType: string;
  resourceId: string;
  title: string;
  message: string;
  severity: string;
  status: AdminAlertStatus;
  occurredAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
}) {
  return {
    ...alert,
    occurredAt: alert.occurredAt.toISOString(),
    readAt: alert.readAt?.toISOString() ?? null,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
  };
}

export interface NotificationServiceOptions {
  templates?: WechatSubscriptionTemplates;
  retryDelayMs?: number;
  maxAttempts?: number;
  unacceptedMinutes?: number;
  scope?: AdminAlertRefreshScope & { userId?: string };
}

export class NotificationService {
  private readonly templates: WechatSubscriptionTemplates;
  private readonly retryDelayMs: number;
  private readonly maxAttempts: number;
  private readonly unacceptedMinutes: number;
  private readonly scope: NotificationServiceOptions['scope'];

  constructor(
    private readonly provider: WechatSubscriptionProvider,
    options: NotificationServiceOptions = {},
  ) {
    this.templates = options.templates ?? wechatConfig.subscriptionTemplates;
    this.retryDelayMs = options.retryDelayMs ?? env.NOTIFICATION_RETRY_DELAY_MS;
    this.maxAttempts = options.maxAttempts ?? env.NOTIFICATION_MAX_ATTEMPTS;
    this.unacceptedMinutes = options.unacceptedMinutes ?? env.ADMIN_ALERT_UNACCEPTED_MINUTES;
    this.scope = options.scope;
  }

  async subscriptionSettings(user: PublicUser) {
    const consents = await notificationRepository.listConsents(user.id);
    return {
      authorizationMode: 'ONE_TIME' as const,
      maxTemplatesPerRequest: 5,
      groups: templateGroups(this.templates),
      consents: publicConsents(consents),
    };
  }

  async reportSubscriptionResults(
    user: PublicUser,
    input: {
      requestId: string;
      results: { templateId: string; decision: SubscriptionDecision }[];
    },
  ) {
    const configuredIds = configuredTemplateIds(this.templates);
    if (input.results.some((result) => !configuredIds.has(result.templateId))) {
      throw httpError(400, ERROR_CODES.SUBSCRIPTION_TEMPLATE_INVALID, '订阅模板未配置或已停用');
    }
    const normalized = [...input.results].sort((left, right) =>
      left.templateId.localeCompare(right.templateId),
    );
    const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    try {
      const result = await notificationRepository.reportConsents({
        userId: user.id,
        requestId: input.requestId,
        requestFingerprint: fingerprint,
        results: input.results,
        now: new Date(),
      });
      return {
        idempotentReplay: result.idempotentReplay,
        consents: publicConsents(result.consents),
      };
    } catch (error) {
      if (error instanceof SubscriptionReceiptConflictError) {
        throw httpError(
          409,
          ERROR_CODES.SUBSCRIPTION_REPORT_CONFLICT,
          '重复授权结果请求的内容不一致',
        );
      }
      throw error;
    }
  }

  async runBatch(batchSize: number) {
    const now = new Date();
    const staleUnknown = await notificationRepository.markStaleSendingUnknown(
      new Date(now.getTime() - 5 * 60_000),
    );
    const discovered = await notificationRepository.discoverUserNotifications(
      this.templates,
      batchSize,
      this.scope?.userId,
    );
    const delivery = { claimed: 0, sent: 0, skipped: 0, failed: 0, unknown: 0, retried: 0 };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await notificationRepository.claimNext(
        new Date(),
        this.maxAttempts,
        this.scope?.userId,
      );
      if (!claim) break;
      if (claim.kind === 'skipped') {
        delivery.skipped += 1;
        continue;
      }
      delivery.claimed += 1;
      const notification = claim.notification;
      const template = this.templates[notification.scene];
      if (!template || template.templateId !== notification.templateId) {
        await notificationRepository.completeFailure({
          notificationId: notification.id,
          userId: notification.userId,
          templateId: notification.templateId!,
          status: 'FAILED',
          errorCode: 'template_config_changed',
          restoreGrant: true,
          clearGrant: false,
        });
        delivery.failed += 1;
        continue;
      }
      try {
        await this.provider.send({
          openId: notification.user.wechatOpenId,
          templateId: notification.templateId!,
          page: `pages/order/detail?id=${encodeURIComponent(notification.order.id)}`,
          data: messageData(template, notification),
        });
        await notificationRepository.markSent(notification.id, new Date());
        delivery.sent += 1;
      } catch (error) {
        if (!(error instanceof WechatSubscriptionProviderError)) throw error;
        const isUnknown = error.sendOutcome === 'UNKNOWN';
        const willRetry =
          !isUnknown && error.retryable && notification.attemptCount < this.maxAttempts;
        const status: UserNotificationStatus = isUnknown
          ? 'UNKNOWN'
          : willRetry
            ? 'PENDING'
            : error.reason === 'not_subscribed'
              ? 'SKIPPED'
              : 'FAILED';
        await notificationRepository.completeFailure({
          notificationId: notification.id,
          userId: notification.userId,
          templateId: notification.templateId!,
          status,
          errorCode: `wechat_${error.reason}`,
          restoreGrant: !isUnknown && error.reason !== 'not_subscribed',
          clearGrant: error.reason === 'not_subscribed',
          ...(willRetry ? { nextAttemptAt: new Date(Date.now() + this.retryDelayMs) } : {}),
        });
        if (isUnknown) delivery.unknown += 1;
        else if (willRetry) delivery.retried += 1;
        else if (status === 'SKIPPED') delivery.skipped += 1;
        else delivery.failed += 1;
      }
    }
    const alerts = await notificationRepository.refreshAdminAlerts(
      new Date(),
      this.unacceptedMinutes,
      batchSize,
      this.scope,
    );
    return { staleUnknown, discovered, delivery, alerts };
  }

  async refreshAdminAlerts(batchSize: number) {
    return notificationRepository.refreshAdminAlerts(
      new Date(),
      this.unacceptedMinutes,
      batchSize,
      this.scope,
    );
  }

  async listAdminAlerts(
    filters: { type?: AdminAlertType; status?: AdminAlertStatus },
    page: number,
    pageSize: number,
  ) {
    await this.refreshAdminAlerts(200);
    const result = await notificationRepository.listAdminAlerts(
      filters,
      page,
      pageSize,
      this.scope,
    );
    return {
      list: result.list.map(publicAlert),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async adminAlertSummary() {
    await this.refreshAdminAlerts(200);
    const summary = await notificationRepository.adminAlertSummary(this.scope);
    const byType: Record<AdminAlertType, number> = {
      NEW_PAID_ORDER: 0,
      UNACCEPTED_ORDER: 0,
      REFUND_REQUEST: 0,
      LOW_STOCK: 0,
    };
    for (const group of summary.groups) byType[group.type] = group._count._all;
    return {
      unread: Object.values(byType).reduce((total, count) => total + count, 0),
      byType,
      latestSoundEvent: summary.latestSoundEvent
        ? {
            ...summary.latestSoundEvent,
            occurredAt: summary.latestSoundEvent.occurredAt.toISOString(),
          }
        : null,
    };
  }

  async markAdminAlertRead(alertId: string, actor: AlertActor) {
    const alert = await notificationRepository.markAlertRead(alertId, actor, new Date());
    if (!alert) throw httpError(404, ERROR_CODES.ALERT_NOT_FOUND, '提醒不存在');
    return publicAlert(alert);
  }
}
