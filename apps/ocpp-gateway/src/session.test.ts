import type { BootDecision, BootRequest } from '@csms/contracts';
import { createLogger } from '@csms/observability';
import { describe, expect, it, vi } from 'vitest';
import { ControlUnavailableError, type ControlPort } from './control-client.js';
import { Ocpp16Session } from './session.js';

const NOW = new Date('2026-11-19T10:00:00.000Z');
const accepted: BootDecision = { status: 'Accepted', intervalSeconds: 300, serverTime: NOW.toISOString() };

function make(overrides: Partial<ControlPort> = {}) {
  const control = {
    authenticate: vi.fn(async () => true),
    boot: vi.fn(async (_r: BootRequest) => accepted),
    ...overrides,
  } as ControlPort & { boot: ReturnType<typeof vi.fn> };
  const session = new Ocpp16Session({
    stationId: 'CP1',
    connectionId: '11111111-1111-4111-8111-111111111111',
    control,
    logger: createLogger('test', 'silent'),
    clock: () => NOW,
  });
  return { control, session };
}
const call = (id: string, action: string, payload: unknown) => JSON.stringify([2, id, action, payload]);
const parse = (s: string | null) => JSON.parse(s ?? 'null') as unknown[];

describe('Ocpp16Session', () => {
  it('maps BootNotification to the canonical request and the decision to a schema-valid CALLRESULT', async () => {
    const { control, session } = make();
    const reply = parse(await session.handleMessage(call('b1', 'BootNotification', { chargePointVendor: 'ACME', chargePointModel: 'Z1', chargeBoxSerialNumber: 'SN9', iccid: '8931' })));
    expect(reply).toEqual([3, 'b1', { status: 'Accepted', currentTime: NOW.toISOString(), interval: 300 }]);
    const sent = control.boot.mock.calls[0]![0] as BootRequest;
    expect(sent).toMatchObject({ stationId: 'CP1', ocppVersion: '1.6', ocppMessageId: 'b1', station: { vendor: 'ACME', model: 'Z1', serialNumber: 'SN9', modemIccid: '8931' } });
  });

  it('answers Heartbeat locally without calling Control', async () => {
    const { control, session } = make();
    const reply = parse(await session.handleMessage(call('h1', 'Heartbeat', {})));
    expect(reply).toEqual([3, 'h1', { currentTime: NOW.toISOString() }]);
    expect(control.boot).not.toHaveBeenCalled();
    expect(control.authenticate).not.toHaveBeenCalled();
  });

  it('does not call Control for schema-invalid Boot payloads', async () => {
    const { control, session } = make();
    const missing = parse(await session.handleMessage(call('1', 'BootNotification', { chargePointVendor: 'ACME' })));
    expect(missing.slice(0, 3)).toEqual([4, '1', 'OccurenceConstraintViolation']);
    const wrongType = parse(await session.handleMessage(call('2', 'BootNotification', { chargePointVendor: 1, chargePointModel: 'Z' })));
    expect(wrongType[2]).toBe('TypeConstraintViolation');
    const tooLong = parse(await session.handleMessage(call('3', 'BootNotification', { chargePointVendor: 'x'.repeat(21), chargePointModel: 'Z' })));
    expect(tooLong[2]).toBe('PropertyConstraintViolation');
    expect(control.boot).not.toHaveBeenCalled();
  });

  it('returns InternalError when Control is unavailable and never fabricates a decision', async () => {
    const { session } = make({ boot: vi.fn(async () => { throw new ControlUnavailableError('down'); }) });
    const reply = parse(await session.handleMessage(call('b', 'BootNotification', { chargePointVendor: 'A', chargePointModel: 'B' })));
    expect(reply.slice(0, 3)).toEqual([4, 'b', 'InternalError']);
  });

  it('turns an unexpected failure into InternalError without leaking details', async () => {
    const { session } = make({ boot: vi.fn(async () => { throw new TypeError('secret detail'); }) });
    const reply = parse(await session.handleMessage(call('b', 'BootNotification', { chargePointVendor: 'A', chargePointModel: 'B' })));
    expect(reply.slice(0, 3)).toEqual([4, 'b', 'InternalError']);
    expect(JSON.stringify(reply)).not.toContain('secret detail');
  });

  it('refuses to send a response that violates the response schema', async () => {
    const { session } = make({ boot: vi.fn(async () => ({ ...accepted, serverTime: 'yesterday-ish' })) });
    const reply = parse(await session.handleMessage(call('b', 'BootNotification', { chargePointVendor: 'A', chargePointModel: 'B' })));
    expect(reply.slice(0, 3)).toEqual([4, 'b', 'InternalError']);
  });

  it('maps negative boot decisions to normal CALLRESULTs and blocks later Heartbeats', async () => {
    const { session } = make({ boot: vi.fn(async () => ({ status: 'Rejected', intervalSeconds: 60, serverTime: NOW.toISOString() }) as BootDecision) });
    const boot = parse(await session.handleMessage(call('b', 'BootNotification', { chargePointVendor: 'A', chargePointModel: 'B' })));
    expect(boot).toEqual([3, 'b', { status: 'Rejected', currentTime: NOW.toISOString(), interval: 60 }]);
    const hb = parse(await session.handleMessage(call('h', 'Heartbeat', {})));
    expect(hb.slice(0, 3)).toEqual([4, 'h', 'SecurityError']);
  });

  it('distinguishes known-but-unsupported from unknown actions', async () => {
    const { session } = make();
    expect(parse(await session.handleMessage(call('a', 'Authorize', { idTag: 'x' })))[2]).toBe('NotSupported');
    expect(parse(await session.handleMessage(call('a', 'Teleport', {})))[2]).toBe('NotImplemented');
  });

  it('answers malformed frames with CALLERROR, using id "-1" when no id is usable', async () => {
    const { session } = make();
    expect(parse(await session.handleMessage('not json')).slice(0, 3)).toEqual([4, '-1', 'FormationViolation']);
    expect(parse(await session.handleMessage('[2,"x","Heartbeat"]')).slice(0, 3)).toEqual([4, 'x', 'FormationViolation']);
  });

  it('ignores unsolicited CALLRESULT/CALLERROR frames', async () => {
    const { session } = make();
    expect(await session.handleMessage('[3,"zz",{}]')).toBeNull();
    expect(await session.handleMessage('[4,"zz","GenericError","",{}]')).toBeNull();
  });
});
