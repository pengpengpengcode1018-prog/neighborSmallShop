import Router from '@koa/router';

import { selectCurrentCommunity } from '../../controllers/community-selection.controller.js';
import {
  bindWechatPhone,
  getCurrentUser,
  getUserAvatar,
  updateCurrentUser,
} from '../../controllers/user-auth.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import type { WechatPhoneProvider } from '../../providers/wechat-phone.provider.js';
import { UserAuthService } from '../../services/user-auth.service.js';
import { UserPhoneService } from '../../services/user-phone.service.js';

export function createMiniappUserRouter(
  provider: WechatIdentityProvider,
  phoneProvider: WechatPhoneProvider,
): Router {
  const router = new Router({ prefix: '/users' });
  const service = new UserAuthService(provider);
  const phoneService = new UserPhoneService(phoneProvider);
  router.get('/:id/avatar', getUserAvatar(service));
  router.get('/profile', requireUser(service), getCurrentUser);
  router.put('/profile', requireUser(service), updateCurrentUser(service));
  router.patch('/profile', requireUser(service), updateCurrentUser(service));
  router.post('/phone', requireUser(service), bindWechatPhone(phoneService));
  router.put('/current-community', requireUser(service), selectCurrentCommunity);
  return router;
}
