/**
 * Version-independent contracts shared by the OCPP Gateway (protocol adapter)
 * and Charging Control (domain). Raw OCPP payloads never cross this boundary
 * except as opaque `protocolPayload` evidence.
 */
import { z } from 'zod';

export const StationIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,48}$/, 'invalid station id');

export const RegistrationStatusSchema = z.enum(['Accepted', 'Pending', 'Rejected']);
export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;

/** Protocol versions the platform understands; Phase 1 only exercises 1.6. */
export const OcppVersionSchema = z.enum(['1.6', '2.0.1']);
export type OcppVersion = z.infer<typeof OcppVersionSchema>;

// ---------- Gateway -> Control: station handshake authentication ----------

export const AuthenticateStationRequestSchema = z.object({
  stationId: StationIdSchema,
  password: z.string().min(1).max(256),
});
export type AuthenticateStationRequest = z.infer<typeof AuthenticateStationRequestSchema>;

export const AuthenticateStationResponseSchema = z.object({ authenticated: z.boolean() });
export type AuthenticateStationResponse = z.infer<typeof AuthenticateStationResponseSchema>;

// ---------- Gateway -> Control: boot decision (POST /internal/ocpp/boot) ----------

export const BootRequestSchema = z.object({
  stationId: StationIdSchema,
  ocppVersion: OcppVersionSchema,
  /** Gateway-generated id of the physical WebSocket connection. */
  connectionId: z.string().uuid(),
  /** OCPP unique message id. Unique per (station, connection) for idempotency. */
  ocppMessageId: z.string().min(1).max(36),
  receivedAt: z.string().datetime(),
  station: z.object({
    vendor: z.string().min(1).max(50),
    model: z.string().min(1).max(50),
    serialNumber: z.string().max(50).optional(),
    firmwareVersion: z.string().max(50).optional(),
    modemIccid: z.string().max(20).optional(),
    modemImsi: z.string().max(20).optional(),
  }),
  /** Raw protocol payload kept only as audit evidence. Not a domain input. */
  protocolPayload: z.record(z.unknown()),
});
export type BootRequest = z.infer<typeof BootRequestSchema>;

export const BootDecisionSchema = z.object({
  status: RegistrationStatusSchema,
  /** Heartbeat interval when Accepted, retry interval otherwise (seconds). */
  intervalSeconds: z.number().int().min(1),
  serverTime: z.string().datetime(),
});
export type BootDecision = z.infer<typeof BootDecisionSchema>;

// ---------- Operator API ----------

export const CreateStationRequestSchema = z.object({
  stationId: StationIdSchema,
  registrationStatus: RegistrationStatusSchema.default('Accepted'),
});
export type CreateStationRequest = z.infer<typeof CreateStationRequestSchema>;

export const StationViewSchema = z.object({
  stationId: StationIdSchema,
  registrationStatus: RegistrationStatusSchema,
  vendor: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  firmwareVersion: z.string().nullable(),
  protocolVersion: OcppVersionSchema.nullable(),
  lastBootAt: z.string().nullable(),
  bootCount: z.number().int(),
  createdAt: z.string(),
});
export type StationView = z.infer<typeof StationViewSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
