import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { cartService } from '../services/cart.service.js';
import { success, type AppState } from '../types/api.js';

const itemIdSchema = z.string().trim().min(1).max(30);
const addItemSchema = z.object({
  productId: z.string().trim().min(1).max(30),
  quantity: z.number().int().positive().default(1),
  replaceExistingCart: z.boolean().default(false),
});
const updateItemSchema = z.object({ quantity: z.number().int().positive() });

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  }
  return parsed.data;
}

function userOrThrow(state: AppState) {
  if (!state.user) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return state.user;
}

export const getCart: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await cartService.get(userOrThrow(ctx.state)));
};

export const addCartItem: Middleware<AppState> = async (ctx) => {
  const body = parseOrThrow(addItemSchema, ctx.request.body);
  ctx.body = success(
    await cartService.add(
      userOrThrow(ctx.state),
      body.productId,
      body.quantity,
      body.replaceExistingCart,
    ),
  );
};

export const updateCartItem: Middleware<AppState> = async (ctx) => {
  const itemId = parseOrThrow(itemIdSchema, ctx.params.itemId);
  const body = parseOrThrow(updateItemSchema, ctx.request.body);
  ctx.body = success(await cartService.update(userOrThrow(ctx.state), itemId, body.quantity));
};

export const removeCartItem: Middleware<AppState> = async (ctx) => {
  const itemId = parseOrThrow(itemIdSchema, ctx.params.itemId);
  ctx.body = success(await cartService.remove(userOrThrow(ctx.state), itemId));
};

export const clearCart: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await cartService.clear(userOrThrow(ctx.state)));
};
