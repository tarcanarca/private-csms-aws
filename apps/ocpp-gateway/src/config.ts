export interface GatewayConfig {
  port: number;
  controlBaseUrl: string;
  internalApiToken: string;
  authTimeoutMs: number;
  bootTimeoutMs: number;
  /** Basic-auth credentials are only accepted when the ALB reports X-Forwarded-Proto: https. */
  requireForwardedHttps: boolean;
  maxPayloadBytes: number;
  maxQueuedCalls: number;
  pingIntervalMs: number;
  drainTimeoutMs: number;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${key} must be a positive integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const controlBaseUrl = env['CONTROL_BASE_URL'];
  const internalApiToken = env['INTERNAL_API_TOKEN'];
  if (!controlBaseUrl) throw new Error('Missing required environment variable CONTROL_BASE_URL');
  if (!internalApiToken) throw new Error('Missing required environment variable INTERNAL_API_TOKEN');
  return {
    port: int(env, 'PORT', 9000),
    controlBaseUrl,
    internalApiToken,
    authTimeoutMs: int(env, 'AUTH_TIMEOUT_MS', 3_000),
    bootTimeoutMs: int(env, 'BOOT_TIMEOUT_MS', 5_000),
    requireForwardedHttps: env['REQUIRE_FORWARDED_HTTPS'] === 'true',
    maxPayloadBytes: int(env, 'MAX_PAYLOAD_BYTES', 64 * 1024),
    maxQueuedCalls: int(env, 'MAX_QUEUED_CALLS', 8),
    pingIntervalMs: int(env, 'PING_INTERVAL_MS', 30_000),
    drainTimeoutMs: int(env, 'DRAIN_TIMEOUT_MS', 10_000),
  };
}
