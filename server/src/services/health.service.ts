export interface HealthSnapshot {
  service: 'nearby-shop-server';
  status: 'ok';
  timestamp: string;
  version: string;
}

export function getHealthSnapshot(): HealthSnapshot {
  return {
    service: 'nearby-shop-server',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  };
}
