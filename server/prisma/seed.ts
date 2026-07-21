import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? 'mysql://nearby_shop:nearby_shop_dev@127.0.0.1:3306/nearby_shop',
);
const username = process.env.ADMIN_SEED_USERNAME?.trim() || 'admin';
const displayName = process.env.ADMIN_SEED_DISPLAY_NAME?.trim() || '开发管理员';
const password = process.env.ADMIN_SEED_PASSWORD;

if (!password || password.length < 12) {
  throw new Error('ADMIN_SEED_PASSWORD must be explicitly set to at least 12 characters.');
}

const adapter = new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.slice(1),
  connectionLimit: 2,
});
const prisma = new PrismaClient({ adapter });

try {
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.admin.upsert({
    where: { username },
    update: { displayName, passwordHash, status: 'ACTIVE' },
    create: { username, displayName, passwordHash },
  });

  process.stdout.write(`Development admin seed is ready for username "${username}".\n`);
} finally {
  await prisma.$disconnect();
}
