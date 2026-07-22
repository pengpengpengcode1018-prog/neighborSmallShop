import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { mediaService } from '../services/media.service.js';
import { success, type AppState } from '../types/api.js';

const imageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(128),
  mimeType: z.string().trim().min(1).max(64),
  base64: z.string().trim().min(1).max(900_000),
});

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

export const uploadImage: Middleware<AppState> = async (ctx) => {
  const parsed = imageUploadSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请提供有效的图片文件');
  }
  ctx.status = 201;
  ctx.body = success(await mediaService.uploadImage(parsed.data, actor(ctx)));
};

export const getImage: Middleware<AppState> = async (ctx) => {
  const image = await mediaService.getImage(ctx.params.id);
  ctx.type = image.mimeType;
  ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
  ctx.set('Content-Disposition', 'inline');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.body = image.data;
};
