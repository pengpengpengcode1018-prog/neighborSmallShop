import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { residentProductService } from '../services/resident-product.service.js';
import { success, type AppState } from '../types/api.js';

const contextQuerySchema = z.object({
  communityId: z.string().trim().min(1).max(30).optional(),
});
const listQuerySchema = contextQuerySchema.extend({
  categoryId: z.string().trim().min(1).max(30).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

export const listResidentProducts: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(listQuerySchema, ctx.query);
  ctx.body = success(
    await residentProductService.list(
      ctx.params.id,
      query.page,
      query.pageSize,
      query.communityId,
      query.categoryId,
    ),
  );
};

export const getResidentProduct: Middleware<AppState> = async (ctx) => {
  const query = parseOrThrow(contextQuerySchema, ctx.query);
  ctx.body = success(await residentProductService.detail(ctx.params.id, query.communityId));
};
