import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const keep = process.argv.includes('--keep');
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const project = `nearby-shop-rehearsal-${suffix}`;
const temporaryDirectory = join(root, 'tmp', 'release-rehearsal', suffix);
const environmentFile = join(temporaryDirectory, 'release.env');

function randomSecret(bytes = 24) {
  return randomBytes(bytes).toString('hex');
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a local release rehearsal port.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function compose(arguments_, options = {}) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      environmentFile,
      '-f',
      'compose.release.yaml',
      '-p',
      project,
      ...arguments_,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: options.capture ? 'pipe' : 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`docker compose ${arguments_.join(' ')} failed with status ${result.status}.`);
  }
  return result.stdout?.trim() ?? '';
}

async function waitFor(url, description, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      const body = await response.text();
      if (response.ok) return body;
      lastError = `HTTP ${response.status}: ${body.slice(0, 160)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${description} did not become ready: ${lastError}`);
}

let started = false;
try {
  const httpPort = await availablePort();
  let apiPort = await availablePort();
  while (apiPort === httpPort) apiPort = await availablePort();
  mkdirSync(temporaryDirectory, { recursive: true });
  writeFileSync(
    environmentFile,
    [
      'MYSQL_DATABASE=nearby_shop',
      'MYSQL_USER=release_user',
      `MYSQL_PASSWORD=${randomSecret()}`,
      `MYSQL_ROOT_PASSWORD=${randomSecret()}`,
      `REDIS_PASSWORD=${randomSecret()}`,
      `JWT_SECRET=${randomSecret(32)}`,
      `RELEASE_HTTP_PORT=${httpPort}`,
      `RELEASE_API_PORT=${apiPort}`,
      `CORS_ALLOWED_ORIGINS=http://127.0.0.1:${httpPort}`,
      'ADMIN_API_BASE_URL=/api/v1',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  chmodSync(environmentFile, 0o600);

  console.log('1/5 Building production images...');
  compose(['build']);
  console.log('2/5 Starting isolated dependencies, migration, API and admin web...');
  started = true;
  compose(['up', '-d']);

  const adminBaseUrl = `http://127.0.0.1:${httpPort}`;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const readiness = JSON.parse(await waitFor(`${apiBaseUrl}/api/v1/ready`, 'API readiness'));
  if (
    readiness.data?.dependencies?.database !== 'ready' ||
    readiness.data?.dependencies?.redis !== 'ready'
  ) {
    throw new Error('Readiness response did not confirm both MySQL and Redis.');
  }
  await waitFor(`${adminBaseUrl}/api/v1/health`, 'admin same-origin API proxy');
  const adminHtml = await waitFor(`${adminBaseUrl}/`, 'admin web');
  if (!adminHtml.includes('近邻小铺子管理后台')) throw new Error('Admin SPA title was not found.');

  console.log('3/5 Verifying authentication boundary and runtime image contents...');
  const unauthorized = await fetch(`${apiBaseUrl}/api/v1/admin/operations/dashboard`);
  const unauthorizedBody = await unauthorized.json();
  if (unauthorized.status !== 401 || unauthorizedBody.code !== 'UNAUTHORIZED') {
    throw new Error('Unauthenticated admin route did not return the stable 401 contract.');
  }
  compose(['exec', '-T', 'server', 'sh', '-c', 'test ! -x /app/server/node_modules/.bin/prisma']);

  const serverContainer = compose(['ps', '-q', 'server'], { capture: true });
  const adminContainer = compose(['ps', '-q', 'admin-web'], { capture: true });
  const inspect = spawnSync(
    'docker',
    [
      'inspect',
      '--format',
      '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}',
      serverContainer,
      adminContainer,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (inspect.status !== 0) throw new Error('Unable to inspect release container privileges.');
  const privilegeLines = inspect.stdout.trim().split('\n');
  if (!privilegeLines.every((line) => /^(?:node|101)\|true$/.test(line))) {
    throw new Error(`Unexpected container privilege settings: ${privilegeLines.join(', ')}`);
  }

  console.log('4/5 Restarting API container and waiting for dependency readiness...');
  compose(['restart', 'server']);
  await waitFor(`${apiBaseUrl}/api/v1/ready`, 'API readiness after restart');

  console.log(
    '5/5 Release rehearsal passed: migration, cold start, boundaries and restart are healthy.',
  );
  console.log(`Local rehearsal API endpoint: ${apiBaseUrl}`);
  console.log(`Local rehearsal admin endpoint: ${adminBaseUrl}`);
} catch (error) {
  if (started) {
    console.error('Release rehearsal failed; recent container logs follow.');
    compose(['logs', '--tail', '120'], { allowFailure: true });
  }
  throw error;
} finally {
  if (started && !keep) compose(['down', '--volumes', '--remove-orphans'], { allowFailure: true });
  if (!keep) rmSync(temporaryDirectory, { recursive: true, force: true });
  if (keep) console.log(`Rehearsal kept for inspection. Environment file: ${environmentFile}`);
}
