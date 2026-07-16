import Router from '@koa/router';

import { getHealth } from '../controllers/health.controller.js';

export function createApiRouter(): Router {
  const router = new Router({ prefix: '/api/v1' });
  router.get('/health', getHealth);
  return router;
}
