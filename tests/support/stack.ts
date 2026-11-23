import type { AddressInfo } from 'node:net';
import { buildApp } from '@csms/charging-control';
import type { Pool } from '@csms/persistence';
import { createLogger } from '@csms/observability';
import { GatewayServer, HttpControlClient, type GatewayConfig } from '@csms/ocpp-gateway';
import type { FastifyInstance } from 'fastify';

export const INTERNAL_TOKEN = 'test-internal-token';
export const OPERATOR_TOKEN = 'test-operator-token';
const logger = createLogger('test', process.env['TEST_LOG_LEVEL'] ?? 'silent');

export function gatewayConfig(over: Partial<GatewayConfig> & { controlBaseUrl: string }): GatewayConfig {
  return {
    port: 0,
    internalApiToken: INTERNAL_TOKEN,
    authTimeoutMs: 2_000,
    bootTimeoutMs: 2_000,
    requireForwardedHttps: false,
    maxPayloadBytes: 64 * 1024,
    maxQueuedCalls: 8,
    pingIntervalMs: 60_000,
    drainTimeoutMs: 1_000,
    ...over,
  };
}

export async function startControl(pool: Pool): Promise<{ app: FastifyInstance; url: string }> {
  const app = buildApp({
    pool,
    logger,
    config: {
      internalApiToken: INTERNAL_TOKEN,
      operatorApiToken: OPERATOR_TOKEN,
      policy: { heartbeatIntervalSeconds: 300, retryIntervalSeconds: 60 },
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, url: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

export async function startGateway(controlBaseUrl: string, over: Partial<GatewayConfig> = {}) {
  const config = gatewayConfig({ controlBaseUrl, ...over });
  const control = new HttpControlClient(controlBaseUrl, INTERNAL_TOKEN, {
    authMs: config.authTimeoutMs,
    bootMs: config.bootTimeoutMs,
  });
  const server = new GatewayServer(config, control, logger);
  const port = await server.start();
  return { server, port };
}

export function operator(controlUrl: string) {
  const call = (method: string, path: string, body?: unknown, token = OPERATOR_TOKEN) =>
    fetch(controlUrl + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  return {
    call,
    async createStation(stationId: string, registrationStatus?: string) {
      const res = await call('POST', '/api/v1/stations', { stationId, ...(registrationStatus && { registrationStatus }) });
      if (res.status !== 201) throw new Error(`createStation failed: ${res.status}`);
      return (await res.json()) as { stationId: string; password: string };
    },
    async getStation(stationId: string) {
      return (await (await call('GET', `/api/v1/stations/${stationId}`)).json()) as Record<string, unknown>;
    },
  };
}

export const BOOT_PAYLOAD = { chargePointVendor: 'ACME', chargePointModel: 'Z1', firmwareVersion: '1.2.3' };
