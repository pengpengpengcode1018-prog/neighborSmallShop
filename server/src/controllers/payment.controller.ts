import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { PaymentService } from '../services/payment.service.js';
import { success, type AppState } from '../types/api.js';

const idSchema = z.string().trim().min(1).max(30);
const initializeSchema = z.object({ orderId: idSchema }).strict();
const MAX_NOTIFICATION_BODY_BYTES = 128 * 1024;

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

function userOrThrow(state: AppState) {
  if (!state.user) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return state.user;
}

export function initializeWechatPayment(service: PaymentService): Middleware<AppState> {
  return async (ctx) => {
    const body = parseOrThrow(initializeSchema, ctx.request.body);
    ctx.body = success(await service.initialize(userOrThrow(ctx.state), body.orderId));
  };
}

export function getWechatPaymentStatus(service: PaymentService): Middleware<AppState> {
  return async (ctx) => {
    const orderId = parseOrThrow(idSchema, ctx.params.orderId);
    ctx.body = success(await service.status(userOrThrow(ctx.state), orderId));
  };
}

export function notifyWechatPayment(service: PaymentService): Middleware<AppState> {
  return async (ctx) => {
    const rawBody = ctx.request.rawBody;
    if (
      typeof rawBody !== 'string' ||
      Buffer.byteLength(rawBody) === 0 ||
      Buffer.byteLength(rawBody) > MAX_NOTIFICATION_BODY_BYTES
    ) {
      throw new HttpError(400, ERROR_CODES.PAYMENT_NOTIFICATION_INVALID, '支付通知内容不正确');
    }
    ctx.body = success(
      await service.notify({
        serial: ctx.get('wechatpay-serial'),
        signature: ctx.get('wechatpay-signature'),
        timestamp: ctx.get('wechatpay-timestamp'),
        nonce: ctx.get('wechatpay-nonce'),
        rawBody,
      }),
    );
  };
}
