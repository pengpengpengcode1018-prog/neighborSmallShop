import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { communitySelectionService } from '../services/community-selection.service.js';
import { success, type AppState } from '../types/api.js';

const selectionSchema = z.object({
  communityId: z.string().trim().min(1).max(30),
});

export const listAvailableCommunities: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await communitySelectionService.listAvailable());
};

export const selectCurrentCommunity: Middleware<AppState> = async (ctx) => {
  if (!ctx.state.user) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  const parsed = selectionSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '配送小区标识格式不正确');
  }
  ctx.body = success(
    await communitySelectionService.select(ctx.state.user.id, parsed.data.communityId),
  );
};
