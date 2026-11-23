/**
 * Station domain rules. Pure functions: no I/O, no protocol types, no clock.
 */
import type { BootDecision, RegistrationStatus } from '@csms/contracts';

export interface StationPolicy {
  /** Heartbeat interval returned to Accepted stations. */
  heartbeatIntervalSeconds: number;
  /** Retry interval returned to Pending/Rejected/unknown stations. */
  retryIntervalSeconds: number;
}

export const DEFAULT_STATION_POLICY: StationPolicy = {
  heartbeatIntervalSeconds: 300,
  retryIntervalSeconds: 60,
};

export interface KnownStation {
  stationId: string;
  registrationStatus: RegistrationStatus;
}

/**
 * Decide the response to a BootNotification-equivalent registration request.
 * Unknown stations are Rejected (they must be provisioned by an operator).
 */
export function decideBoot(
  station: KnownStation | null,
  policy: StationPolicy,
  now: Date,
): BootDecision {
  const serverTime = now.toISOString();
  if (station === null) {
    return { status: 'Rejected', intervalSeconds: policy.retryIntervalSeconds, serverTime };
  }
  if (station.registrationStatus === 'Accepted') {
    return { status: 'Accepted', intervalSeconds: policy.heartbeatIntervalSeconds, serverTime };
  }
  return {
    status: station.registrationStatus,
    intervalSeconds: policy.retryIntervalSeconds,
    serverTime,
  };
}

/** Whether a station may keep a WebSocket after authentication. Rejected stations may connect (spec: they must be told to back off). */
export function mayHoldConnection(_station: KnownStation): boolean {
  return true;
}
