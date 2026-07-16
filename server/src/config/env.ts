import 'dotenv/config';
import { z } from 'zod';

const developmentJwtSecret = 'development-only-replace-before-shared-use-32';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('mysql://nearby_shop:nearby_shop_dev@127.0.0.1:3306/nearby_shop'),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(32).default(developmentJwtSecret),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_MCH_ID: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET === developmentJwtSecret) {
  throw new Error('JWT_SECRET must be explicitly configured in production.');
}

export const env = Object.freeze(parsed);
