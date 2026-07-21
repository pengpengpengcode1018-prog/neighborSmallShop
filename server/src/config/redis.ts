import { Redis } from 'ioredis';

import { env } from './env.js';

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    connectTimeout: 1_500,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}
