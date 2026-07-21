import 'dotenv/config';
import { z } from 'zod';

export const developmentJwtSecret = 'development-only-replace-before-shared-use-32';

const emptyStringAsUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalString = z.preprocess(emptyStringAsUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(emptyStringAsUndefined, z.string().url().optional());
const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');
const commaSeparatedOrigins = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
const wechatPaymentPublicKeyId = z.string().trim().min(1).max(128);
const wechatPaymentPublicKeysSchema = z
  .record(wechatPaymentPublicKeyId, z.string().trim().min(1))
  .refine(
    (publicKeys) => Object.keys(publicKeys).length >= 1 && Object.keys(publicKeys).length <= 8,
    'WECHAT_PAY_PUBLIC_KEYS_JSON must contain between 1 and 8 public keys.',
  );
const optionalWechatPaymentPublicKeys = z
  .preprocess(emptyStringAsUndefined, z.string().optional())
  .transform((value, context) => {
    if (!value) return undefined;
    try {
      return wechatPaymentPublicKeysSchema.parse(JSON.parse(value) as unknown);
    } catch {
      context.addIssue({
        code: 'custom',
        message:
          'WECHAT_PAY_PUBLIC_KEYS_JSON must be a JSON object containing 1 to 8 public-key ID to PEM mappings.',
      });
      return z.NEVER;
    }
  });

function hasConfiguredSubscriptionTemplate(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('mysql://nearby_shop:nearby_shop_dev@127.0.0.1:3306/nearby_shop'),
    REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
    JWT_SECRET: z.string().min(32).default(developmentJwtSecret),
    JWT_EXPIRES_IN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(8 * 60 * 60),
    TRUST_PROXY: booleanFromString.default(false),
    RATE_LIMIT_ENABLED: booleanFromString.default(true),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60 * 60 * 1_000)
      .default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().max(100_000).default(600),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().max(1_000).default(20),
    CORS_ALLOWED_ORIGINS: commaSeparatedOrigins,
    WECHAT_APP_ID: optionalString,
    WECHAT_APP_SECRET: optionalString,
    WECHAT_MCH_ID: optionalString,
    WECHAT_PAY_MERCHANT_SERIAL_NO: optionalString,
    WECHAT_PAY_PRIVATE_KEY: optionalString,
    WECHAT_PAY_API_V3_KEY: optionalString,
    WECHAT_PAY_PUBLIC_KEY_ID: optionalString,
    WECHAT_PAY_PUBLIC_KEYS_JSON: optionalWechatPaymentPublicKeys,
    /** @deprecated Compatibility for one-key development configurations. */
    WECHAT_PAY_PUBLIC_KEY: optionalString,
    WECHAT_PAY_NOTIFY_URL: optionalUrl,
    WECHAT_PAY_REFUND_NOTIFY_URL: optionalUrl,
    WECHAT_SUBSCRIBE_TEMPLATES_JSON: z.string().default('{}'),
    WECHAT_MINIPROGRAM_STATE: z.enum(['developer', 'trial', 'formal']).default('developer'),
    EXPIRED_ORDER_JOB_ENABLED: booleanFromString.default(true),
    EXPIRED_ORDER_JOB_INTERVAL_MS: z.coerce.number().int().min(1_000).default(30_000),
    EXPIRED_ORDER_JOB_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(50),
    PAYMENT_CLOSE_LEASE_MS: z.coerce.number().int().min(5_000).default(30_000),
    NOTIFICATION_JOB_ENABLED: booleanFromString.default(true),
    NOTIFICATION_JOB_INTERVAL_MS: z.coerce.number().int().min(1_000).default(15_000),
    NOTIFICATION_JOB_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(50),
    NOTIFICATION_RETRY_DELAY_MS: z.coerce.number().int().min(1_000).default(30_000),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
    ADMIN_ALERT_UNACCEPTED_MINUTES: z.coerce.number().int().positive().max(120).default(10),
  })
  .superRefine((value, context) => {
    const identityConfiguration = [value.WECHAT_APP_ID, value.WECHAT_APP_SECRET];
    if (identityConfiguration.some(Boolean) && !identityConfiguration.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        message: 'WECHAT_APP_ID and WECHAT_APP_SECRET must be configured together.',
        path: ['WECHAT_APP_ID'],
      });
    }

    if (value.WECHAT_PAY_PUBLIC_KEYS_JSON && value.WECHAT_PAY_PUBLIC_KEY) {
      context.addIssue({
        code: 'custom',
        message: 'Use WECHAT_PAY_PUBLIC_KEYS_JSON or legacy WECHAT_PAY_PUBLIC_KEY, never both.',
        path: ['WECHAT_PAY_PUBLIC_KEYS_JSON'],
      });
    }
    if (
      value.WECHAT_PAY_PUBLIC_KEYS_JSON &&
      value.WECHAT_PAY_PUBLIC_KEY_ID &&
      !Object.hasOwn(value.WECHAT_PAY_PUBLIC_KEYS_JSON, value.WECHAT_PAY_PUBLIC_KEY_ID)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'WECHAT_PAY_PUBLIC_KEY_ID must exist in WECHAT_PAY_PUBLIC_KEYS_JSON.',
        path: ['WECHAT_PAY_PUBLIC_KEY_ID'],
      });
    }
    const configuredPaymentPublicKeys =
      value.WECHAT_PAY_PUBLIC_KEYS_JSON ?? value.WECHAT_PAY_PUBLIC_KEY;
    const paymentConfiguration = [
      value.WECHAT_MCH_ID,
      value.WECHAT_PAY_MERCHANT_SERIAL_NO,
      value.WECHAT_PAY_PRIVATE_KEY,
      value.WECHAT_PAY_API_V3_KEY,
      value.WECHAT_PAY_PUBLIC_KEY_ID,
      configuredPaymentPublicKeys,
      value.WECHAT_PAY_NOTIFY_URL,
      value.WECHAT_PAY_REFUND_NOTIFY_URL,
    ];
    if (paymentConfiguration.some(Boolean) && !paymentConfiguration.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        message: 'All WeChat Pay credentials and notification URLs must be configured together.',
        path: ['WECHAT_MCH_ID'],
      });
    }

    if (value.NODE_ENV !== 'production') return;

    if (
      value.JWT_SECRET === developmentJwtSecret ||
      /replace|change[-_ ]?me|example|nearby.shop/i.test(value.JWT_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'JWT_SECRET must be a non-placeholder secret in production.',
        path: ['JWT_SECRET'],
      });
    }
    if (/nearby_shop_(?:dev|root_dev)/.test(value.DATABASE_URL)) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL must not use development credentials in production.',
        path: ['DATABASE_URL'],
      });
    }
    if (!new URL(value.REDIS_URL).password) {
      context.addIssue({
        code: 'custom',
        message: 'REDIS_URL must include authentication in production.',
        path: ['REDIS_URL'],
      });
    }

    for (const origin of value.CORS_ALLOWED_ORIGINS) {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'CORS_ALLOWED_ORIGINS must contain valid origins.',
          path: ['CORS_ALLOWED_ORIGINS'],
        });
        continue;
      }
      const loopbackHttpOrigin =
        parsedOrigin.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(parsedOrigin.hostname);
      if (
        (parsedOrigin.protocol !== 'https:' && !loopbackHttpOrigin) ||
        parsedOrigin.origin !== origin ||
        origin.includes('*')
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Production CORS origins must be exact HTTPS origins or loopback HTTP origins without paths or wildcards.',
          path: ['CORS_ALLOWED_ORIGINS'],
        });
      }
    }

    for (const [path, url] of [
      ['WECHAT_PAY_NOTIFY_URL', value.WECHAT_PAY_NOTIFY_URL],
      ['WECHAT_PAY_REFUND_NOTIFY_URL', value.WECHAT_PAY_REFUND_NOTIFY_URL],
    ] as const) {
      if (url && (!url.startsWith('https://') || new URL(url).hostname.endsWith('example.com'))) {
        context.addIssue({
          code: 'custom',
          message: `${path} must use a real HTTPS endpoint in production.`,
          path: [path],
        });
      }
    }

    if (
      value.WECHAT_MINIPROGRAM_STATE === 'formal' &&
      (!identityConfiguration.every(Boolean) ||
        !paymentConfiguration.every(Boolean) ||
        !hasConfiguredSubscriptionTemplate(value.WECHAT_SUBSCRIBE_TEMPLATES_JSON))
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Formal mini program releases require identity, payment, notification URLs and subscription templates.',
        path: ['WECHAT_MINIPROGRAM_STATE'],
      });
    }
  });

export type Environment = z.output<typeof envSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  return envSchema.parse(input);
}

const parsed = parseEnvironment(process.env);

export const env = Object.freeze(parsed);
