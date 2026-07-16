import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'server shutdown requested');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'server shutdown failed');
      process.exitCode = 1;
      return;
    }
    logger.info('server stopped');
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
