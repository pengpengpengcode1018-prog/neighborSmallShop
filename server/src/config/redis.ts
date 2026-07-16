import { Redis } from 'ioredis';

import { env } from './env.js';

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}
