import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from '@csms/persistence';

export interface PoolFaults {
  /** Every connection attempt fails like an unreachable database. */
  connectFails: boolean;
  /** Statements run, but COMMIT fails (the transaction is rolled back). */
  commitFails: boolean;
}

/** Wraps a real pool and injects database faults on demand. */
export function faultyPool(real: Pool): { pool: Pool; faults: PoolFaults } {
  const faults: PoolFaults = { connectFails: false, commitFails: false };
  const down = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  const pool = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'connect') {
        return async () => {
          if (faults.connectFails) throw down();
          const client = await target.connect();
          const query = client.query.bind(client) as (...a: unknown[]) => Promise<unknown>;
          client.query = (async (...args: unknown[]) => {
            if (faults.commitFails && args[0] === 'COMMIT') {
              await query('ROLLBACK');
              throw new Error('Failed to commit');
            }
            return query(...args);
          }) as typeof client.query;
          return client;
        };
      }
      if (prop === 'query') {
        return async (...args: unknown[]) => {
          if (faults.connectFails) throw down();
          return (target.query as (...a: unknown[]) => Promise<unknown>)(...args);
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
  return { pool, faults };
}

/**
 * A forwarding HTTP proxy that delays the response of /internal/ocpp/boot AFTER Control
 * has handled it. This reproduces "commit succeeded, response lost/late".
 */
export async function delayingProxy(targetUrl: string): Promise<{ url: string; setDelayMs(n: number): void; close(): Promise<void> }> {
  let delayMs = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        const upstream = await fetch(targetUrl + (req.url ?? ''), {
          method: req.method ?? 'GET',
          headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
          ...(req.method === 'POST' && { body: Buffer.concat(chunks) }),
        });
        const body = await upstream.text();
        if (req.url === '/internal/ocpp/boot' && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        res.writeHead(upstream.status, { 'content-type': 'application/json' }).end(body);
      })();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setDelayMs: (n) => void (delayMs = n),
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
