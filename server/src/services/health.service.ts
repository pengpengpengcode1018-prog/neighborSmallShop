import { prisma } from '../config/database.js';
import { createRedisClient } from '../config/redis.js';

export interface HealthSnapshot {
  service: 'nearby-shop-server';
  status: 'ok';
  timestamp: string;
  version: string;
}

type DependencyStatus = 'ready' | 'unavailable';

export interface ReadinessSnapshot {
  service: 'nearby-shop-server';
  status: 'ready' | 'unavailable';
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  timestamp: string;
}

export interface ReadinessProbes {
  database: () => Promise<void>;
  redis: () => Promise<void>;
}

const readinessTimeoutMilliseconds = 2_000;

export function getHealthSnapshot(): HealthSnapshot {
  return {
    service: 'nearby-shop-server',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  };
}

async function withTimeout(probe: () => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('readiness probe timed out')),
      readinessTimeoutMilliseconds,
    );
  });

  try {
    await Promise.race([probe(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

async function probeRedis(): Promise<void> {
  const redis = createRedisClient();
  redis.on('error', () => undefined);

  try {
    await redis.connect();
    const response = await redis.ping();
    if (response !== 'PONG') throw new Error('unexpected Redis PING response');
  } finally {
    redis.disconnect();
  }
}

const defaultReadinessProbes: ReadinessProbes = {
  database: probeDatabase,
  redis: probeRedis,
};

export async function getReadinessSnapshot(
  probes: ReadinessProbes = defaultReadinessProbes,
): Promise<ReadinessSnapshot> {
  const [database, redis] = await Promise.allSettled([
    withTimeout(probes.database),
    withTimeout(probes.redis),
  ]);
  const dependencies = {
    database: database.status === 'fulfilled' ? 'ready' : 'unavailable',
    redis: redis.status === 'fulfilled' ? 'ready' : 'unavailable',
  } as const;
  const ready = dependencies.database === 'ready' && dependencies.redis === 'ready';

  return {
    service: 'nearby-shop-server',
    status: ready ? 'ready' : 'unavailable',
    dependencies,
    timestamp: new Date().toISOString(),
  };
}
