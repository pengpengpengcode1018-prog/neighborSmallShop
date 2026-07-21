import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from './error.middleware.js';
import { adminAuthService } from '../services/admin-auth.service.js';
import type { AppState } from '../types/api.js';

export const requireAdmin: Middleware<AppState> = async (ctx, next) => {
  const authorization = ctx.get('authorization');
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  }

  ctx.state.admin = await adminAuthService.authenticate(token);
  await next();
};
