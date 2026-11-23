/** Protocol adapter: OCPP 1.6 BootNotification <-> canonical contracts. */
import type { BootDecision, BootRequest } from '@csms/contracts';

export interface BootNotificationRequest16 {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  chargeBoxSerialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  meterSerialNumber?: string;
}

export interface BootNotificationResponse16 {
  status: 'Accepted' | 'Pending' | 'Rejected';
  currentTime: string;
  interval: number;
}

export interface BootContext {
  stationId: string;
  connectionId: string;
  ocppMessageId: string;
  receivedAt: Date;
}

/** Payload must already be schema-validated. */
export function toCanonicalBoot(ctx: BootContext, p: BootNotificationRequest16): BootRequest {
  const serial = p.chargePointSerialNumber ?? p.chargeBoxSerialNumber;
  return {
    stationId: ctx.stationId,
    ocppVersion: '1.6',
    connectionId: ctx.connectionId,
    ocppMessageId: ctx.ocppMessageId,
    receivedAt: ctx.receivedAt.toISOString(),
    station: {
      vendor: p.chargePointVendor,
      model: p.chargePointModel,
      ...(serial !== undefined && { serialNumber: serial }),
      ...(p.firmwareVersion !== undefined && { firmwareVersion: p.firmwareVersion }),
      ...(p.iccid !== undefined && { modemIccid: p.iccid }),
      ...(p.imsi !== undefined && { modemImsi: p.imsi }),
    },
    protocolPayload: { ...p },
  };
}

export function fromBootDecision(d: BootDecision): BootNotificationResponse16 {
  return { status: d.status, currentTime: d.serverTime, interval: d.intervalSeconds };
}
