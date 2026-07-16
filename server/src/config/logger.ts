import pino from 'pino';

import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  base: {
    service: 'nearby-shop-server',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'token',
      'password',
      'phone',
      'wechatAppSecret',
      'paymentKey',
    ],
    censor: '[REDACTED]',
  },
});
