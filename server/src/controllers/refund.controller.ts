import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  refundReasons,
  type RefundApplicationInput,
  type RefundService,
} from '../services/refund.service.js';
import { success, type AppState } from '../types/api.js';

const idSchema = z.string().trim().min(1).max(30);
const applicationSchema = z
  .object({
    requestId: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    reason: z.enum(refundReasons),
    note: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason === 'OTHER' && !value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: '选择其他原因时请填写说明' });
    }
  });
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

export function applyRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const orderId = parseOrThrow(idSchema, ctx.params.orderId);
    const input = parseOrThrow<RefundApplicationInput>(applicationSchema, ctx.request.body);
    ctx.body = success(await service.apply(userOrThrow(ctx.state), orderId, input));
  };
}

export function getRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const refundId = parseOrThrow(idSchema, ctx.params.refundId);
    ctx.body = success(await service.residentDetail(userOrThrow(ctx.state), refundId));
  };
}

export function notifyWechatRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const rawBody = ctx.request.rawBody;
    if (
      typeof rawBody !== 'string' ||
      Buffer.byteLength(rawBody) === 0 ||
      Buffer.byteLength(rawBody) > MAX_NOTIFICATION_BODY_BYTES
    ) {
      throw new HttpError(400, ERROR_CODES.REFUND_NOTIFICATION_INVALID, '退款通知内容不正确');
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
