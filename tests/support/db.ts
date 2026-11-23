import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPool, migrate, type Pool } from '@csms/persistence';

const ADMIN_URL = process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://csms:csms@localhost:5433/postgres';

export interface TestDatabase {
  url: string;
  pool: Pool;
  drop(): Promise<void>;
}

/** Creates an isolated, fully migrated database. Fails loudly (does not skip) if PostgreSQL is unreachable. */
export async function createTestDatabase(opts: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const name = `csms_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Test PostgreSQL unreachable at ${ADMIN_URL}. Run "npm run db:up".`, { cause: err });
  }
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString(), 5);
  if (opts.migrate !== false) await migrate(pool);
  return {
    url: url.toString(),
    pool,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
