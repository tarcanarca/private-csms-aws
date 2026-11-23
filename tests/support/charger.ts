import WebSocket from 'ws';

export type Frame = unknown[];

/** Minimal charge-point harness. Lives under tests/ only; it is never part of a deployable. */
export class TestCharger {
  private readonly waiting: Array<(f: Frame) => void> = [];
  private readonly received: Frame[] = [];
  readonly closed: Promise<{ code: number }>;
  private nextId = 1;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      const frame = JSON.parse(d.toString()) as Frame;
      const w = this.waiting.shift();
      if (w) w(frame);
      else this.received.push(frame);
    });
    this.closed = new Promise((resolve) => ws.on('close', (code) => resolve({ code })));
  }

  static basic(user: string, password: string): string {
    return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  }

  static async connect(
    port: number,
    stationId: string,
    password: string,
    opts: { protocols?: string[]; user?: string; path?: string } = {},
  ): Promise<TestCharger> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${opts.path ?? `/ocpp/${stationId}`}`, opts.protocols ?? ['ocpp1.6'], {
      headers: { Authorization: TestCharger.basic(opts.user ?? stationId, password) },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
    return new TestCharger(ws);
  }

  /** Resolves with the HTTP status of a refused handshake. */
  static async connectExpectRefusal(port: number, stationId: string, password: string, opts: Parameters<typeof TestCharger.connect>[3] = {}): Promise<number> {
    try {
      const c = await TestCharger.connect(port, stationId, password, opts);
      c.ws.terminate();
      throw new Error('handshake unexpectedly succeeded');
    } catch (err) {
      const m = /^HTTP (\d+)$/.exec((err as Error).message);
      if (!m) throw err;
      return Number(m[1]);
    }
  }

  next(timeoutMs = 3_000): Promise<Frame> {
    const queued = this.received.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timed out waiting for a frame')), timeoutMs);
      this.waiting.push((f) => {
        clearTimeout(t);
        resolve(f);
      });
    });
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  async call(action: string, payload: unknown, id = String(this.nextId++)): Promise<Frame> {
    this.ws.send(JSON.stringify([2, id, action, payload]));
    return this.next();
  }

  close(): void {
    this.ws.close();
  }
}
