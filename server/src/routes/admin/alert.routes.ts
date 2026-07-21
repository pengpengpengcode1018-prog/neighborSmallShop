import Router from '@koa/router';

import {
  getAdminAlertSummary,
  listAdminAlerts,
  markAdminAlertRead,
} from '../../controllers/notification.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';
import type { NotificationService } from '../../services/notification.service.js';

export function createAdminAlertRouter(notificationService: NotificationService): Router {
  const router = new Router({ prefix: '/admin/alerts' });
  router.use(requireAdmin);
  router.get('/summary', getAdminAlertSummary(notificationService));
  router.get('/', listAdminAlerts(notificationService));
  router.post('/:alertId/read', markAdminAlertRead(notificationService));
  return router;
}
