import Router from '@koa/router';

import {
  createDeliverySlot,
  getDeliveryConfig,
  updateDeliveryModes,
  updateDeliverySlot,
  updateDeliverySlotStatus,
} from '../../controllers/delivery.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createDeliveryRouter(): Router {
  const router = new Router({ prefix: '/admin/stores/:storeId' });
  router.use(requireAdmin);
  router.get('/delivery-config', getDeliveryConfig);
  router.put('/delivery-modes', updateDeliveryModes);
  router.post('/delivery-slots', createDeliverySlot);
  router.put('/delivery-slots/:slotId', updateDeliverySlot);
  router.patch('/delivery-slots/:slotId/status', updateDeliverySlotStatus);
  return router;
}
