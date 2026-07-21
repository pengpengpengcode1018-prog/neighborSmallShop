import Koa from 'koa';

import { errorMiddleware } from './middlewares/error.middleware.js';
import { createJsonBodyMiddleware } from './middlewares/json-body.middleware.js';
import { requestLoggerMiddleware } from './middlewares/logger.middleware.js';
import {
  officialWechatIdentityProvider,
  type WechatIdentityProvider,
} from './providers/wechat-identity.provider.js';
import {
  officialWechatPhoneProvider,
  type WechatPhoneProvider,
} from './providers/wechat-phone.provider.js';
import {
  officialWechatPaymentProvider,
  type WechatPaymentProvider,
  type WechatRefundProvider,
} from './providers/wechat-payment.provider.js';
import {
  officialWechatSubscriptionProvider,
  type WechatSubscriptionProvider,
} from './providers/wechat-subscription.provider.js';
import { createApiRouter } from './routes/index.js';
import type { AppState } from './types/api.js';
import type { WechatSubscriptionTemplates } from './types/notification.js';
import type { NotificationServiceOptions } from './services/notification.service.js';
import { env } from './config/env.js';
import {
  createRateLimitMiddleware,
  type RateLimitOptions,
} from './middlewares/rate-limit.middleware.js';
import { createCorsMiddleware } from './middlewares/cors.middleware.js';

export interface AppDependencies {
  wechatIdentityProvider?: WechatIdentityProvider;
  wechatPhoneProvider?: WechatPhoneProvider;
  wechatPaymentProvider?: WechatPaymentProvider;
  wechatRefundProvider?: WechatRefundProvider;
  wechatSubscriptionProvider?: WechatSubscriptionProvider;
  wechatSubscriptionTemplates?: WechatSubscriptionTemplates;
  notificationServiceOptions?: Omit<NotificationServiceOptions, 'templates'>;
  rateLimitOptions?: RateLimitOptions;
  corsAllowedOrigins?: readonly string[];
}

export function createApp(dependencies: AppDependencies = {}): Koa<AppState> {
  const app = new Koa<AppState>();
  app.proxy = env.TRUST_PROXY;
  const apiRouter = createApiRouter({
    wechatIdentityProvider: dependencies.wechatIdentityProvider ?? officialWechatIdentityProvider,
    wechatPhoneProvider: dependencies.wechatPhoneProvider ?? officialWechatPhoneProvider,
    wechatPaymentProvider: dependencies.wechatPaymentProvider ?? officialWechatPaymentProvider,
    wechatRefundProvider: dependencies.wechatRefundProvider ?? officialWechatPaymentProvider,
    wechatSubscriptionProvider:
      dependencies.wechatSubscriptionProvider ?? officialWechatSubscriptionProvider,
    ...(dependencies.wechatSubscriptionTemplates
      ? { wechatSubscriptionTemplates: dependencies.wechatSubscriptionTemplates }
      : {}),
    ...(dependencies.notificationServiceOptions
      ? { notificationServiceOptions: dependencies.notificationServiceOptions }
      : {}),
  });

  app.use(requestLoggerMiddleware);
  app.use(errorMiddleware);
  app.use(createCorsMiddleware(dependencies.corsAllowedOrigins ?? env.CORS_ALLOWED_ORIGINS));
  app.use(
    createRateLimitMiddleware(
      dependencies.rateLimitOptions ?? {
        enabled: env.RATE_LIMIT_ENABLED && env.NODE_ENV !== 'test',
        defaultPolicy: {
          maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
          windowMs: env.RATE_LIMIT_WINDOW_MS,
        },
        authPolicy: {
          maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
          windowMs: env.RATE_LIMIT_WINDOW_MS,
        },
      },
    ),
  );
  app.use(createJsonBodyMiddleware());
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());

  return app;
}
