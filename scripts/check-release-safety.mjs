import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excludedDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules', 'tmp']);
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.scss',
  '.sh',
  '.ts',
  '.vue',
  '.yaml',
  '.yml',
]);

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    const relativePath = relative(root, path);
    if (excludedDirectories.has(name) || relativePath === 'docs/references') return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const forbiddenTrackedFiles = trackedFiles.filter((path) => {
  const name = path.split('/').at(-1) ?? '';
  return (
    name === '.env' ||
    (name.startsWith('.env.') && name !== '.env.example') ||
    /\.(?:key|pem|p12|pfx)$/i.test(name)
  );
});
assert(
  forbiddenTrackedFiles.length === 0,
  `Tracked secret-bearing files are forbidden: ${forbiddenTrackedFiles.join(', ')}`,
);

const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const leakedKeyFiles = filesUnder(root).filter((path) => {
  const name = path.split('/').at(-1) ?? '';
  if (!textExtensions.has(extname(path)) && !name.endsWith('Dockerfile')) return false;
  return privateKeyPattern.test(readFileSync(path, 'utf8'));
});
assert(
  leakedKeyFiles.length === 0,
  `Private key material found outside ignored secret files: ${leakedKeyFiles
    .map((path) => relative(root, path))
    .join(', ')}`,
);

const requiredFiles = [
  '.dockerignore',
  'compose.release.yaml',
  'compose.production.yaml',
  'admin-web/Dockerfile',
  'admin-web/package-lock.json',
  'admin-web/nginx.conf',
  'docs/RELEASE_CHECKLIST.md',
  'docs/PRODUCTION_DEPLOYMENT.md',
  'deploy/compose.admin-seed.yaml',
  'deploy/production.env.example',
  'server/Dockerfile',
  'server/runtime/package-lock.json',
];
for (const path of requiredFiles) {
  assert(existsSync(join(root, path)), `Missing release file: ${path}`);
}

const serverDockerfile = readFileSync(join(root, 'server/Dockerfile'), 'utf8');
const adminDockerfile = readFileSync(join(root, 'admin-web/Dockerfile'), 'utf8');
const adminNginx = readFileSync(join(root, 'admin-web/nginx.conf'), 'utf8');
const releaseCompose = readFileSync(join(root, 'compose.release.yaml'), 'utf8');
const productionCompose = readFileSync(join(root, 'compose.production.yaml'), 'utf8');
const adminSeedCompose = readFileSync(join(root, 'deploy/compose.admin-seed.yaml'), 'utf8');
const serverManifest = JSON.parse(readFileSync(join(root, 'server/package.json'), 'utf8'));
const runtimeManifest = JSON.parse(readFileSync(join(root, 'server/runtime/package.json'), 'utf8'));
const runtimeLock = JSON.parse(
  readFileSync(join(root, 'server/runtime/package-lock.json'), 'utf8'),
);
const adminManifest = JSON.parse(readFileSync(join(root, 'admin-web/package.json'), 'utf8'));
const adminLock = JSON.parse(readFileSync(join(root, 'admin-web/package-lock.json'), 'utf8'));
assert(
  JSON.stringify(serverManifest.dependencies) === JSON.stringify(runtimeManifest.dependencies),
  'server/runtime/package.json dependencies must exactly match server/package.json.',
);
assert(
  JSON.stringify(runtimeManifest.dependencies) ===
    JSON.stringify(runtimeLock.packages[''].dependencies),
  'server/runtime/package-lock.json is stale; run npm run runtime:lock.',
);
assert(
  JSON.stringify(adminManifest.dependencies) ===
    JSON.stringify(adminLock.packages[''].dependencies) &&
    JSON.stringify(adminManifest.devDependencies) ===
      JSON.stringify(adminLock.packages[''].devDependencies),
  'admin-web/package-lock.json is stale; run npm run admin:lock.',
);
assert(
  serverDockerfile.includes('COPY server/runtime/package.json server/runtime/package-lock.json') &&
    serverDockerfile.includes('npm ci --audit=false --fetch-retries=5') &&
    serverDockerfile.includes('--omit=peer --prefix server'),
  'Server runtime must install only from the isolated production lock.',
);
assert(
  serverDockerfile.includes('USER node'),
  'Server runtime must use the unprivileged node user.',
);
assert(adminDockerfile.includes('USER 101'), 'Admin runtime must use an unprivileged user.');
assert(
  adminDockerfile.includes('COPY admin-web/package.json admin-web/package-lock.json'),
  'Admin build must install from its isolated lock.',
);
assert(
  adminDockerfile.includes('https://api.surroundsmallshops.com/api/v1') &&
    adminNginx.includes("connect-src 'self' https://api.surroundsmallshops.com"),
  'Admin production build and CSP must target the dedicated API domain.',
);
for (const fragment of ['read_only: true', 'no-new-privileges:true', 'service_healthy']) {
  assert(releaseCompose.includes(fragment), `Release Compose must contain: ${fragment}`);
}
for (const fragment of [
  '127.0.0.1:${RELEASE_API_PORT:-3100}:3000',
  '127.0.0.1:${RELEASE_HTTP_PORT:-8080}:8080',
  'CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-https://www.surroundsmallshops.com}',
]) {
  assert(releaseCompose.includes(fragment), `Release domain boundary must contain: ${fragment}`);
}
const serverService = releaseCompose.slice(
  releaseCompose.indexOf('  server:'),
  releaseCompose.indexOf('  admin-web:'),
);
assert(
  serverService.includes('      - frontend') && serverService.includes('      - backend'),
  'Server must join the frontend network for loopback publishing/WeChat egress and backend for data.',
);
assert(
  !/^  mysql:/m.test(productionCompose),
  'Production Compose must use external RDS, not MySQL.',
);
for (const fragment of [
  'DATABASE_URL: ${MIGRATION_DATABASE_URL:?RDS migration DATABASE_URL is required}',
  'DATABASE_URL: ${DATABASE_URL:?RDS DATABASE_URL is required}',
  'redis-server --appendonly yes --appendfsync everysec',
  '--requirepass "$$REDIS_PASSWORD"',
  '--maxmemory 256mb --maxmemory-policy noeviction',
  '127.0.0.1:${PRODUCTION_API_PORT:-3100}:3000',
  '127.0.0.1:${PRODUCTION_HTTP_PORT:-8080}:8080',
]) {
  assert(
    productionCompose.includes(fragment),
    `Production RDS/Redis topology must contain: ${fragment}`,
  );
}
const productionRedisService = productionCompose.slice(
  productionCompose.indexOf('  redis:'),
  productionCompose.indexOf('  migrate:'),
);
assert(
  !productionRedisService.includes('    ports:') &&
    productionRedisService.includes('    user: redis'),
  'Production Redis must run as its image user and never publish a host port.',
);
const productionMigrateService = productionCompose.slice(
  productionCompose.indexOf('  migrate:'),
  productionCompose.indexOf('  server:'),
);
assert(
  productionMigrateService.includes(
    'DATABASE_URL: ${MIGRATION_DATABASE_URL:?RDS migration DATABASE_URL is required}',
  ) &&
    !productionMigrateService.includes('WECHAT_APP_SECRET') &&
    !productionMigrateService.includes('REDIS_URL'),
  'The one-shot migration container must receive only its dedicated RDS credential.',
);
const productionServerService = productionCompose.slice(
  productionCompose.indexOf('  server:'),
  productionCompose.indexOf('  admin-web:'),
);
assert(
  !productionServerService.includes('MIGRATION_DATABASE_URL'),
  'The API runtime must never receive the migration credential.',
);
assert(
  adminSeedCompose.includes(
    'DATABASE_URL=${DATABASE_URL:?RDS application DATABASE_URL is required}',
  ) &&
    adminSeedCompose.includes('- ADMIN_SEED_PASSWORD') &&
    !adminSeedCompose.includes('MIGRATION_DATABASE_URL'),
  'Admin seeding must use the DML application credential and receive its password at runtime.',
);

const composeEnvironment = {
  ...process.env,
  MYSQL_DATABASE: 'nearby_shop',
  MYSQL_USER: 'release_user',
  MYSQL_PASSWORD: 'static-compose-check-password',
  MYSQL_ROOT_PASSWORD: 'static-compose-check-root-password',
  REDIS_PASSWORD: 'static-compose-check-redis-password',
  JWT_SECRET: '15af4e3fe3eb4ecf9790c2073ca3e67945de348ab23ff516e',
};
execFileSync('docker', ['compose', '-f', 'compose.release.yaml', 'config', '--quiet'], {
  cwd: root,
  env: composeEnvironment,
  stdio: 'pipe',
});
execFileSync('docker', ['compose', '-f', 'compose.production.yaml', 'config', '--quiet'], {
  cwd: root,
  env: {
    ...composeEnvironment,
    MIGRATION_DATABASE_URL:
      'mysql://nearby_shop_migrator:static-password@rds-internal.example:3306/nearby_shop',
    DATABASE_URL: 'mysql://nearby_shop_app:static-password@rds-internal.example:3306/nearby_shop',
    REDIS_PASSWORD: 'static-production-redis-password',
    WECHAT_APP_ID: 'wx-static-production-app',
    WECHAT_APP_SECRET: 'static-production-app-secret',
  },
  stdio: 'pipe',
});
execFileSync(
  'docker',
  [
    'compose',
    '-f',
    'compose.production.yaml',
    '-f',
    'deploy/compose.admin-seed.yaml',
    'config',
    '--quiet',
  ],
  {
    cwd: root,
    env: {
      ...composeEnvironment,
      MIGRATION_DATABASE_URL:
        'mysql://nearby_shop_migrator:static-password@rds-internal.example:3306/nearby_shop',
      DATABASE_URL: 'mysql://nearby_shop_app:static-password@rds-internal.example:3306/nearby_shop',
      REDIS_PASSWORD: 'static-production-redis-password',
      WECHAT_APP_ID: 'wx-static-production-app',
      WECHAT_APP_SECRET: 'static-production-app-secret',
      ADMIN_SEED_USERNAME: 'static-admin',
      ADMIN_SEED_DISPLAY_NAME: 'Static Admin',
      ADMIN_SEED_PASSWORD: 'static-admin-password',
    },
    stdio: 'pipe',
  },
);

console.log(
  'Release safety checks passed: secret files, production images and release Compose are structurally valid.',
);
console.log('Production remains NO-GO until the manual items in docs/RELEASE_CHECKLIST.md pass.');
