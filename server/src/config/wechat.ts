import { env } from './env.js';
import { z } from 'zod';

import type { WechatSubscriptionTemplates } from '../types/notification.js';

const keywordSchema = z
  .string()
  .regex(
    /^(thing|number|letter|symbol|character_string|time|date|amount|phone_number|car_number|name|phrase)\d+$/,
  );
const fieldsSchema = z
  .object({
    orderNo: keywordSchema.optional(),
    storeName: keywordSchema.optional(),
    status: keywordSchema.optional(),
    occurredAt: keywordSchema.optional(),
    amount: keywordSchema.optional(),
  })
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, 'at least one field mapping is required');
const templateSchema = z
  .object({
    templateId: z.string().trim().min(1).max(128),
    fields: fieldsSchema,
  })
  .strict();
const templatesSchema = z
  .object({
    ORDER_PAID: templateSchema.optional(),
    ORDER_ACCEPTED: templateSchema.optional(),
    ORDER_DELIVERING: templateSchema.optional(),
    ORDER_COMPLETED: templateSchema.optional(),
    ORDER_CANCELLED: templateSchema.optional(),
    REFUND_SUCCESS: templateSchema.optional(),
  })
  .strict();

function parseSubscriptionTemplates(value: string): WechatSubscriptionTemplates {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new Error('WECHAT_SUBSCRIBE_TEMPLATES_JSON must be valid JSON.');
  }
  const parsed = templatesSchema.parse(raw);
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
      Boolean(entry[1]),
    ),
  ) as WechatSubscriptionTemplates;
}

export const wechatConfig = Object.freeze({
  appId: env.WECHAT_APP_ID,
  appSecret: env.WECHAT_APP_SECRET,
  merchantId: env.WECHAT_MCH_ID,
  merchantSerialNo: env.WECHAT_PAY_MERCHANT_SERIAL_NO,
  merchantPrivateKey: env.WECHAT_PAY_PRIVATE_KEY,
  apiV3Key: env.WECHAT_PAY_API_V3_KEY,
  publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID,
  publicKeys:
    env.WECHAT_PAY_PUBLIC_KEYS_JSON ??
    (env.WECHAT_PAY_PUBLIC_KEY_ID && env.WECHAT_PAY_PUBLIC_KEY
      ? { [env.WECHAT_PAY_PUBLIC_KEY_ID]: env.WECHAT_PAY_PUBLIC_KEY }
      : undefined),
  notifyUrl: env.WECHAT_PAY_NOTIFY_URL,
  refundNotifyUrl: env.WECHAT_PAY_REFUND_NOTIFY_URL,
  subscriptionTemplates: parseSubscriptionTemplates(env.WECHAT_SUBSCRIBE_TEMPLATES_JSON),
  miniProgramState: env.WECHAT_MINIPROGRAM_STATE,
});
