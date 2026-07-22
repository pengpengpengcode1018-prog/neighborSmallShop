import Router from '@koa/router';

import { uploadImage } from '../../controllers/media.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createAdminMediaRouter(): Router {
  const router = new Router({ prefix: '/admin/media' });
  router.use(requireAdmin);
  router.post('/images', uploadImage);
  return router;
}
