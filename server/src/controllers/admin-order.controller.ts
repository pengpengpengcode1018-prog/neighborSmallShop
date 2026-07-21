import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { orderService, type AdminOrderActor } from '../services/order.service.js';
import type { OrderClosingService } from '../services/order-closing.service.js';
import { success, type AppState } from '../types/api.js';

const idSchema = z.string().trim().min(1).max(30);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toISOString().slice(0, 10) === value;
  });
const statusSchema = z.enum([
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
  orderNo: z.string().trim().max(32).optional(),
  phone: z.string().trim().max(32).optional(),
  storeId: idSchema.optional(),
  communityName: z.string().trim().max(120).optional(),
  status: statusSchema.optional(),
  deliveryType: z.enum(['ASAP', 'SCHEDULED']).optional(),
  createdFrom: dateSchema.optional(),
  createdTo: dateSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const transitionSchema = z
  .object({
    action: z.enum([
      'CLOSE',
      'ACCEPT',
      'START_PREPARING',
      'MARK_READY',
      'START_DELIVERY',
      'COMPLETE',
    ]),
    expectedStatus: statusSchema,
    remark: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .strict();
const remarkSchema = z
  .object({
    remark: z
      .string()
      .trim()
      .max(500)
      .nullable()
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

function nextShanghaiDay(date: string): Date {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function actor(ctx: Parameters<Middleware<AppState>>[0]): AdminOrderActor {
  if (!ctx.state.admin) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return {
    id: ctx.state.admin.id,
    displayName: ctx.state.admin.displayName,
    requestIp: ctx.ip,
    requestPath: ctx.path,
    ...(ctx.state.requestId ? { requestId: ctx.state.requestId } : {}),
  };
}

export const listAdminOrders: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(listSchema, ctx.query);
  ctx.body = success(
    await orderService.listAdmin(
      {
        ...(query.orderNo ? { orderNo: query.orderNo } : {}),
        ...(query.phone ? { phone: query.phone } : {}),
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.communityName ? { communityName: query.communityName } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.deliveryType ? { deliveryType: query.deliveryType } : {}),
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

export const getAdminOrder: Middleware<AppState> = async (ctx) => {
  const orderId = parseOrThrow(idSchema, ctx.params.orderId);
  ctx.body = success(await orderService.detailAdmin(orderId));
};

export function transitionAdminOrder(closingService: OrderClosingService): Middleware<AppState> {
  return async (ctx) => {
    const orderId = parseOrThrow(idSchema, ctx.params.orderId);
    const body = parseOrThrow(transitionSchema, ctx.request.body);
    const admin = actor(ctx);
    if (body.action === 'CLOSE') {
      if (body.expectedStatus !== 'PENDING_PAYMENT')
        throw new HttpError(409, ERROR_CODES.INVALID_ORDER_STATUS, '订单状态不允许执行该操作');
      const closed = await closingService.closeAdmin(
        orderId,
        body.remark ?? '管理员关闭待付款订单',
        {
          id: admin.id,
          name: admin.displayName,
          ...(admin.requestIp ? { requestIp: admin.requestIp } : {}),
          ...(admin.requestPath ? { requestPath: admin.requestPath } : {}),
          ...(admin.requestId ? { requestId: admin.requestId } : {}),
        },
      );
      ctx.body = success({
        idempotentReplay: closed.idempotentReplay,
        order: await orderService.detailAdmin(orderId),
      });
      return;
    }
    ctx.body = success(
      await orderService.transitionAdmin(
        orderId,
        body.action,
        body.expectedStatus,
        body.remark,
        admin,
      ),
    );
  };
}

export const updateAdminOrderRemark: Middleware<AppState> = async (ctx) => {
  const orderId = parseOrThrow(idSchema, ctx.params.orderId);
  const body = parseOrThrow(remarkSchema, ctx.request.body);
  ctx.body = success(await orderService.updateAdminRemark(orderId, body.remark, actor(ctx)));
};
