import Router from '@koa/router';

import { getHealth, getReadiness } from '../controllers/health.controller.js';
import { createAdminAuthRouter } from './admin/auth.routes.js';
import { createCommunityRouter } from './admin/community.routes.js';
import { createStoreRouter } from './admin/store.routes.js';
import { createAdminOrderRouter } from './admin/order.routes.js';
import { createAdminRefundRouter } from './admin/refund.routes.js';
import { createAdminAlertRouter } from './admin/alert.routes.js';
import { createCatalogRouter } from './admin/catalog.routes.js';
import { createDeliveryRouter } from './admin/delivery.routes.js';
import { createOperationsRouter } from './admin/operations.routes.js';
import { createAdminUserRouter } from './admin/user.routes.js';
import { createAdminMediaRouter } from './admin/media.routes.js';
import type { WechatIdentityProvider } from '../providers/wechat-identity.provider.js';
import type { WechatPhoneProvider } from '../providers/wechat-phone.provider.js';
import type {
  WechatPaymentProvider,
  WechatRefundProvider,
} from '../providers/wechat-payment.provider.js';
import type { WechatSubscriptionProvider } from '../providers/wechat-subscription.provider.js';
import { env } from '../config/env.js';
import { OrderClosingService } from '../services/order-closing.service.js';
import { RefundService } from '../services/refund.service.js';
import { NotificationService } from '../services/notification.service.js';
import type { NotificationServiceOptions } from '../services/notification.service.js';
import { createMiniappAuthRouter } from './miniapp/auth.routes.js';
import { createMiniappAddressRouter } from './miniapp/address.routes.js';
import { createMiniappCartRouter } from './miniapp/cart.routes.js';
import { createMiniappCommunityRouter } from './miniapp/community.routes.js';
import { createMiniappOrderRouter } from './miniapp/order.routes.js';
import { createMiniappProductRouter } from './miniapp/product.routes.js';
import { createMiniappRefundRouter } from './miniapp/refund.routes.js';
import { createMiniappPaymentRouter } from './miniapp/payment.routes.js';
import { createMiniappStoreRouter } from './miniapp/store.routes.js';
import { createMiniappUserRouter } from './miniapp/user.routes.js';
import { createMiniappNotificationRouter } from './miniapp/notification.routes.js';
import { createMediaRouter } from './media.routes.js';
import type { WechatSubscriptionTemplates } from '../types/notification.js';

export interface ApiRouterDependencies {
  wechatIdentityProvider: WechatIdentityProvider;
  wechatPhoneProvider: WechatPhoneProvider;
  wechatPaymentProvider: WechatPaymentProvider;
  wechatRefundProvider: WechatRefundProvider;
  wechatSubscriptionProvider: WechatSubscriptionProvider;
  wechatSubscriptionTemplates?: WechatSubscriptionTemplates;
  notificationServiceOptions?: Omit<NotificationServiceOptions, 'templates'>;
}

export function createApiRouter(dependencies: ApiRouterDependencies): Router {
  const router = new Router({ prefix: '/api/v1' });
  const closingService = new OrderClosingService(dependencies.wechatPaymentProvider, {
    leaseMs: env.PAYMENT_CLOSE_LEASE_MS,
  });
  const refundService = new RefundService(dependencies.wechatRefundProvider);
  const notificationService = new NotificationService(dependencies.wechatSubscriptionProvider, {
    ...dependencies.notificationServiceOptions,
    ...(dependencies.wechatSubscriptionTemplates
      ? { templates: dependencies.wechatSubscriptionTemplates }
      : {}),
  });
  router.get('/health', getHealth);
  router.get('/ready', getReadiness);
  router.use(createAdminAuthRouter().routes());
  router.use(createCommunityRouter().routes());
  router.use(createStoreRouter().routes());
  router.use(createCatalogRouter().routes());
  router.use(createDeliveryRouter().routes());
  router.use(createAdminOrderRouter(closingService).routes());
  router.use(createAdminRefundRouter(refundService).routes());
  router.use(createAdminAlertRouter(notificationService).routes());
  router.use(createOperationsRouter().routes());
  router.use(createAdminUserRouter().routes());
  router.use(createAdminMediaRouter().routes());
  router.use(createMiniappAuthRouter(dependencies.wechatIdentityProvider).routes());
  router.use(createMiniappAddressRouter(dependencies.wechatIdentityProvider).routes());
  router.use(createMiniappCartRouter(dependencies.wechatIdentityProvider).routes());
  router.use(
    createMiniappOrderRouter(dependencies.wechatIdentityProvider, closingService).routes(),
  );
  router.use(
    createMiniappPaymentRouter(
      dependencies.wechatIdentityProvider,
      dependencies.wechatPaymentProvider,
    ).routes(),
  );
  router.use(
    createMiniappRefundRouter(dependencies.wechatIdentityProvider, refundService).routes(),
  );
  router.use(createMiniappCommunityRouter().routes());
  router.use(createMiniappStoreRouter().routes());
  router.use(createMiniappProductRouter().routes());
  router.use(
    createMiniappUserRouter(
      dependencies.wechatIdentityProvider,
      dependencies.wechatPhoneProvider,
    ).routes(),
  );
  router.use(
    createMiniappNotificationRouter(
      dependencies.wechatIdentityProvider,
      notificationService,
    ).routes(),
  );
  router.use(createMediaRouter().routes());
  return router;
}
