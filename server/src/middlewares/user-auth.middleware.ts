import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from './error.middleware.js';
import type { UserAuthService } from '../services/user-auth.service.js';
import type { AppState } from '../types/api.js';

export function requireUser(service: UserAuthService): Middleware<AppState> {
  return async (ctx, next) => {
    const authorization = ctx.get('authorization');
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
    }

    ctx.state.user = await service.authenticate(token);
    await next();
  };
}
