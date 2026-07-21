import Router from '@koa/router';

import { getResidentProduct } from '../../controllers/resident-product.controller.js';

export function createMiniappProductRouter(): Router {
  const router = new Router({ prefix: '/products' });
  router.get('/:id', getResidentProduct);
  return router;
}
