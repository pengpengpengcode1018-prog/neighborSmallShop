import { env } from './env.js';

export const databaseConfig = Object.freeze({
  url: env.DATABASE_URL,
});
