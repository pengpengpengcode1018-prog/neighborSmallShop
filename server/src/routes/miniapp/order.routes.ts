import Router from '@koa/router';

import {
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
  previewOrder,
} from '../../controllers/order.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import type { OrderClosingService } from '../../services/order-closing.service.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappOrderRouter(
  provider: WechatIdentityProvider,
  closingService: OrderClosingService,
): Router {
  const router = new Router({ prefix: '/orders' });
  router.use(requireUser(new UserAuthService(provider)));
  router.post('/preview', previewOrder);
  router.get('/', listOrders);
  router.post('/', createOrder);
  router.get('/:orderId', getOrder);
  router.post('/:orderId/cancel', cancelOrder(closingService));
  return router;
}
