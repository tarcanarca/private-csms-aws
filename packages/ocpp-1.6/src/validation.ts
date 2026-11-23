import Ajv04Module from 'ajv-draft-04';
import type { ErrorObject, Options, ValidateFunction } from 'ajv';
import bootRequest from './schemas/BootNotification.json' with { type: 'json' };
import bootResponse from './schemas/BootNotificationResponse.json' with { type: 'json' };
import heartbeatRequest from './schemas/Heartbeat.json' with { type: 'json' };
import heartbeatResponse from './schemas/HeartbeatResponse.json' with { type: 'json' };
import { ErrorCode, OcppCallError } from './errors.js';

/** Actions this slice supports, with their official OCA JSON schemas (see schemas/SOURCES.md). */
export const SUPPORTED_ACTIONS = ['BootNotification', 'Heartbeat'] as const;
export type SupportedAction = (typeof SUPPORTED_ACTIONS)[number];

/** Charge-point-initiated 1.6 actions that exist in the spec but are not yet implemented. */
const KNOWN_UNSUPPORTED = new Set([
  'Authorize',
  'DataTransfer',
  'DiagnosticsStatusNotification',
  'FirmwareStatusNotification',
  'MeterValues',
  'StartTransaction',
  'StatusNotification',
  'StopTransaction',
]);

// OCA schemas are draft-04; `strict:false` because the official files contain
// annotations (e.g. additionalProperties on a string) that strict mode rejects.
// CJS/ESM interop: under NodeNext the class sits on `.default` in types, on the module itself at runtime.
const Ajv04 = ((Ajv04Module as unknown as { default?: unknown }).default ?? Ajv04Module) as unknown as new (o: Options) => { compile: (s: object) => ValidateFunction; addFormat: (n: string, f: unknown) => unknown };
const ajv = new Ajv04({ allErrors: true, strict: false });
// RFC 3339 date-time (the only format used by the supported schemas).
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
ajv.addFormat('date-time', {
  type: 'string',
  validate: (v: string) => RFC3339.test(v) && !Number.isNaN(Date.parse(v)),
});

const requestValidators: Record<SupportedAction, ValidateFunction> = {
  BootNotification: ajv.compile(bootRequest),
  Heartbeat: ajv.compile(heartbeatRequest),
};
const responseValidators: Record<SupportedAction, ValidateFunction> = {
  BootNotification: ajv.compile(bootResponse),
  Heartbeat: ajv.compile(heartbeatResponse),
};

export function isSupportedAction(action: string): action is SupportedAction {
  return (SUPPORTED_ACTIONS as readonly string[]).includes(action);
}

/** Throws OcppCallError(NotSupported | NotImplemented) for actions we do not handle. */
export function assertSupportedAction(action: string): asserts action is SupportedAction {
  if (isSupportedAction(action)) return;
  if (KNOWN_UNSUPPORTED.has(action)) {
    throw new OcppCallError(ErrorCode.NotSupported, `Action ${action} is not supported yet`);
  }
  throw new OcppCallError(ErrorCode.NotImplemented, `Unknown action ${action}`);
}

function keywordToCode(e: ErrorObject): ErrorCode {
  switch (e.keyword) {
    case 'required':
      return ErrorCode.OccurenceConstraintViolation;
    case 'type':
      return ErrorCode.TypeConstraintViolation;
    default:
      // maxLength, enum, format, additionalProperties, ...
      return ErrorCode.PropertyConstraintViolation;
  }
}

function describe(e: ErrorObject): string {
  const path = e.instancePath || '(root)';
  const extra = e.keyword === 'required' ? ` (${String(e.params['missingProperty'])})` : '';
  return `${path} ${e.message ?? 'is invalid'}${extra}`;
}

/** Validate an inbound CALL payload; throws a version-correct OcppCallError. */
export function validateRequestPayload(action: SupportedAction, payload: unknown): void {
  const validate = requestValidators[action];
  if (validate(payload)) return;
  const errors = validate.errors ?? [];
  // Precedence: a missing property is reported ahead of value-level violations.
  const first = errors.find((e) => e.keyword === 'required') ?? errors[0];
  throw new OcppCallError(
    first ? keywordToCode(first) : ErrorCode.FormationViolation,
    first ? describe(first) : 'Payload does not conform to schema',
    { errors: errors.map(describe) },
  );
}

/** Self-check of our own CALLRESULT payload; a failure is a server bug (InternalError). */
export function assertValidResponsePayload(action: SupportedAction, payload: unknown): void {
  const validate = responseValidators[action];
  if (validate(payload)) return;
  throw new OcppCallError(
    ErrorCode.InternalError,
    'Server produced an invalid response payload',
    { errors: (validate.errors ?? []).map(describe) },
  );
}
