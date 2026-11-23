import { describe, expect, it } from 'vitest';
import { ErrorCode } from './errors.js';
import { parseFrame, serializeCallError, serializeCallResult } from './frame.js';

describe('parseFrame', () => {
  it('parses a CALL', () => {
    expect(parseFrame('[2,"abc","Heartbeat",{}]')).toEqual({ kind: 'call', id: 'abc', action: 'Heartbeat', payload: {} });
  });
  it('parses CALLRESULT and CALLERROR', () => {
    expect(parseFrame('[3,"abc",{"a":1}]')).toEqual({ kind: 'result', id: 'abc', payload: { a: 1 } });
    expect(parseFrame('[4,"abc","InternalError","x",{}]')).toMatchObject({ kind: 'error', id: 'abc', code: 'InternalError' });
  });
  it.each([
    ['not json', 'nope', null],
    ['not an array', '{"a":1}', null],
    ['too short', '[2,"a"]', null],
    ['non-string id', '[2,5,"Heartbeat",{}]', null],
    ['empty id', '[2,"","Heartbeat",{}]', null],
    ['id over 36 chars', `[2,"${'x'.repeat(37)}","Heartbeat",{}]`, null],
    ['CALL missing payload', '[2,"a","Heartbeat"]', 'a'],
    ['CALL with extra element', '[2,"a","Heartbeat",{},1]', 'a'],
    ['CALL non-string action', '[2,"a",7,{}]', 'a'],
    ['CALLRESULT with extra element', '[3,"a",{},1]', 'a'],
  ])('flags %s as FormationViolation', (_n, raw, id) => {
    expect(parseFrame(raw)).toMatchObject({ kind: 'invalid', id, code: ErrorCode.FormationViolation });
  });
  it('flags an unknown message type as ProtocolError and keeps the id', () => {
    expect(parseFrame('[9,"a","x",{}]')).toMatchObject({ kind: 'invalid', id: 'a', code: ErrorCode.ProtocolError });
  });
});

describe('serialization', () => {
  it('serializes CALLRESULT', () => {
    expect(JSON.parse(serializeCallResult('7', { a: 1 }))).toEqual([3, '7', { a: 1 }]);
  });
  it('serializes CALLERROR and uses "-1" when the id is unknown', () => {
    expect(JSON.parse(serializeCallError(null, ErrorCode.GenericError, 'd'))).toEqual([4, '-1', 'GenericError', 'd', {}]);
  });
});
