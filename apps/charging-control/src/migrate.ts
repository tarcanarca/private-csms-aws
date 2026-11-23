/** One-off migration entrypoint (run as a separate ECS task / CI step, not on service start). */
import { createLogger } from '@csms/observability';
import { createPool, migrate } from '@csms/persistence';

const logger = createLogger('charging-control-migrate');
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is required');
const pool = createPool(url, 2);
try {
  const result = await migrate(pool);
  logger.info(result, 'migrations complete');
} finally {
  await pool.end();
}
