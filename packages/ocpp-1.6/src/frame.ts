import { ErrorCode } from './errors.js';

export const MessageType = { Call: 2, CallResult: 3, CallError: 4 } as const;

export type Frame =
  | { kind: 'call'; id: string; action: string; payload: unknown }
  | { kind: 'result'; id: string; payload: unknown }
  | { kind: 'error'; id: string; code: string; description: string; details: unknown }
  | { kind: 'invalid'; id: string | null; code: ErrorCode; description: string };

const MAX_ID_LENGTH = 36;

/** Parse one OCPP-J frame. Never throws; malformed input becomes `kind: 'invalid'`. */
export function parseFrame(raw: string): Frame {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid(null, 'Frame is not valid JSON');
  }
  if (!Array.isArray(value) || value.length < 3) {
    return invalid(null, 'Frame must be a JSON array with at least 3 elements');
  }
  const [type, id] = value as unknown[];
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) {
    return invalid(null, `Message id must be a string of 1..${MAX_ID_LENGTH} characters`);
  }
  switch (type) {
    case MessageType.Call: {
      const action = value[2];
      if (value.length !== 4 || typeof action !== 'string' || action.length === 0) {
        return invalid(id, 'CALL must be [2, id, action, payload]');
      }
      return { kind: 'call', id, action, payload: value[3] };
    }
    case MessageType.CallResult:
      if (value.length !== 3) return invalid(id, 'CALLRESULT must be [3, id, payload]');
      return { kind: 'result', id, payload: value[2] };
    case MessageType.CallError:
      if (value.length !== 5 || typeof value[2] !== 'string' || typeof value[3] !== 'string') {
        return invalid(id, 'CALLERROR must be [4, id, code, description, details]');
      }
      return { kind: 'error', id, code: value[2], description: value[3], details: value[4] };
    default:
      return {
        kind: 'invalid',
        id,
        code: ErrorCode.ProtocolError,
        description: 'Unknown message type id',
      };
  }
}

function invalid(id: string | null, description: string): Frame {
  return { kind: 'invalid', id, code: ErrorCode.FormationViolation, description };
}

export function serializeCallResult(id: string, payload: unknown): string {
  return JSON.stringify([MessageType.CallResult, id, payload]);
}

/** `id` is "-1" when the offending frame had no usable message id. */
export function serializeCallError(
  id: string | null,
  code: ErrorCode,
  description: string,
  details: Record<string, unknown> = {},
): string {
  return JSON.stringify([MessageType.CallError, id ?? '-1', code, description, details]);
}
