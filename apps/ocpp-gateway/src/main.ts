import { createLogger } from '@csms/observability';
import { loadConfig } from './config.js';
import { HttpControlClient } from './control-client.js';
import { GatewayServer } from './server.js';

const logger = createLogger('ocpp-gateway');
const config = loadConfig();
const control = new HttpControlClient(config.controlBaseUrl, config.internalApiToken, {
  authMs: config.authTimeoutMs,
  bootMs: config.bootTimeoutMs,
});
const server = new GatewayServer(config, control, logger);
const port = await server.start();
logger.info({ port }, 'gateway listening');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'draining');
  await server.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
