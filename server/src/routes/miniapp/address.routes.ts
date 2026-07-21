import Router from '@koa/router';

import {
  createAddress,
  listAddresses,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '../../controllers/address.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappAddressRouter(provider: WechatIdentityProvider): Router {
  const router = new Router({ prefix: '/addresses' });
  router.use(requireUser(new UserAuthService(provider)));
  router.get('/', listAddresses);
  router.post('/', createAddress);
  router.put('/:addressId', updateAddress);
  router.delete('/:addressId', removeAddress);
  router.put('/:addressId/default', setDefaultAddress);
  return router;
}
