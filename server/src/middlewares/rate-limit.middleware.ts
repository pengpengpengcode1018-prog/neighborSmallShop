import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import type { AppState } from '../types/api.js';
import { HttpError } from './error.middleware.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitPolicy {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitOptions {
  enabled: boolean;
  defaultPolicy: RateLimitPolicy;
  authPolicy: RateLimitPolicy;
  now?: () => number;
}

const authPaths = new Set(['/api/v1/admin/auth/login', '/api/v1/auth/wechat-login']);

export function createRateLimitMiddleware(options: RateLimitOptions): Middleware<AppState> {
  const buckets = new Map<string, RateLimitBucket>();
  const now = options.now ?? Date.now;

  return async (ctx, next) => {
    if (!options.enabled) {
      await next();
      return;
    }

    const policy = authPaths.has(ctx.path) ? options.authPolicy : options.defaultPolicy;
    const timestamp = now();
    const key = `${authPaths.has(ctx.path) ? 'auth' : 'api'}:${ctx.ip}`;
    if (!buckets.has(key) && buckets.size >= 10_000) {
      for (const [bucketKey, candidate] of buckets) {
        if (candidate.resetAt <= timestamp) buckets.delete(bucketKey);
      }
      if (buckets.size >= 10_000) {
        const oldestKey = buckets.keys().next().value as string | undefined;
        if (oldestKey) buckets.delete(oldestKey);
      }
    }
    const current = buckets.get(key);
    const bucket =
      !current || current.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + policy.windowMs }
        : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, policy.maxRequests - bucket.count);
    ctx.set('x-ratelimit-limit', String(policy.maxRequests));
    ctx.set('x-ratelimit-remaining', String(remaining));
    ctx.set('x-ratelimit-reset', String(Math.ceil(bucket.resetAt / 1_000)));

    if (bucket.count > policy.maxRequests) {
      ctx.set('retry-after', String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1_000))));
      throw new HttpError(429, ERROR_CODES.RATE_LIMITED, '请求过于频繁，请稍后重试');
    }

    await next();
  };
}
