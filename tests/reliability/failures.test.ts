import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestCharger } from '../support/charger.js';
import { createTestDatabase, type TestDatabase } from '../support/db.js';
import { delayingProxy, faultyPool } from '../support/faults.js';
import { BOOT_PAYLOAD, operator, startControl, startGateway } from '../support/stack.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('failure paths', () => {
  let db: TestDatabase;
  let faulty: ReturnType<typeof faultyPool>;
  let control: Awaited<ReturnType<typeof startControl>>;
  let op: ReturnType<typeof operator>;
  let n = 0;

  beforeAll(async () => {
    db = await createTestDatabase();
    faulty = faultyPool(db.pool);
    control = await startControl(faulty.pool);
    op = operator(control.url);
  });
  afterAll(async () => {
    await control.app.close();
    await db.drop();
  });

  const bootRows = async (stationId: string) =>
    (await db.pool.query('SELECT count(*)::int AS n FROM station.boot_event WHERE station_id=$1', [stationId])).rows[0].n as number;
  const newStation = async () => {
    const stationId = `F-${++n}`;
    return op.createStation(stationId);
  };

  it('COMMIT failure: station gets CALLERROR, nothing is persisted, and a retry succeeds', async () => {
    const gw = await startGateway(control.url);
    const { stationId, password } = await newStation();
    const c = await TestCharger.connect(gw.port, stationId, password);

    faulty.faults.commitFails = true;
    const failed = await c.call('BootNotification', BOOT_PAYLOAD, 'x1');
    faulty.faults.commitFails = false;
    expect(failed.slice(0, 3)).toEqual([4, 'x1', 'InternalError']);
    expect(await bootRows(stationId)).toBe(0); // no success was acknowledged, and none was stored
    expect((await op.getStation(stationId))['bootCount']).toBe(0);

    const retried = await c.call('BootNotification', BOOT_PAYLOAD, 'x2');
    expect(retried[2]).toMatchObject({ status: 'Accepted' });
    expect(await bootRows(stationId)).toBe(1);
    c.close();
    await gw.server.stop();
  });

  it('database down: new handshakes get 503, boot gets CALLERROR, gateway-local Heartbeat still works, readyz fails', async () => {
    const gw = await startGateway(control.url);
    const { stationId, password } = await newStation();
    const c = await TestCharger.connect(gw.port, stationId, password);

    faulty.faults.connectFails = true;
    try {
      expect(await TestCharger.connectExpectRefusal(gw.port, stationId, password)).toBe(503);
      const boot = await c.call('BootNotification', BOOT_PAYLOAD, 'b');
      expect(boot.slice(0, 3)).toEqual([4, 'b', 'InternalError']);
      const hb = await c.call('Heartbeat', {}, 'h');
      expect(hb[0]).toBe(3); // Heartbeat does not depend on Control or PostgreSQL
      expect((await fetch(`${control.url}/readyz`)).status).toBe(503);
    } finally {
      faulty.faults.connectFails = false;
    }
    expect((await fetch(`${control.url}/readyz`)).status).toBe(200);
    expect((await c.call('BootNotification', BOOT_PAYLOAD, 'b2'))[2]).toMatchObject({ status: 'Accepted' });
    c.close();
    await gw.server.stop();
  });

  it('Control unreachable: CALLERROR for Boot (fast), 503 for handshake, Heartbeat unaffected', async () => {
    const own = await createTestDatabase();
    const ctl = await startControl(own.pool);
    const gw = await startGateway(ctl.url);
    const o = operator(ctl.url);
    const { password } = await o.createStation('U-1');
    const c = await TestCharger.connect(gw.port, 'U-1', password);

    await ctl.app.close();
    const t0 = Date.now();
    const boot = await c.call('BootNotification', BOOT_PAYLOAD, 'b');
    expect(boot.slice(0, 3)).toEqual([4, 'b', 'InternalError']);
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect((await c.call('Heartbeat', {}))[0]).toBe(3);
    expect(await TestCharger.connectExpectRefusal(gw.port, 'U-1', password)).toBe(503);
    c.close();
    await gw.server.stop();
    await own.drop();
  });

  it('wrong internal token: handshakes fail closed with 503 (misconfiguration is never treated as "authenticated")', async () => {
    const gw = await startGateway(control.url);
    const { stationId, password } = await newStation();
    const { GatewayServer, HttpControlClient } = await import('@csms/ocpp-gateway');
    const { createLogger } = await import('@csms/observability');
    const { gatewayConfig } = await import('../support/stack.js');
    const cfg = gatewayConfig({ controlBaseUrl: control.url });
    const bad = new GatewayServer(cfg, new HttpControlClient(control.url, 'wrong-token', { authMs: 1000, bootMs: 1000 }), createLogger('t', 'silent'));
    const port = await bad.start();
    expect(await TestCharger.connectExpectRefusal(port, stationId, password)).toBe(503);
    await bad.stop();
    await gw.server.stop();
  });

  it('commit-then-response-loss: late Control reply times out at the station, state IS committed, retry is safe', async () => {
    const proxy = await delayingProxy(control.url);
    const gw = await startGateway(proxy.url, { bootTimeoutMs: 200 });
    const { stationId, password } = await newStation();
    const c = await TestCharger.connect(gw.port, stationId, password);

    proxy.setDelayMs(600);
    const lost = await c.call('BootNotification', BOOT_PAYLOAD, 'slow-1');
    expect(lost.slice(0, 3)).toEqual([4, 'slow-1', 'InternalError']); // station was NOT told Accepted
    await sleep(700);
    expect(await bootRows(stationId)).toBe(1); // ...yet Control had committed it: the ambiguous window is real

    proxy.setDelayMs(0);
    const retry = await c.call('BootNotification', BOOT_PAYLOAD, 'slow-2');
    expect(retry[2]).toMatchObject({ status: 'Accepted' });
    // Boot is naturally repeatable; the station ends in a consistent, accepted state.
    expect(await op.getStation(stationId)).toMatchObject({ registrationStatus: 'Accepted', bootCount: 2 });
    c.close();
    await gw.server.stop();
    await proxy.close();
  });

  describe('protocol abuse', () => {
    it('malformed frames get CALLERROR "-1"/FormationViolation and the connection stays usable', async () => {
      const gw = await startGateway(control.url);
      const { stationId, password } = await newStation();
      const c = await TestCharger.connect(gw.port, stationId, password);
      c.sendRaw('definitely not json');
      expect((await c.next()).slice(0, 3)).toEqual([4, '-1', 'FormationViolation']);
      c.sendRaw('[2,"q","Heartbeat"]');
      expect((await c.next()).slice(0, 3)).toEqual([4, 'q', 'FormationViolation']);
      expect((await c.call('Heartbeat', {}))[0]).toBe(3);
      c.close();
      await gw.server.stop();
    });

    it('oversized frames close the socket with 1009; binary frames with 1003', async () => {
      const gw = await startGateway(control.url, { maxPayloadBytes: 1024 });
      const a = await newStation();
      const big = await TestCharger.connect(gw.port, a.stationId, a.password);
      big.sendRaw(JSON.stringify([2, '1', 'Heartbeat', { pad: 'x'.repeat(4096) }]));
      expect((await big.closed).code).toBe(1009);
      const b = await newStation();
      const bin = await TestCharger.connect(gw.port, b.stationId, b.password);
      bin.ws.send(Buffer.from([1, 2, 3]));
      expect((await bin.closed).code).toBe(1003);
      await gw.server.stop();
    });

    it('a station flooding while Control is slow is cut off (1008) instead of growing an unbounded queue', async () => {
      const proxy = await delayingProxy(control.url);
      const gw = await startGateway(proxy.url, { maxQueuedCalls: 2, bootTimeoutMs: 1500 });
      const { stationId, password } = await newStation();
      const c = await TestCharger.connect(gw.port, stationId, password);
      proxy.setDelayMs(400);
      for (let i = 0; i < 5; i++) c.sendRaw(JSON.stringify([2, `f${i}`, 'BootNotification', BOOT_PAYLOAD]));
      expect((await c.closed).code).toBe(1008);
      await gw.server.stop();
      await proxy.close();
    });
  });

  describe('connection lifecycle', () => {
    it('a newer connection from the same station supersedes the older one on that gateway', async () => {
      const gw = await startGateway(control.url);
      const { stationId, password } = await newStation();
      const first = await TestCharger.connect(gw.port, stationId, password);
      const second = await TestCharger.connect(gw.port, stationId, password);
      expect((await first.closed).code).toBe(4000);
      expect((await second.call('Heartbeat', {}))[0]).toBe(3);
      expect(gw.server.connectionCount).toBe(1);
      second.close();
      await gw.server.stop();
    });

    it('drain: readiness fails and new handshakes get 503 immediately; stations get close 1001', async () => {
      const gw = await startGateway(control.url, { drainTimeoutMs: 1_500 });
      const { stationId, password } = await newStation();
      const c = await TestCharger.connect(gw.port, stationId, password);
      // Stall the client's side so the close handshake cannot finish and the drain window stays open.
      (c.ws as unknown as { _socket: { pause(): void; resume(): void } })._socket.pause();
      const stopping = gw.server.stop();
      expect((await fetch(`http://127.0.0.1:${gw.port}/readyz`)).status).toBe(503);
      expect((await fetch(`http://127.0.0.1:${gw.port}/healthz`)).status).toBe(200); // still alive, just not ready
      expect(await TestCharger.connectExpectRefusal(gw.port, 'anyone', 'x')).toBe(503);
      (c.ws as unknown as { _socket: { resume(): void } })._socket.resume();
      expect((await c.closed).code).toBe(1001);
      await stopping;
    });
  });
});
