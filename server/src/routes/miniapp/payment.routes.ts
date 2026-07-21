import Router from '@koa/router';

import {
  getWechatPaymentStatus,
  initializeWechatPayment,
  notifyWechatPayment,
} from '../../controllers/payment.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import type { WechatPaymentProvider } from '../../providers/wechat-payment.provider.js';
import { PaymentService } from '../../services/payment.service.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappPaymentRouter(
  identityProvider: WechatIdentityProvider,
  paymentProvider: WechatPaymentProvider,
): Router {
  const router = new Router({ prefix: '/payments' });
  const paymentService = new PaymentService(paymentProvider);
  const requireResident = requireUser(new UserAuthService(identityProvider));

  router.post('/wechat/notify', notifyWechatPayment(paymentService));
  router.post('/wechat', requireResident, initializeWechatPayment(paymentService));
  router.get('/orders/:orderId/status', requireResident, getWechatPaymentStatus(paymentService));
  return router;
}
