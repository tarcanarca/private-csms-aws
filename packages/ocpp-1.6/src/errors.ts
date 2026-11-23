/**
 * OCPP-J 1.6 CALLERROR error codes (OCPP-J 1.6 spec, section 4.2.3).
 * NOTE: 1.6 spells "Occurence" with one 'r' and uses "FormationViolation";
 * OCPP 2.0.1 renames some codes, so this table must not be shared across versions.
 */
export const ErrorCode = {
  NotImplemented: 'NotImplemented',
  NotSupported: 'NotSupported',
  InternalError: 'InternalError',
  ProtocolError: 'ProtocolError',
  SecurityError: 'SecurityError',
  FormationViolation: 'FormationViolation',
  PropertyConstraintViolation: 'PropertyConstraintViolation',
  OccurenceConstraintViolation: 'OccurenceConstraintViolation',
  TypeConstraintViolation: 'TypeConstraintViolation',
  GenericError: 'GenericError',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class OcppCallError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly description: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${code}: ${description}`);
    this.name = 'OcppCallError';
  }
}
