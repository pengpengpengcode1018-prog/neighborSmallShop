import Router from '@koa/router';

import { applyRefund, getRefund, notifyWechatRefund } from '../../controllers/refund.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import type { RefundService } from '../../services/refund.service.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappRefundRouter(
  identityProvider: WechatIdentityProvider,
  refundService: RefundService,
): Router {
  const router = new Router();
  const requireResident = requireUser(new UserAuthService(identityProvider));
  router.post('/refunds/wechat/notify', notifyWechatRefund(refundService));
  router.post('/orders/:orderId/refunds', requireResident, applyRefund(refundService));
  router.get('/refunds/:refundId', requireResident, getRefund(refundService));
  return router;
}
