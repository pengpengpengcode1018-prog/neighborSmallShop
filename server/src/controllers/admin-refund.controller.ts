import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { RefundStatus } from '../generated/prisma/client.js';
import type { RefundService } from '../services/refund.service.js';
import { success, type AppState } from '../types/api.js';

const idSchema = z.string().trim().min(1).max(30);
const statusSchema = z.enum([
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
]);
const listSchema = z.object({
  status: statusSchema.optional(),
  orderNo: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const approveSchema = z
  .object({
    reviewNote: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .strict();
const rejectSchema = z.object({ reviewNote: z.string().trim().min(2).max(255) }).strict();

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

function actor(ctx: Parameters<Middleware<AppState>>[0]) {
  if (!ctx.state.admin) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return {
    id: ctx.state.admin.id,
    name: ctx.state.admin.displayName,
    requestIp: ctx.ip,
    requestPath: ctx.path,
    ...(ctx.state.requestId ? { requestId: ctx.state.requestId } : {}),
  };
}

export function listAdminRefunds(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const query = parseOrThrow(listSchema, ctx.query);
    ctx.body = success(
      await service.adminList(
        {
          ...(query.status ? { status: query.status as RefundStatus } : {}),
          ...(query.orderNo ? { orderNo: query.orderNo } : {}),
        },
        query.page,
        query.pageSize,
      ),
    );
  };
}

export function getAdminRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const refundId = parseOrThrow(idSchema, ctx.params.refundId);
    ctx.body = success(await service.adminDetail(refundId));
  };
}

export function approveAdminRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const refundId = parseOrThrow(idSchema, ctx.params.refundId);
    const body = parseOrThrow(approveSchema, ctx.request.body ?? {});
    ctx.body = success(await service.approve(refundId, actor(ctx), body.reviewNote));
  };
}

export function rejectAdminRefund(service: RefundService): Middleware<AppState> {
  return async (ctx) => {
    const refundId = parseOrThrow(idSchema, ctx.params.refundId);
    const body = parseOrThrow(rejectSchema, ctx.request.body);
    ctx.body = success(await service.reject(refundId, actor(ctx), body.reviewNote));
  };
}
