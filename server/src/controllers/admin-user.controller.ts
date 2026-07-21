import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { adminUserService } from '../services/admin-user.service.js';
import { success, type AppState } from '../types/api.js';

const listSchema = z.object({
  keyword: z.string().trim().min(1).max(64).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  phoneBound: z.enum(['true', 'false']).optional(),
  communityId: z.string().trim().min(1).max(30).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const idSchema = z.string().trim().min(1).max(30);

export const listAdminUsers: Middleware<AppState> = async (ctx) => {
  const parsed = listSchema.safeParse(ctx.query);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '用户查询参数不正确');
  }
  const query = parsed.data;
  ctx.body = success(
    await adminUserService.list(
      {
        ...(query.keyword ? { keyword: query.keyword } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.phoneBound ? { phoneBound: query.phoneBound === 'true' } : {}),
        ...(query.communityId ? { communityId: query.communityId } : {}),
      },
      query.page,
      query.pageSize,
    ),
  );
};

export const getAdminUser: Middleware<AppState> = async (ctx) => {
  const parsed = idSchema.safeParse(ctx.params.id);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '用户 ID 不正确');
  }
  ctx.body = success(await adminUserService.detail(parsed.data));
};
