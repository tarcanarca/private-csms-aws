import { describe, expect, it } from 'vitest';
import { assertValidResponsePayload, OcppCallError, validateRequestPayload } from '@csms/ocpp-1.6';

const code = (fn: () => void): string | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof OcppCallError) return e.code;
    throw e;
  }
  return undefined;
};

describe('BootNotification request (OCA 1.6 schema)', () => {
  it('accepts the minimal payload (vendor + model)', () => {
    expect(code(() => validateRequestPayload('BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }))).toBeUndefined();
  });
  it('accepts every optional field at its maximum length', () => {
    const p = {
      chargePointVendor: 'v'.repeat(20), chargePointModel: 'm'.repeat(20), chargePointSerialNumber: 's'.repeat(25),
      chargeBoxSerialNumber: 'b'.repeat(25), firmwareVersion: 'f'.repeat(50), iccid: 'i'.repeat(20), imsi: 'i'.repeat(20),
      meterType: 't'.repeat(25), meterSerialNumber: 'n'.repeat(25),
    };
    expect(code(() => validateRequestPayload('BootNotification', p))).toBeUndefined();
  });
  it.each([
    ['missing chargePointModel', { chargePointVendor: 'V' }, 'OccurenceConstraintViolation'],
    ['missing vendor', { chargePointModel: 'M' }, 'OccurenceConstraintViolation'],
    ['vendor not a string', { chargePointVendor: 5, chargePointModel: 'M' }, 'TypeConstraintViolation'],
    ['vendor too long (21)', { chargePointVendor: 'v'.repeat(21), chargePointModel: 'M' }, 'PropertyConstraintViolation'],
    ['firmwareVersion too long (51)', { chargePointVendor: 'V', chargePointModel: 'M', firmwareVersion: 'f'.repeat(51) }, 'PropertyConstraintViolation'],
    ['unknown property', { chargePointVendor: 'V', chargePointModel: 'M', extra: 1 }, 'PropertyConstraintViolation'],
    ['payload not an object', 'nope', 'TypeConstraintViolation'],
    ['payload null', null, 'TypeConstraintViolation'],
  ])('rejects: %s', (_n, payload, expected) => {
    expect(code(() => validateRequestPayload('BootNotification', payload))).toBe(expected);
  });
});

describe('BootNotification response (self-check)', () => {
  const ok = { status: 'Accepted', currentTime: '2026-11-19T10:00:00.000Z', interval: 300 };
  it('accepts valid responses for each status', () => {
    for (const status of ['Accepted', 'Pending', 'Rejected']) {
      expect(code(() => assertValidResponsePayload('BootNotification', { ...ok, status }))).toBeUndefined();
    }
  });
  it.each([
    ['unknown status', { ...ok, status: 'Maybe' }],
    ['missing interval', { status: 'Accepted', currentTime: ok.currentTime }],
    ['non-integer interval', { ...ok, interval: 1.5 }],
    ['bad date-time', { ...ok, currentTime: '2026-13-45' }],
    ['extra property', { ...ok, extra: true }],
  ])('flags %s as server InternalError', (_n, payload) => {
    expect(code(() => assertValidResponsePayload('BootNotification', payload))).toBe('InternalError');
  });
});

describe('Heartbeat', () => {
  it('request must be an empty object', () => {
    expect(code(() => validateRequestPayload('Heartbeat', {}))).toBeUndefined();
    expect(code(() => validateRequestPayload('Heartbeat', { a: 1 }))).toBe('PropertyConstraintViolation');
  });
  it('response requires a date-time currentTime', () => {
    expect(code(() => assertValidResponsePayload('Heartbeat', { currentTime: '2026-11-19T10:00:00Z' }))).toBeUndefined();
    expect(code(() => assertValidResponsePayload('Heartbeat', {}))).toBe('InternalError');
    expect(code(() => assertValidResponsePayload('Heartbeat', { currentTime: 'now' }))).toBe('InternalError');
  });
});
