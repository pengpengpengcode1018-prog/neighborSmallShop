import Router from '@koa/router';

import {
  createStore,
  deleteStore,
  listStores,
  updateStore,
  updateStoreStatus,
} from '../../controllers/store.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createStoreRouter(): Router {
  const router = new Router({ prefix: '/admin/stores' });
  router.use(requireAdmin);
  router.get('/', listStores);
  router.post('/', createStore);
  router.put('/:id', updateStore);
  router.patch('/:id/status', updateStoreStatus);
  router.delete('/:id', deleteStore);
  return router;
}
