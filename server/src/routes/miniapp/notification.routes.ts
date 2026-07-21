import Router from '@koa/router';

import {
  getSubscriptionSettings,
  reportSubscriptionResults,
} from '../../controllers/notification.controller.js';
import { requireUser } from '../../middlewares/user-auth.middleware.js';
import type { WechatIdentityProvider } from '../../providers/wechat-identity.provider.js';
import type { NotificationService } from '../../services/notification.service.js';
import { UserAuthService } from '../../services/user-auth.service.js';

export function createMiniappNotificationRouter(
  identityProvider: WechatIdentityProvider,
  notificationService: NotificationService,
): Router {
  const router = new Router({ prefix: '/notifications' });
  const requireResident = requireUser(new UserAuthService(identityProvider));
  router.get('/subscriptions', requireResident, getSubscriptionSettings(notificationService));
  router.post(
    '/subscriptions/report',
    requireResident,
    reportSubscriptionResults(notificationService),
  );
  return router;
}
