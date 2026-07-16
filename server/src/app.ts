import Koa from 'koa';
import { koaBody } from 'koa-body';

import { errorMiddleware } from './middlewares/error.middleware.js';
import { requestLoggerMiddleware } from './middlewares/logger.middleware.js';
import { createApiRouter } from './routes/index.js';
import type { AppState } from './types/api.js';

export function createApp(): Koa<AppState> {
  const app = new Koa<AppState>();
  const apiRouter = createApiRouter();

  app.use(errorMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(
    koaBody({
      jsonLimit: '1mb',
      multipart: false,
      urlencoded: true,
    }),
  );
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());

  return app;
}
