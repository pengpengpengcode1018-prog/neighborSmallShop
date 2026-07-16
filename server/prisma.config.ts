import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const localDatabaseUrl = 'mysql://nearby_shop:nearby_shop_dev@127.0.0.1:3306/nearby_shop';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
