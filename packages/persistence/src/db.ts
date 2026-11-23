import pg from 'pg';

export type Pool = pg.Pool;
export type Queryable = Pick<pg.PoolClient, 'query'>;

export function createPool(connectionString: string, max = 10): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
    idle_in_transaction_session_timeout: 10_000,
  });
  // An idle client error must not crash the process; the pool discards the client.
  pool.on('error', () => undefined);
  return pool;
}

/**
 * Run `fn` in one transaction. The returned promise resolves only after COMMIT
 * succeeded, which is the durability boundary callers rely on before acknowledging.
 */
export async function withTransaction<T>(
  pool: Pick<pg.Pool, 'connect'>,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true; // connection is in an unknown state; do not reuse it
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
