import { DEFAULT_STATION_POLICY, type StationPolicy } from '@csms/domain-stations';

export interface ControlConfig {
  port: number;
  databaseUrl: string;
  internalApiToken: string;
  operatorApiToken: string;
  policy: StationPolicy;
  dbPoolMax: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required environment variable ${key}`);
  return v;
}

function intFrom(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${key} must be a positive integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ControlConfig {
  const internalApiToken = required(env, 'INTERNAL_API_TOKEN');
  const operatorApiToken = required(env, 'OPERATOR_API_TOKEN');
  if (internalApiToken === operatorApiToken) {
    throw new Error('INTERNAL_API_TOKEN and OPERATOR_API_TOKEN must differ');
  }
  return {
    port: intFrom(env, 'PORT', 8080),
    databaseUrl: required(env, 'DATABASE_URL'),
    internalApiToken,
    operatorApiToken,
    dbPoolMax: intFrom(env, 'DB_POOL_MAX', 10),
    policy: {
      heartbeatIntervalSeconds: intFrom(env, 'HEARTBEAT_INTERVAL_SECONDS', DEFAULT_STATION_POLICY.heartbeatIntervalSeconds),
      retryIntervalSeconds: intFrom(env, 'BOOT_RETRY_INTERVAL_SECONDS', DEFAULT_STATION_POLICY.retryIntervalSeconds),
    },
  };
}
