import Router from '@koa/router';

import {
  createCommunity,
  deleteCommunity,
  listCommunities,
  updateCommunity,
  updateCommunityStatus,
} from '../../controllers/community.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createCommunityRouter(): Router {
  const router = new Router({ prefix: '/admin/communities' });
  router.use(requireAdmin);
  router.get('/', listCommunities);
  router.post('/', createCommunity);
  router.put('/:id', updateCommunity);
  router.patch('/:id/status', updateCommunityStatus);
  router.delete('/:id', deleteCommunity);
  return router;
}
