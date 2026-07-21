import Router from '@koa/router';

import { listAvailableCommunities } from '../../controllers/community-selection.controller.js';

export function createMiniappCommunityRouter(): Router {
  const router = new Router({ prefix: '/communities' });
  router.get('/', listAvailableCommunities);
  return router;
}
