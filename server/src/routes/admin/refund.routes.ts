import Router from '@koa/router';

import {
  approveAdminRefund,
  getAdminRefund,
  listAdminRefunds,
  rejectAdminRefund,
} from '../../controllers/admin-refund.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';
import type { RefundService } from '../../services/refund.service.js';

export function createAdminRefundRouter(refundService: RefundService): Router {
  const router = new Router({ prefix: '/admin/refunds' });
  router.use(requireAdmin);
  router.get('/', listAdminRefunds(refundService));
  router.get('/:refundId', getAdminRefund(refundService));
  router.post('/:refundId/approve', approveAdminRefund(refundService));
  router.post('/:refundId/reject', rejectAdminRefund(refundService));
  return router;
}
