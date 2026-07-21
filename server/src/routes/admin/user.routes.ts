import Router from '@koa/router';

import { getAdminUser, listAdminUsers } from '../../controllers/admin-user.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createAdminUserRouter(): Router {
  const router = new Router({ prefix: '/admin/users' });
  router.use(requireAdmin);
  router.get('/', listAdminUsers);
  router.get('/:id', getAdminUser);
  return router;
}
