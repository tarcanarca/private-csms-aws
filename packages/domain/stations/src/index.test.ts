import { describe, expect, it } from 'vitest';
import { DEFAULT_STATION_POLICY as P, decideBoot } from './index.js';

const now = new Date('2026-11-19T10:00:00.000Z');

describe('decideBoot', () => {
  it('rejects unknown stations with the retry interval', () => {
    expect(decideBoot(null, P, now)).toEqual({
      status: 'Rejected',
      intervalSeconds: P.retryIntervalSeconds,
      serverTime: now.toISOString(),
    });
  });
  it('accepts provisioned Accepted stations with the heartbeat interval', () => {
    const d = decideBoot({ stationId: 'A', registrationStatus: 'Accepted' }, P, now);
    expect(d.status).toBe('Accepted');
    expect(d.intervalSeconds).toBe(P.heartbeatIntervalSeconds);
  });
  it.each(['Pending', 'Rejected'] as const)('%s stations get the retry interval', (s) => {
    const d = decideBoot({ stationId: 'A', registrationStatus: s }, P, now);
    expect(d).toMatchObject({ status: s, intervalSeconds: P.retryIntervalSeconds });
  });
});
