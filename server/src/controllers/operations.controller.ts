import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { operationsService } from '../services/operations.service.js';
import { success, type AppState } from '../types/api.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dashboardSchema = z.object({
  trendDays: z.coerce.number().refine((value): value is 7 | 30 => value === 7 || value === 30, {
    message: 'trendDays must be 7 or 30',
  }),
});
const logListSchema = z
  .object({
    module: z.string().trim().min(1).max(64).optional(),
    action: z.string().trim().min(1).max(64).optional(),
    operatorName: z.string().trim().min(1).max(64).optional(),
    businessDataId: z.string().trim().min(1).max(64).optional(),
    requestId: z.string().trim().min(1).max(64).optional(),
    createdFrom: dateSchema.optional(),
    createdTo: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .superRefine((value, context) => {
    if (!value.createdFrom || !value.createdTo) return;
    const from = new Date(`${value.createdFrom}T00:00:00+08:00`);
    const to = new Date(`${value.createdTo}T00:00:00+08:00`);
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days < 0 || days > 90) {
      context.addIssue({ code: 'custom', message: '日志日期范围必须在 90 天内' });
    }
  });
const idSchema = z.string().trim().min(1).max(30);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

function nextShanghaiDay(date: string): Date {
  const result = new Date(`${date}T00:00:00+08:00`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export const getOperationsDashboard: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(dashboardSchema, {
    trendDays: ctx.query.trendDays ?? 7,
  });
  ctx.body = success(await operationsService.dashboard(query.trendDays));
};

export const listOperationLogs: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(logListSchema, ctx.query);
  ctx.body = success(
    await operationsService.listOperationLogs(
      {
        ...(query.module ? { module: query.module } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.operatorName ? { operatorName: query.operatorName } : {}),
        ...(query.businessDataId ? { businessDataId: query.businessDataId } : {}),
        ...(query.requestId ? { requestId: query.requestId } : {}),
        ...(query.createdFrom
          ? { createdFrom: new Date(`${query.createdFrom}T00:00:00+08:00`) }
          : {}),
        ...(query.createdTo ? { createdTo: nextShanghaiDay(query.createdTo) } : {}),
      },
      query.page,
      query.pageSize,
    ),
  );
};

export const getOperationLog: Middleware<AppState> = async (ctx) => {
  const id = parseOrThrow(idSchema, ctx.params.id);
  ctx.body = success(await operationsService.operationLogDetail(id));
};
