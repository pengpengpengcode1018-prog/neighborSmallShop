import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { orderService, type OrderSelectionInput } from '../services/order.service.js';
import type { OrderClosingService } from '../services/order-closing.service.js';
import { success, type AppState } from '../types/api.js';

const idSchema = z.string().trim().min(1).max(30);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const remarkSchema = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((value) => value || null);
const selectionShape = {
  addressId: idSchema,
  deliveryType: z.enum(['ASAP', 'SCHEDULED']),
  deliveryDate: dateSchema.nullable().optional().default(null),
  deliverySlotId: idSchema.nullable().optional().default(null),
  remark: remarkSchema,
};

function validDeliverySelection(
  value: {
    deliveryType: 'ASAP' | 'SCHEDULED';
    deliveryDate: string | null;
    deliverySlotId: string | null;
  },
  ctx: z.RefinementCtx,
) {
  const scheduled = value.deliveryType === 'SCHEDULED';
  if (scheduled !== Boolean(value.deliveryDate && value.deliverySlotId)) {
    ctx.addIssue({ code: 'custom', message: '配送日期和时段与配送方式不匹配' });
  }
}

const previewSchema = z.object(selectionShape).strict().superRefine(validDeliverySelection);
const createSchema = z
  .object({
    ...selectionShape,
    requestId: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    expectedPreviewVersion: z.string().regex(/^[a-f0-9]{64}$/),
    expectedPayableAmount: z.string().regex(/^(0|[1-9]\d{0,7})\.\d{2}$/),
  })
  .strict()
  .superRefine(validDeliverySelection);
const orderStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'WAITING_DELIVERY',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
]);
const listSchema = z.object({
  status: orderStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});
const cancelSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .strict();

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

export const previewOrder: Middleware<AppState> = async (ctx) => {
  const body = parseOrThrow<OrderSelectionInput>(previewSchema, ctx.request.body);
  ctx.body = success(await orderService.preview(userOrThrow(ctx.state), body));
};

export const createOrder: Middleware<AppState> = async (ctx) => {
  const body = parseOrThrow(createSchema, ctx.request.body);
  ctx.body = success(await orderService.create(userOrThrow(ctx.state), body));
};

export const listOrders: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(listSchema, ctx.query);
  ctx.body = success(
    await orderService.listResident(
      userOrThrow(ctx.state),
      query.status,
      query.page,
      query.pageSize,
    ),
  );
};

export const getOrder: Middleware<AppState> = async (ctx) => {
  const orderId = parseOrThrow(idSchema, ctx.params.orderId);
  ctx.body = success(await orderService.detailResident(userOrThrow(ctx.state), orderId));
};

export function cancelOrder(closingService: OrderClosingService): Middleware<AppState> {
  return async (ctx) => {
    const orderId = parseOrThrow(idSchema, ctx.params.orderId);
    const body = parseOrThrow(cancelSchema, ctx.request.body ?? {});
    const user = userOrThrow(ctx.state);
    const closed = await closingService.closeResident(
      user.id,
      orderId,
      body.reason ?? '居民取消订单',
    );
    ctx.body = success({
      idempotentReplay: closed.idempotentReplay,
      order: await orderService.detailResident(user, orderId),
    });
  };
}
