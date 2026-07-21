import { randomUUID } from 'node:crypto';
import type { Middleware } from 'koa';

import { logger } from '../config/logger.js';
import type { AppState } from '../types/api.js';

export const requestLoggerMiddleware: Middleware<AppState> = async (ctx, next) => {
  const startedAt = performance.now();
  const requestedId = ctx.get('x-request-id');
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(requestedId) ? requestedId : randomUUID();
  ctx.state.requestId = requestId;
  ctx.set('x-request-id', requestId);

  try {
    await next();
  } finally {
    logger.info(
      {
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        method: ctx.method,
        path: ctx.path,
        requestId,
        status: ctx.status,
      },
      'request completed',
    );
  }
};
