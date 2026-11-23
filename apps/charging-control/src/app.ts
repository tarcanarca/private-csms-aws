import { createHash, timingSafeEqual } from 'node:crypto';
import {
  AuthenticateStationRequestSchema,
  BootRequestSchema,
  CreateStationRequestSchema,
  StationIdSchema,
} from '@csms/contracts';
import type { Logger } from '@csms/observability';
import { StationAlreadyExistsError, type Pool } from '@csms/persistence';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import type { ControlConfig } from './config.js';
import { StationService } from './station-service.js';

function tokenMatches(header: string | undefined, expected: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const DEPENDENCY_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']);
function isDependencyFailure(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = e.code ?? '';
  return (
    DEPENDENCY_CODES.has(code) ||
    /^(08|53|57)/.test(code) ||
    /timeout exceeded when trying to connect|Connection terminated|Failed to commit/i.test(e.message ?? '')
  );
}

export function buildApp(deps: {
  pool: Pool;
  config: Pick<ControlConfig, 'internalApiToken' | 'operatorApiToken' | 'policy'>;
  logger: Logger;
  clock?: () => Date;
}): FastifyInstance {
  const { pool, config, logger } = deps;
  const service = new StationService(pool, config.policy, deps.clock);
  const app = Fastify({ loggerInstance: logger as unknown as FastifyBaseLogger, bodyLimit: 64 * 1024 });

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const expected = path.startsWith('/internal/')
      ? config.internalApiToken
      : path.startsWith('/api/')
        ? config.operatorApiToken
        : null;
    if (expected !== null && !tokenMatches(req.headers.authorization, expected)) {
      await reply.code(401).send({ error: { code: 'unauthorized', message: 'Missing or invalid bearer token' } });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'invalid_request', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
    }
    if (err instanceof StationAlreadyExistsError) {
      return reply.code(409).send({ error: { code: 'station_exists', message: err.message } });
    }
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error({ err }, 'request failed');
    if (isDependencyFailure(err)) {
      return reply.code(503).send({ error: { code: 'dependency_unavailable', message: 'Database unavailable' } });
    }
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Internal error' } });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  // ----- Internal API (Gateway) -----
  app.post('/internal/stations/authenticate', async (req) => {
    const body = AuthenticateStationRequestSchema.parse(req.body);
    return { authenticated: await service.authenticate(body.stationId, body.password) };
  });

  app.post('/internal/ocpp/boot', async (req) => {
    const body = BootRequestSchema.parse(req.body);
    return service.boot(body);
  });

  // ----- Operator API -----
  app.post('/api/v1/stations', async (req, reply) => {
    const body = CreateStationRequestSchema.parse(req.body);
    const { station, password } = await service.createStation(body);
    // The password is shown exactly once; only its hash is stored.
    return reply.code(201).send({ ...station, password });
  });

  app.get('/api/v1/stations/:stationId', async (req, reply) => {
    const { stationId } = z.object({ stationId: StationIdSchema }).parse(req.params);
    const station = await service.getStation(stationId);
    if (!station) return reply.code(404).send({ error: { code: 'not_found', message: 'Station not found' } });
    return station;
  });

  app.get('/api/v1/stations', async (req) => {
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50), after: StationIdSchema.optional() })
      .parse(req.query);
    return { items: await service.list(q.limit, q.after) };
  });

  return app;
}
