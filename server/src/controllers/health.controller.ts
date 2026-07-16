import type { Middleware } from 'koa';

import { getHealthSnapshot } from '../services/health.service.js';
import { success, type AppState } from '../types/api.js';

export const getHealth: Middleware<AppState> = async (ctx) => {
  ctx.body = success(getHealthSnapshot());
};
