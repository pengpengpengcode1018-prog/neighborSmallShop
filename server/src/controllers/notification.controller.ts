import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import type {
  AdminAlertStatus,
  AdminAlertType,
  SubscriptionDecision,
} from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { NotificationService } from '../services/notification.service.js';
import { success, type AppState } from '../types/api.js';

const templateIdSchema = z.string().trim().min(1).max(128);
const reportSchema = z
  .object({
    requestId: z.string().trim().min(8).max(64),
    results: z
      .array(
        z
          .object({
            templateId: templateIdSchema,
            decision: z
              .enum(['accept', 'reject', 'ban', 'filter'])
              .transform((value) => value.toUpperCase() as SubscriptionDecision),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine(
        (results) => new Set(results.map((result) => result.templateId)).size === results.length,
        'template IDs must be unique',
      ),
  })
  .strict();
const alertListSchema = z.object({
  type: z.enum(['NEW_PAID_ORDER', 'UNACCEPTED_ORDER', 'REFUND_REQUEST', 'LOW_STOCK']).optional(),
  status: z.enum(['UNREAD', 'READ', 'RESOLVED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const idSchema = z.string().trim().min(1).max(30);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

function resident(ctx: Parameters<Middleware<AppState>>[0]) {
  if (!ctx.state.user) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return ctx.state.user;
}

function adminActor(ctx: Parameters<Middleware<AppState>>[0]) {
  if (!ctx.state.admin) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return { id: ctx.state.admin.id, name: ctx.state.admin.displayName };
}

export function getSubscriptionSettings(service: NotificationService): Middleware<AppState> {
  return async (ctx) => {
    ctx.body = success(await service.subscriptionSettings(resident(ctx)));
  };
}

export function reportSubscriptionResults(service: NotificationService): Middleware<AppState> {
  return async (ctx) => {
    const body = parseOrThrow(reportSchema, ctx.request.body);
    ctx.body = success(await service.reportSubscriptionResults(resident(ctx), body));
  };
}

export function listAdminAlerts(service: NotificationService): Middleware<AppState> {
  return async (ctx) => {
    const query = parseOrThrow(alertListSchema, ctx.query);
    ctx.body = success(
      await service.listAdminAlerts(
        {
          ...(query.type ? { type: query.type as AdminAlertType } : {}),
          ...(query.status ? { status: query.status as AdminAlertStatus } : {}),
        },
        query.page,
        query.pageSize,
      ),
    );
  };
}

export function getAdminAlertSummary(service: NotificationService): Middleware<AppState> {
  return async (ctx) => {
    ctx.body = success(await service.adminAlertSummary());
  };
}

export function markAdminAlertRead(service: NotificationService): Middleware<AppState> {
  return async (ctx) => {
    const alertId = parseOrThrow(idSchema, ctx.params.alertId);
    ctx.body = success(await service.markAdminAlertRead(alertId, adminActor(ctx)));
  };
}
