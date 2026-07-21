import Router from '@koa/router';

import {
  getAdminOrder,
  listAdminOrders,
  transitionAdminOrder,
  updateAdminOrderRemark,
} from '../../controllers/admin-order.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';
import type { OrderClosingService } from '../../services/order-closing.service.js';

export function createAdminOrderRouter(closingService: OrderClosingService): Router {
  const router = new Router({ prefix: '/admin/orders' });
  router.use(requireAdmin);
  router.get('/', listAdminOrders);
  router.get('/:orderId', getAdminOrder);
  router.post('/:orderId/status', transitionAdminOrder(closingService));
  router.put('/:orderId/remark', updateAdminOrderRemark);
  return router;
}
