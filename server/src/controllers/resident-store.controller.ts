import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { residentStoreService } from '../services/resident-store.service.js';
import { success, type AppState } from '../types/api.js';

const communityQuerySchema = z.object({
  communityId: z.string().trim().min(1).max(30).optional(),
});
const listQuerySchema = communityQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().max(120).optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

export const listResidentStores: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(listQuerySchema, ctx.query);
  ctx.body = success(
    await residentStoreService.list(query.page, query.pageSize, query.keyword, query.communityId),
  );
};

export const getResidentStore: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(communityQuerySchema, ctx.query);
  ctx.body = success(await residentStoreService.detail(ctx.params.id, query.communityId));
};
