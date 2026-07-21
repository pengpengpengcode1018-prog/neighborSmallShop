import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import { getHealthSnapshot, getReadinessSnapshot } from '../services/health.service.js';
import { failure, success, type AppState } from '../types/api.js';

export const getHealth: Middleware<AppState> = async (ctx) => {
  ctx.body = success(getHealthSnapshot());
};

export const getReadiness: Middleware<AppState> = async (ctx) => {
  const snapshot = await getReadinessSnapshot();

  if (snapshot.status !== 'ready') {
    ctx.status = 503;
    ctx.body = failure(ERROR_CODES.SERVICE_UNAVAILABLE, '服务依赖尚未就绪');
    return;
  }

  ctx.body = success(snapshot);
};
