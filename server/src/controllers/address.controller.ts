import type { Middleware } from 'koa';
import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes.js';
import type { AddressLabel } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { addressService } from '../services/address.service.js';
import { success, type AppState } from '../types/api.js';

function optionalText(maximumLength: number) {
  return z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().min(1).max(maximumLength).nullable().optional(),
    )
    .transform((value) => value ?? null);
}

const addressIdSchema = z.string().trim().min(1).max(30);
const addressFields = {
  recipientName: z.string().trim().min(1).max(64),
  phone: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/),
  communityId: z.string().trim().min(1).max(30),
  building: z.string().trim().min(1).max(80),
  unit: optionalText(80),
  room: z.string().trim().min(1).max(80),
  detail: optionalText(255),
  label: z.enum(['HOME', 'COMPANY', 'SCHOOL', 'OTHER']),
};
const createAddressSchema = z.object({ ...addressFields, isDefault: z.boolean().default(false) });
const updateAddressSchema = z.object(addressFields);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '收货地址信息不正确');
  }
  return parsed.data;
}

function userIdOrThrow(state: AppState): string {
  if (!state.user) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
  return state.user.id;
}

export const listAddresses: Middleware<AppState> = async (ctx) => {
  ctx.body = success(await addressService.list(userIdOrThrow(ctx.state)));
};

export const createAddress: Middleware<AppState> = async (ctx) => {
  const body = parseOrThrow(createAddressSchema, ctx.request.body);
  const { isDefault, ...input } = body;
  ctx.body = success(
    await addressService.create(
      userIdOrThrow(ctx.state),
      {
        ...input,
        label: input.label as AddressLabel,
      },
      isDefault,
    ),
  );
};

export const updateAddress: Middleware<AppState> = async (ctx) => {
  const addressId = parseOrThrow(addressIdSchema, ctx.params.addressId);
  const input = parseOrThrow(updateAddressSchema, ctx.request.body);
  ctx.body = success(
    await addressService.update(userIdOrThrow(ctx.state), addressId, {
      ...input,
      label: input.label as AddressLabel,
    }),
  );
};

export const setDefaultAddress: Middleware<AppState> = async (ctx) => {
  const addressId = parseOrThrow(addressIdSchema, ctx.params.addressId);
  ctx.body = success(await addressService.setDefault(userIdOrThrow(ctx.state), addressId));
};

export const removeAddress: Middleware<AppState> = async (ctx) => {
  const addressId = parseOrThrow(addressIdSchema, ctx.params.addressId);
  ctx.body = success(await addressService.remove(userIdOrThrow(ctx.state), addressId));
};
