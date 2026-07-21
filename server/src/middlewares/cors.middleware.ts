import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import type { AppState } from '../types/api.js';
import { HttpError } from './error.middleware.js';

const allowedMethods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
const allowedHeaders = 'Authorization,Content-Type,X-Request-ID';
const exposedHeaders = 'X-Request-ID,Retry-After';

export function createCorsMiddleware(allowedOrigins: readonly string[]): Middleware<AppState> {
  const originAllowlist = new Set(allowedOrigins);

  return async (ctx, next) => {
    const origin = ctx.get('Origin');
    if (!origin) {
      await next();
      return;
    }

    ctx.vary('Origin');
    if (!originAllowlist.has(origin)) {
      throw new HttpError(403, ERROR_CODES.FORBIDDEN, '该页面来源不允许访问接口');
    }

    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Access-Control-Allow-Methods', allowedMethods);
    ctx.set('Access-Control-Allow-Headers', allowedHeaders);
    ctx.set('Access-Control-Expose-Headers', exposedHeaders);
    ctx.set('Access-Control-Max-Age', '600');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    await next();
  };
}
