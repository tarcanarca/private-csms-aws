import {
  AuthenticateStationResponseSchema,
  BootDecisionSchema,
  type BootDecision,
  type BootRequest,
} from '@csms/contracts';

/** The only way the gateway talks to the domain. Everything else is protocol work. */
export interface ControlPort {
  /** Resolves false for bad credentials; throws ControlUnavailableError when no decision could be obtained. */
  authenticate(stationId: string, password: string): Promise<boolean>;
  boot(req: BootRequest): Promise<BootDecision>;
}

export class ControlUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ControlUnavailableError';
  }
}

export class HttpControlClient implements ControlPort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeouts: { authMs: number; bootMs: number },
  ) {}

  async authenticate(stationId: string, password: string): Promise<boolean> {
    const body = await this.post('/internal/stations/authenticate', { stationId, password }, this.timeouts.authMs);
    return AuthenticateStationResponseSchema.parse(body).authenticated;
  }

  async boot(req: BootRequest): Promise<BootDecision> {
    const body = await this.post('/internal/ocpp/boot', req, this.timeouts.bootMs);
    return BootDecisionSchema.parse(body);
  }

  private async post(path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ControlUnavailableError(`Control request failed: ${(err as Error).message}`, { cause: err });
    }
    if (!res.ok) {
      await res.body?.cancel();
      // Any non-2xx means no domain decision exists for this request; never fabricate one.
      throw new ControlUnavailableError(`Control responded ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new ControlUnavailableError('Control returned an unreadable body', { cause: err });
    }
  }
}
