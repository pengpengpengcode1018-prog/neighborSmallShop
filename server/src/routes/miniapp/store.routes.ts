import Router from '@koa/router';

import {
  getResidentStore,
  listResidentStores,
} from '../../controllers/resident-store.controller.js';
import { listResidentProducts } from '../../controllers/resident-product.controller.js';

export function createMiniappStoreRouter(): Router {
  const router = new Router({ prefix: '/stores' });
  router.get('/', listResidentStores);
  router.get('/:id/products', listResidentProducts);
  router.get('/:id', getResidentStore);
  return router;
}
