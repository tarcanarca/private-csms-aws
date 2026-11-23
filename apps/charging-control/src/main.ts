import { createLogger } from '@csms/observability';
import { createPool } from '@csms/persistence';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const logger = createLogger('charging-control');
const config = loadConfig();
const pool = createPool(config.databaseUrl, config.dbPoolMax);
const app = buildApp({ pool, config, logger });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
