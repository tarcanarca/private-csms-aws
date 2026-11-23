/**
 * OCPP 1.6J protocol adapter for ONE connection. No sockets, no HTTP, no SQL:
 * input is a raw frame, output is the raw reply frame (or null). Business
 * decisions are delegated to ControlPort.
 */
import type { RegistrationStatus } from '@csms/contracts';
import type { Logger } from '@csms/observability';
import {
  assertSupportedAction,
  assertValidResponsePayload,
  ErrorCode,
  fromBootDecision,
  OcppCallError,
  parseFrame,
  serializeCallError,
  serializeCallResult,
  toCanonicalBoot,
  validateRequestPayload,
  type BootNotificationRequest16,
  type SupportedAction,
} from '@csms/ocpp-1.6';
import { ControlUnavailableError, type ControlPort } from './control-client.js';

export interface SessionOptions {
  stationId: string;
  connectionId: string;
  control: ControlPort;
  logger: Logger;
  clock?: () => Date;
}

export class Ocpp16Session {
  /** Result of the most recent BootNotification on THIS connection (undefined until one is made). */
  private bootStatus: RegistrationStatus | undefined;
  private readonly clock: () => Date;

  constructor(private readonly opts: SessionOptions) {
    this.clock = opts.clock ?? (() => new Date());
  }

  async handleMessage(raw: string): Promise<string | null> {
    const frame = parseFrame(raw);
    switch (frame.kind) {
      case 'invalid':
        return serializeCallError(frame.id, frame.code, frame.description);
      case 'result':
      case 'error':
        // Phase 1 sends no CALLs to the station, so nothing can be correlated.
        this.opts.logger.warn({ stationId: this.opts.stationId, id: frame.id }, 'ignoring unsolicited response frame');
        return null;
      case 'call':
        try {
          const payload = await this.dispatch(frame.id, frame.action, frame.payload);
          return serializeCallResult(frame.id, payload);
        } catch (err) {
          return this.toCallError(frame.id, frame.action, err);
        }
    }
  }

  private async dispatch(id: string, action: string, payload: unknown): Promise<unknown> {
    assertSupportedAction(action);
    validateRequestPayload(action, payload);
    const response = await this.execute(id, action, payload);
    assertValidResponsePayload(action, response);
    return response;
  }

  private async execute(id: string, action: SupportedAction, payload: unknown): Promise<unknown> {
    switch (action) {
      case 'BootNotification': {
        const request = toCanonicalBoot(
          {
            stationId: this.opts.stationId,
            connectionId: this.opts.connectionId,
            ocppMessageId: id,
            receivedAt: this.clock(),
          },
          payload as BootNotificationRequest16,
        );
        // Sync contract: the answer below exists only after Control committed it.
        const decision = await this.opts.control.boot(request);
        this.bootStatus = decision.status;
        return fromBootDecision(decision);
      }
      case 'Heartbeat':
        // Gateway-local: no domain round trip. A station told "Rejected" on this connection must back off.
        if (this.bootStatus === 'Rejected') {
          throw new OcppCallError(ErrorCode.SecurityError, 'BootNotification was rejected');
        }
        return { currentTime: this.clock().toISOString() };
    }
  }

  private toCallError(id: string, action: string, err: unknown): string {
    if (err instanceof OcppCallError) {
      return serializeCallError(id, err.code, err.description, err.details);
    }
    if (err instanceof ControlUnavailableError) {
      this.opts.logger.warn({ stationId: this.opts.stationId, action, err: err.message }, 'control unavailable');
      return serializeCallError(id, ErrorCode.InternalError, 'Temporarily unable to process request');
    }
    this.opts.logger.error({ stationId: this.opts.stationId, action, err }, 'unexpected error');
    return serializeCallError(id, ErrorCode.InternalError, 'Internal error');
  }
}
