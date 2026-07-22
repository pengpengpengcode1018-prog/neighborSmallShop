import Router from '@koa/router';

import { getImage } from '../controllers/media.controller.js';

export function createMediaRouter(): Router {
  const router = new Router({ prefix: '/media' });
  router.get('/images/:id', getImage);
  return router;
}
