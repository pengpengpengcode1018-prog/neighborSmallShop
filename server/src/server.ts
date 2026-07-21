import { createApp } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { CloseExpiredOrdersJob } from './jobs/close-expired-orders.job.js';
import { NotificationJob } from './jobs/notification.job.js';
import { officialWechatPaymentProvider } from './providers/wechat-payment.provider.js';
import { officialWechatSubscriptionProvider } from './providers/wechat-subscription.provider.js';
import { NotificationService } from './services/notification.service.js';
import { OrderClosingService } from './services/order-closing.service.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});
const expiredOrderJob = new CloseExpiredOrdersJob(
  new OrderClosingService(officialWechatPaymentProvider, {
    leaseMs: env.PAYMENT_CLOSE_LEASE_MS,
  }),
  env.EXPIRED_ORDER_JOB_INTERVAL_MS,
  env.EXPIRED_ORDER_JOB_BATCH_SIZE,
);
if (env.EXPIRED_ORDER_JOB_ENABLED) expiredOrderJob.start();
const notificationJob = new NotificationJob(
  new NotificationService(officialWechatSubscriptionProvider),
  env.NOTIFICATION_JOB_INTERVAL_MS,
  env.NOTIFICATION_JOB_BATCH_SIZE,
);
if (env.NOTIFICATION_JOB_ENABLED) notificationJob.start();

let isShuttingDown = false;

function shutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  expiredOrderJob.stop();
  notificationJob.stop();
  logger.info({ signal }, 'server shutdown requested');
  server.close((error) => {
    void finishShutdown(error);
  });
}

async function finishShutdown(serverError?: Error): Promise<void> {
  let failed = Boolean(serverError);
  if (serverError) logger.error({ err: serverError }, 'server shutdown failed');

  try {
    await prisma.$disconnect();
  } catch (error) {
    failed = true;
    logger.error({ err: error }, 'database disconnect failed');
  }

  if (failed) process.exitCode = 1;
  logger.info('server stopped');
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
