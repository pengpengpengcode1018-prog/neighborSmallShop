import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { adminAuthService } from '../services/admin-auth.service.js';
import { success, type AppState } from '../types/api.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const loginAdmin: Middleware<AppState> = async (ctx) => {
  const parsed = loginSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '用户名或密码格式不正确');
  }

  ctx.body = success(
    await adminAuthService.login(parsed.data.username, parsed.data.password, {
      ipAddress: ctx.ip,
      ...(ctx.get('user-agent') ? { userAgent: ctx.get('user-agent') } : {}),
    }),
  );
};

export const getCurrentAdmin: Middleware<AppState> = async (ctx) => {
  ctx.body = success(ctx.state.admin);
};
