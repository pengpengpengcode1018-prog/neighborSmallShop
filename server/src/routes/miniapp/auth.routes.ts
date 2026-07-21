import Router from '@koa/router';

import { loginWechat } from '../../controllers/user-auth.controller.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappAuthRouter(provider: WechatIdentityProvider): Router {
  const router = new Router({ prefix: '/auth' });
  const service = new UserAuthService(provider);
  router.post('/wechat-login', loginWechat(service));
  return router;
}
