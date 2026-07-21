import type { Middleware } from 'koa';

import { ERROR_CODES } from '../constants/error-codes.js';
import type { AppState } from '../types/api.js';
import { HttpError } from './error.middleware.js';

declare module 'koa' {
  interface Request {
    body?: unknown;
    rawBody?: string;
  }
}

const methodsWithBodies = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const defaultMaximumBytes = 1024 * 1024;

export function createJsonBodyMiddleware(maximumBytes = defaultMaximumBytes): Middleware<AppState> {
  return async (ctx, next) => {
    if (!methodsWithBodies.has(ctx.method)) {
      await next();
      return;
    }

    const contentLength = Number(ctx.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      ctx.req.resume();
      throw new HttpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, '请求内容过大');
    }

    const contentType = ctx.get('content-type').split(';', 1)[0]?.trim().toLowerCase();
    if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) {
      ctx.req.resume();
      throw new HttpError(415, ERROR_CODES.VALIDATION_ERROR, '只接受 JSON 请求内容');
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of ctx.req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maximumBytes) {
        throw new HttpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, '请求内容过大');
      }
      chunks.push(buffer);
    }

    const rawBody = Buffer.concat(chunks).toString('utf8');
    ctx.request.rawBody = rawBody;
    if (rawBody.length > 0) {
      try {
        ctx.request.body = JSON.parse(rawBody) as unknown;
      } catch {
        throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'JSON 请求内容不正确');
      }
    }
    await next();
  };
}
