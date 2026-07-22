import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { storeService } from '../services/store.service.js';
import { success, type AppState } from '../types/api.js';

const statusSchema = z.enum(['OPEN', 'PAUSED', 'DISABLED']);
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().max(120).optional(),
  status: statusSchema.optional(),
});
const moneySchema = z.string().regex(/^\d{1,8}\.\d{2}$/);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  logoUrl: z.string().trim().min(1).max(1024).nullable().optional(),
  coverUrl: z.string().trim().min(1).max(1024).nullable().optional(),
  phone: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  announcement: z.string().trim().max(5000).optional(),
  businessStartTime: timeSchema.default('08:00'),
  businessEndTime: timeSchema.default('22:00'),
  minimumOrderAmount: moneySchema,
  defaultDeliveryFee: moneySchema,
  estimatedDeliveryMinutes: z.number().int().positive().max(1440),
  status: statusSchema.default('OPEN'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  communityIds: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  return result.data;
}

function actor(ctx: Parameters<Middleware<AppState>>[0]) {
  if (!ctx.state.admin) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return {
    adminId: ctx.state.admin.id,
    operatorName: ctx.state.admin.displayName,
    requestIp: ctx.ip,
    requestPath: ctx.path,
    ...(ctx.state.requestId ? { requestId: ctx.state.requestId } : {}),
  };
}

export const listStores: Middleware<AppState> = async (ctx) => {
  const query = parse(listSchema, ctx.query);
  ctx.body = success(
    await storeService.list(query.page, query.pageSize, query.keyword, query.status),
  );
};
export const createStore: Middleware<AppState> = async (ctx) => {
  ctx.status = 201;
  ctx.body = success(await storeService.create(parse(writeSchema, ctx.request.body), actor(ctx)));
};
export const updateStore: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await storeService.update(ctx.params.id, parse(writeSchema, ctx.request.body), actor(ctx)),
  );
};
export const updateStoreStatus: Middleware<AppState> = async (ctx) => {
  const body = parse(z.object({ status: statusSchema }), ctx.request.body);
  ctx.body = success(await storeService.updateStatus(ctx.params.id, body.status, actor(ctx)));
};
export const deleteStore: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await storeService.remove(ctx.params.id, actor(ctx)));
};
