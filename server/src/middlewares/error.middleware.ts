import type { Middleware } from 'koa';

import { ERROR_CODES, type ErrorCode } from '../constants/error-codes.js';
import { logger } from '../config/logger.js';
import { failure, type AppState } from '../types/api.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorMiddleware: Middleware<AppState> = async (ctx, next) => {
  try {
    await next();
    if (ctx.status === 404 && ctx.body == null) {
      ctx.body = failure(ERROR_CODES.NOT_FOUND, '请求的资源不存在');
      ctx.status = 404;
    }
  } catch (error) {
    const httpError = error instanceof HttpError ? error : null;
    ctx.status = httpError?.status ?? 500;
    ctx.body = failure(
      httpError?.code ?? ERROR_CODES.INTERNAL_ERROR,
      httpError?.message ?? '服务暂时不可用',
    );
    logger.error(
      {
        err: error,
        method: ctx.method,
        path: ctx.path,
        requestId: ctx.state.requestId,
        status: ctx.status,
      },
      'request failed',
    );
  }
};
