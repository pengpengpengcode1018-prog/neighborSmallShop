import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { UserAuthService } from '../services/user-auth.service.js';
import type { UserPhoneService } from '../services/user-phone.service.js';
import { success, type AppState } from '../types/api.js';

const loginSchema = z.object({
  code: z.string().trim().min(1).max(256),
});

export function loginWechat(service: UserAuthService): Middleware<AppState> {
  return async (ctx) => {
    const parsed = loginSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '微信登录凭证格式不正确');
    }

    ctx.body = success(
      await service.login(parsed.data.code, {
        ipAddress: ctx.ip,
        ...(ctx.get('user-agent') ? { userAgent: ctx.get('user-agent') } : {}),
      }),
    );
  };
}

export const getCurrentUser: Middleware<AppState> = async (ctx) => {
  ctx.body = success(ctx.state.user);
};

const userProfileSchema = z
  .object({
    nickname: z.string().trim().min(1).max(64).optional(),
    avatarBase64: z.string().trim().min(1).max(900_000).optional(),
  })
  .refine((value) => value.nickname !== undefined || value.avatarBase64 !== undefined);

export function updateCurrentUser(service: UserAuthService): Middleware<AppState> {
  return async (ctx) => {
    const parsed = userProfileSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请提供有效的昵称或头像');
    }
    if (!ctx.state.user) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
    }
    ctx.body = success(
      await service.updateProfile(ctx.state.user.id, {
        ...(parsed.data.nickname !== undefined ? { nickname: parsed.data.nickname } : {}),
        ...(parsed.data.avatarBase64 !== undefined
          ? { avatarBase64: parsed.data.avatarBase64 }
          : {}),
      }),
    );
  };
}

export function getUserAvatar(service: UserAuthService): Middleware<AppState> {
  return async (ctx) => {
    const avatar = await service.getAvatar(ctx.params.id);
    ctx.type = avatar.mimeType;
    ctx.set('Cache-Control', 'public, max-age=3600');
    ctx.body = avatar.data;
  };
}

const phoneBindingSchema = z.object({
  code: z.string().trim().min(1).max(256),
});

export function bindWechatPhone(service: UserPhoneService): Middleware<AppState> {
  return async (ctx) => {
    const parsed = phoneBindingSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '手机号授权凭证格式不正确');
    }
    if (!ctx.state.user) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
    }
    ctx.body = success(await service.bind(ctx.state.user.id, parsed.data.code));
  };
}
