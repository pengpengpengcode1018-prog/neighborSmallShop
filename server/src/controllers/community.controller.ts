import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { communityService } from '../services/community.service.js';
import { success, type AppState } from '../types/api.js';

const statusSchema = z.enum(['ENABLED', 'DISABLED']);
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().max(120).optional(),
  status: statusSchema.optional(),
});
const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(64),
  district: z.string().trim().min(1).max(64),
  detailedAddress: z.string().trim().min(1).max(255),
  status: statusSchema.default('ENABLED'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
const statusBodySchema = z.object({ status: statusSchema });

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

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  return parsed.data;
}

export const listCommunities: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(listSchema, ctx.query);
  ctx.body = success(
    await communityService.list(query.page, query.pageSize, query.keyword, query.status),
  );
};

export const createCommunity: Middleware<AppState> = async (ctx) => {
  ctx.status = 201;
  ctx.body = success(
    await communityService.create(parseOrThrow(writeSchema, ctx.request.body), actor(ctx)),
  );
};

export const updateCommunity: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await communityService.update(
      ctx.params.id,
      parseOrThrow(writeSchema, ctx.request.body),
      actor(ctx),
    ),
  );
};

export const updateCommunityStatus: Middleware<AppState> = async (ctx) => {
  const body = parseOrThrow(statusBodySchema, ctx.request.body);
  ctx.body = success(await communityService.updateStatus(ctx.params.id, body.status, actor(ctx)));
};

export const deleteCommunity: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await communityService.remove(ctx.params.id, actor(ctx)));
};
