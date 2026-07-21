import Router from '@koa/router';

import { getCurrentAdmin, loginAdmin } from '../../controllers/admin-auth.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createAdminAuthRouter(): Router {
  const router = new Router({ prefix: '/admin/auth' });
  router.post('/login', loginAdmin);
  router.get('/me', requireAdmin, getCurrentAdmin);
  return router;
}
