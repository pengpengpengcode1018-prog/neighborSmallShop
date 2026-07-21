import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { deliveryService } from '../services/delivery.service.js';
import { success, type AppState } from '../types/api.js';

const statusSchema = z.enum(['ENABLED', 'DISABLED']);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const modesSchema = z.object({
  asapEnabled: z.boolean(),
  scheduledEnabled: z.boolean(),
});
const slotSchema = z.object({
  deliveryTime: timeSchema,
  cutoffTime: timeSchema,
  maxOrders: z.number().int().positive().max(65_535),
  status: statusSchema.default('ENABLED'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
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

export const getDeliveryConfig: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await deliveryService.getConfig(ctx.params.storeId));
};

export const updateDeliveryModes: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await deliveryService.updateModes(
      ctx.params.storeId,
      parse(modesSchema, ctx.request.body),
      actor(ctx),
    ),
  );
};

export const createDeliverySlot: Middleware<AppState> = async (ctx) => {
  ctx.status = 201;
  ctx.body = success(
    await deliveryService.createSlot(
      ctx.params.storeId,
      parse(slotSchema, ctx.request.body),
      actor(ctx),
    ),
  );
};

export const updateDeliverySlot: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await deliveryService.updateSlot(
      ctx.params.storeId,
      ctx.params.slotId,
      parse(slotSchema, ctx.request.body),
      actor(ctx),
    ),
  );
};

export const updateDeliverySlotStatus: Middleware<AppState> = async (ctx) => {
  const body = parse(z.object({ status: statusSchema }), ctx.request.body);
  ctx.body = success(
    await deliveryService.updateSlotStatus(
      ctx.params.storeId,
      ctx.params.slotId,
      body.status,
      actor(ctx),
    ),
  );
};
