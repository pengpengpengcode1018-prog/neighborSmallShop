import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { catalogService } from '../services/catalog.service.js';
import { success, type AppState } from '../types/api.js';

const enableStatus = z.enum(['ENABLED', 'DISABLED']);
const productStatus = z.enum(['ON_SALE', 'SOLD_OUT', 'OFF_SHELF']);
const money = z.string().regex(/^\d{1,8}\.\d{2}$/);
const categoryWrite = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  status: enableStatus.default('ENABLED'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
const productWrite = z.object({
  storeId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  detail: z.string().max(50_000).optional(),
  price: money,
  originalPrice: money.optional(),
  stock: z.number().int().min(0).max(4_294_967_295),
  purchaseLimit: z.number().int().positive().max(4_294_967_295).optional(),
  stockWarningThreshold: z.number().int().min(0).max(4_294_967_295).default(10),
  isHot: z.boolean().default(false),
  status: productStatus.default('OFF_SHELF'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '请求参数不正确');
  return result.data;
}

function actor(ctx: Parameters<Middleware<AppState>>[0]) {
  if (!ctx.state.admin) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return {
    adminId: ctx.state.admin.id,
    operatorName: ctx.state.admin.displayName,
    requestIp: ctx.ip,
    requestPath: ctx.path,
    ...(ctx.state.requestId ? { requestId: ctx.state.requestId } : {}),
  };
}

export const listCategories: Middleware<AppState> = async (ctx) => {
  const query = parse(z.object({ storeId: z.string().min(1) }), ctx.query);
  ctx.body = success(await catalogService.listCategories(query.storeId));
};
export const createCategory: Middleware<AppState> = async (ctx) => {
  ctx.status = 201;
  ctx.body = success(
    await catalogService.createCategory(parse(categoryWrite, ctx.request.body), actor(ctx)),
  );
};
export const updateCategory: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await catalogService.updateCategory(
      ctx.params.id,
      parse(categoryWrite, ctx.request.body),
      actor(ctx),
    ),
  );
};
export const deleteCategory: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await catalogService.removeCategory(ctx.params.id, actor(ctx)));
};
export const listProducts: Middleware<AppState> = async (ctx) => {
  const query = parse(
    z.object({
      storeId: z.string().min(1),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
      keyword: z.string().trim().max(120).optional(),
      categoryId: z.string().optional(),
      status: productStatus.optional(),
    }),
    ctx.query,
  );
  ctx.body = success(
    await catalogService.listProducts(
      query.storeId,
      query.page,
      query.pageSize,
      query.keyword,
      query.categoryId,
      query.status,
    ),
  );
};
export const createProduct: Middleware<AppState> = async (ctx) => {
  ctx.status = 201;
  ctx.body = success(
    await catalogService.createProduct(parse(productWrite, ctx.request.body), actor(ctx)),
  );
};
export const updateProduct: Middleware<AppState> = async (ctx) => {
  ctx.body = success(
    await catalogService.updateProduct(
      ctx.params.id,
      parse(productWrite, ctx.request.body),
      actor(ctx),
    ),
  );
};
export const deleteProduct: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await catalogService.removeProduct(ctx.params.id, actor(ctx)));
};
