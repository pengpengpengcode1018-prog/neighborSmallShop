import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

export const databaseConfig = Object.freeze({
  url: env.DATABASE_URL,
});

function createPrismaClient(): PrismaClient {
  const databaseUrl = new URL(databaseConfig.url);
  const adapter = new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
    connectionLimit: env.NODE_ENV === 'test' ? 2 : 10,
  });

  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();
