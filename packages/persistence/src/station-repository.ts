import type { BootDecision, BootRequest, RegistrationStatus, StationView } from '@csms/contracts';
import type { Queryable } from './db.js';

export class StationAlreadyExistsError extends Error {
  constructor(stationId: string) {
    super(`Station ${stationId} already exists`);
    this.name = 'StationAlreadyExistsError';
  }
}

interface StationRow {
  station_id: string;
  registration_status: RegistrationStatus;
  vendor: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  protocol_version: '1.6' | '2.0.1' | null;
  last_boot_at: Date | null;
  boot_count: number;
  created_at: Date;
}

const VIEW_COLUMNS = `station_id, registration_status, vendor, model, serial_number,
  firmware_version, protocol_version, last_boot_at, boot_count, created_at`;

function toView(r: StationRow): StationView {
  return {
    stationId: r.station_id,
    registrationStatus: r.registration_status,
    vendor: r.vendor,
    model: r.model,
    serialNumber: r.serial_number,
    firmwareVersion: r.firmware_version,
    protocolVersion: r.protocol_version,
    lastBootAt: r.last_boot_at?.toISOString() ?? null,
    bootCount: r.boot_count,
    createdAt: r.created_at.toISOString(),
  };
}

export async function insertStation(
  q: Queryable,
  stationId: string,
  status: RegistrationStatus,
  credentialHash: string,
): Promise<StationView> {
  try {
    const { rows } = await q.query<StationRow>(
      `INSERT INTO station.station (station_id, registration_status, credential_hash)
       VALUES ($1, $2, $3) RETURNING ${VIEW_COLUMNS}`,
      [stationId, status, credentialHash],
    );
    return toView(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new StationAlreadyExistsError(stationId);
    throw err;
  }
}

export async function getStation(q: Queryable, stationId: string): Promise<StationView | null> {
  const { rows } = await q.query<StationRow>(
    `SELECT ${VIEW_COLUMNS} FROM station.station WHERE station_id = $1`,
    [stationId],
  );
  return rows[0] ? toView(rows[0]) : null;
}

export async function listStations(q: Queryable, limit: number, after?: string): Promise<StationView[]> {
  const { rows } = await q.query<StationRow>(
    `SELECT ${VIEW_COLUMNS} FROM station.station
     WHERE ($1::text IS NULL OR station_id > $1) ORDER BY station_id LIMIT $2`,
    [after ?? null, limit],
  );
  return rows.map(toView);
}

export async function getCredentialHash(q: Queryable, stationId: string): Promise<string | null> {
  const { rows } = await q.query<{ credential_hash: string | null }>(
    'SELECT credential_hash FROM station.station WHERE station_id = $1',
    [stationId],
  );
  return rows[0]?.credential_hash ?? null;
}

/** Row-lock the station so concurrent boots from different gateway replicas serialize. */
export async function lockStation(
  q: Queryable,
  stationId: string,
): Promise<{ stationId: string; registrationStatus: RegistrationStatus } | null> {
  const { rows } = await q.query<{ station_id: string; registration_status: RegistrationStatus }>(
    'SELECT station_id, registration_status FROM station.station WHERE station_id = $1 FOR UPDATE',
    [stationId],
  );
  return rows[0] ? { stationId: rows[0].station_id, registrationStatus: rows[0].registration_status } : null;
}

export async function findBootDecision(
  q: Queryable,
  stationId: string,
  connectionId: string,
  ocppMessageId: string,
): Promise<BootDecision | null> {
  const { rows } = await q.query<{
    decision_status: RegistrationStatus;
    decision_interval_seconds: number;
    decision_server_time: Date;
  }>(
    `SELECT decision_status, decision_interval_seconds, decision_server_time
       FROM station.boot_event
      WHERE station_id = $1 AND connection_id = $2 AND ocpp_message_id = $3`,
    [stationId, connectionId, ocppMessageId],
  );
  const r = rows[0];
  return r
    ? {
        status: r.decision_status,
        intervalSeconds: r.decision_interval_seconds,
        serverTime: r.decision_server_time.toISOString(),
      }
    : null;
}

/** Append the boot evidence and update the station's current state (caller holds the row lock). */
export async function recordBoot(q: Queryable, req: BootRequest, decision: BootDecision): Promise<void> {
  await q.query(
    `INSERT INTO station.boot_event
       (station_id, connection_id, ocpp_message_id, ocpp_version, received_at,
        decision_status, decision_interval_seconds, decision_server_time, protocol_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      req.stationId,
      req.connectionId,
      req.ocppMessageId,
      req.ocppVersion,
      req.receivedAt,
      decision.status,
      decision.intervalSeconds,
      decision.serverTime,
      JSON.stringify(req.protocolPayload),
    ],
  );
  await q.query(
    `UPDATE station.station SET
       protocol_version = $2, vendor = $3, model = $4, serial_number = $5, firmware_version = $6,
       modem_iccid = $7, modem_imsi = $8,
       last_boot_at = GREATEST(COALESCE(last_boot_at, $9), $9),
       boot_count = boot_count + 1, updated_at = now()
     WHERE station_id = $1`,
    [
      req.stationId,
      req.ocppVersion,
      req.station.vendor,
      req.station.model,
      req.station.serialNumber ?? null,
      req.station.firmwareVersion ?? null,
      req.station.modemIccid ?? null,
      req.station.modemImsi ?? null,
      req.receivedAt,
    ],
  );
}
