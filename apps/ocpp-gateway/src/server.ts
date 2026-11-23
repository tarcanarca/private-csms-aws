import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { StationIdSchema } from '@csms/contracts';
import type { Logger } from '@csms/observability';
import { SUBPROTOCOL_16, ErrorCode, serializeCallError } from '@csms/ocpp-1.6';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { GatewayConfig } from './config.js';
import { ControlUnavailableError, type ControlPort } from './control-client.js';
import { Ocpp16Session } from './session.js';

const CLOSE_SUPERSEDED = 4000;

function reject(socket: Duplex, status: number, reason: string, headers: Record<string, string> = {}): void {
  const lines = [`HTTP/1.1 ${status} ${reason}`, 'Connection: close', 'Content-Length: 0'];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  socket.end(lines.join('\r\n') + '\r\n\r\n');
}

function parseBasic(header: string | undefined): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i < 0 ? null : { user: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

export class GatewayServer {
  private readonly http: http.Server;
  private readonly wss: WebSocketServer;
  private readonly sockets = new Map<string, WebSocket>();
  private draining = false;
  private pingTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: GatewayConfig,
    private readonly control: ControlPort,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.maxPayloadBytes,
      handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL_16) ? SUBPROTOCOL_16 : false),
    });
    this.http = http.createServer((req, res) => {
      if (req.url === '/healthz') return void res.writeHead(200).end('ok');
      if (req.url === '/readyz') return void res.writeHead(this.draining ? 503 : 200).end(this.draining ? 'draining' : 'ready');
      res.writeHead(404).end();
    });
    this.http.on('upgrade', (req, socket, head) => {
      this.onUpgrade(req, socket, head).catch((err: unknown) => {
        this.logger.error({ err }, 'upgrade failed');
        if (!socket.destroyed) reject(socket, 500, 'Internal Server Error');
      });
    });
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve) => this.http.listen(this.config.port, '0.0.0.0', resolve));
    this.pingTimer = setInterval(() => this.pingAll(), this.config.pingIntervalMs);
    this.pingTimer.unref();
    return (this.http.address() as { port: number }).port;
  }

  /** Graceful drain: fail readiness, refuse new upgrades, tell stations to reconnect, then stop. */
  async stop(): Promise<void> {
    this.draining = true;
    clearInterval(this.pingTimer);
    const closing = [...this.sockets.values()].map(
      (ws) =>
        new Promise<void>((resolve) => {
          ws.once('close', () => resolve());
          ws.close(1001, 'Gateway draining'); // "going away": station reconnects (through the ALB, to another task)
        }),
    );
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, this.config.drainTimeoutMs).unref());
    await Promise.race([Promise.all(closing), timeout]);
    for (const ws of this.sockets.values()) ws.terminate();
    this.http.closeAllConnections();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  private async onUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (this.draining) return reject(socket, 503, 'Service Unavailable');

    const match = /^\/ocpp\/([^/?]+)\/?(?:\?.*)?$/.exec(req.url ?? '');
    const idParse = StationIdSchema.safeParse(match?.[1] ? safeDecode(match[1]) : '');
    if (!idParse.success) return reject(socket, 404, 'Not Found');
    const stationId = idParse.data;

    const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim());
    if (!offered.includes(SUBPROTOCOL_16)) {
      this.logger.info({ stationId, offered }, 'rejecting handshake: no supported OCPP subprotocol');
      return reject(socket, 400, 'Bad Request');
    }
    if (this.config.requireForwardedHttps && req.headers['x-forwarded-proto'] !== 'https') {
      return reject(socket, 403, 'Forbidden');
    }

    const creds = parseBasic(req.headers.authorization);
    const challenge = { 'WWW-Authenticate': 'Basic realm="ocpp"' };
    if (!creds || creds.user !== stationId) return reject(socket, 401, 'Unauthorized', challenge);

    let ok: boolean;
    try {
      ok = await this.control.authenticate(stationId, creds.password);
    } catch (err) {
      if (!(err instanceof ControlUnavailableError)) throw err;
      this.logger.warn({ stationId, err: err.message }, 'handshake auth unavailable');
      return reject(socket, 503, 'Service Unavailable', { 'Retry-After': '30' });
    }
    if (!ok) {
      this.logger.info({ stationId }, 'handshake auth failed');
      return reject(socket, 401, 'Unauthorized', challenge);
    }
    if (socket.destroyed || this.draining) {
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, stationId));
  }

  private onConnection(ws: WebSocket, stationId: string): void {
    const connectionId = randomUUID();
    const log = this.logger.child({ stationId, connectionId });

    // Newest connection wins on this instance. Cross-instance fencing is Phase 4 (Redis lease + epoch).
    const previous = this.sockets.get(stationId);
    this.sockets.set(stationId, ws);
    previous?.close(CLOSE_SUPERSEDED, 'Superseded by a newer connection');
    log.info('station connected');

    const session = new Ocpp16Session({ stationId, connectionId, control: this.control, logger: log, clock: this.clock });
    // The protocol allows one in-flight CALL; serialize defensively and bound the backlog.
    let chain: Promise<void> = Promise.resolve();
    let queued = 0;
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => ((ws as WebSocket & { isAlive?: boolean }).isAlive = true));

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) return ws.close(1003, 'Binary frames are not supported');
      if (queued >= this.config.maxQueuedCalls) return ws.close(1008, 'Too many outstanding messages');
      queued++;
      const raw = rawToString(data);
      chain = chain
        .then(async () => {
          const reply = await session.handleMessage(raw);
          if (reply !== null && ws.readyState === ws.OPEN) ws.send(reply);
        })
        .catch((err: unknown) => {
          log.error({ err }, 'session failure');
          if (ws.readyState === ws.OPEN) ws.send(serializeCallError(null, ErrorCode.InternalError, 'Internal error'));
        })
        .finally(() => void queued--);
    });
    ws.on('error', (err) => log.warn({ err: err.message }, 'socket error'));
    ws.on('close', (code) => {
      if (this.sockets.get(stationId) === ws) this.sockets.delete(stationId);
      log.info({ code }, 'station disconnected');
    });
  }

  private pingAll(): void {
    for (const ws of this.sockets.values()) {
      const s = ws as WebSocket & { isAlive?: boolean };
      if (s.isAlive === false) {
        ws.terminate();
        continue;
      }
      s.isAlive = false;
      ws.ping();
    }
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
