import Router from '@koa/router';

import {
  getOperationLog,
  getOperationsDashboard,
  listOperationLogs,
} from '../../controllers/operations.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createOperationsRouter(): Router {
  const router = new Router({ prefix: '/admin' });
  router.use(requireAdmin);
  router.get('/operations/dashboard', getOperationsDashboard);
  router.get('/operation-logs', listOperationLogs);
  router.get('/operation-logs/:id', getOperationLog);
  return router;
}
