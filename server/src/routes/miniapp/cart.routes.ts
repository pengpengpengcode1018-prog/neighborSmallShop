import Router from '@koa/router';

import {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../../controllers/cart.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappCartRouter(provider: WechatIdentityProvider): Router {
  const router = new Router({ prefix: '/cart' });
  router.use(requireUser(new UserAuthService(provider)));
  router.get('/', getCart);
  router.post('/items', addCartItem);
  router.put('/items/:itemId', updateCartItem);
  router.delete('/items/:itemId', removeCartItem);
  router.delete('/', clearCart);
  return router;
}
