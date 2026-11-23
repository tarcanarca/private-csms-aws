import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/db.js';
import { TestCharger } from '../support/charger.js';
import { BOOT_PAYLOAD, INTERNAL_TOKEN, OPERATOR_TOKEN, operator, startControl, startGateway } from '../support/stack.js';

describe('Phase 1 vertical slice: boot + heartbeat across two gateway replicas', () => {
  let db: TestDatabase;
  let control: Awaited<ReturnType<typeof startControl>>;
  let gw: Array<Awaited<ReturnType<typeof startGateway>>>;
  let op: ReturnType<typeof operator>;
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;

  beforeAll(async () => {
    db = await createTestDatabase();
    control = await startControl(db.pool);
    gw = [await startGateway(control.url), await startGateway(control.url)];
    op = operator(control.url);
  });
  afterAll(async () => {
    await Promise.all(gw.map((g) => g.server.stop()));
    await control.app.close();
    await db.drop();
  });

  it('persists boot state BEFORE the station sees Accepted, and shares it across replicas', async () => {
    const stationId = id('CP');
    const { password } = await op.createStation(stationId);

    const a = await TestCharger.connect(gw[0]!.port, stationId, password);
    const reply = await a.call('BootNotification', BOOT_PAYLOAD, 'boot-1');
    expect(reply[0]).toBe(3);
    expect(reply[1]).toBe('boot-1');
    expect(reply[2]).toMatchObject({ status: 'Accepted', interval: 300 });

    // Durability: the moment the CALLRESULT is visible, the row must already be committed.
    const { rows } = await db.pool.query('SELECT * FROM station.boot_event WHERE station_id = $1', [stationId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].decision_status).toBe('Accepted');
    expect(rows[0].protocol_payload).toEqual(BOOT_PAYLOAD);

    // Replica B sees the same state through Control.
    const viewViaApi = await op.getStation(stationId);
    expect(viewViaApi).toMatchObject({ vendor: 'ACME', model: 'Z1', firmwareVersion: '1.2.3', protocolVersion: '1.6', bootCount: 1 });
    const b = await TestCharger.connect(gw[1]!.port, stationId, password);
    const hb = await b.call('Heartbeat', {});
    expect(hb[2]).toMatchObject({ currentTime: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    const reboot = await b.call('BootNotification', { ...BOOT_PAYLOAD, firmwareVersion: '2.0.0' });
    expect(reboot[2]).toMatchObject({ status: 'Accepted' });
    expect(await op.getStation(stationId)).toMatchObject({ firmwareVersion: '2.0.0', bootCount: 2 });
    a.close();
    b.close();
  });

  it('serializes concurrent boots of one station arriving through different replicas', async () => {
    const stationId = id('CP');
    const { password } = await op.createStation(stationId);
    // Same station connected to both replicas; newest-wins is per-instance, so both stay open.
    const [a, b] = await Promise.all([
      TestCharger.connect(gw[0]!.port, stationId, password),
      TestCharger.connect(gw[1]!.port, stationId, password),
    ]);
    // Each socket sends 5 boots in sequence; the two sockets run in parallel through different replicas.
    const run = async (c: TestCharger) => {
      const out: unknown[][] = [];
      for (let i = 0; i < 5; i++) out.push(await c.call('BootNotification', BOOT_PAYLOAD));
      return out;
    };
    const replies = (await Promise.all([run(a), run(b)])).flat();
    expect(replies).toHaveLength(10);
    expect(replies.every((r) => (r[2] as { status: string }).status === 'Accepted')).toBe(true);
    // Message ids repeat across the two sockets ("1".."5"), but connection ids differ, so none is a duplicate.
    expect((await op.getStation(stationId))['bootCount']).toBe(10);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM station.boot_event WHERE station_id=$1', [stationId])).rows[0].n).toBe(10);
    a.close();
    b.close();
  });

  it('returns the stored decision for a retried boot request (lost-response safety)', async () => {
    const stationId = id('CP');
    await op.createStation(stationId);
    const body = {
      stationId, ocppVersion: '1.6', connectionId: randomUUID(), ocppMessageId: 'm-1',
      receivedAt: new Date().toISOString(),
      station: { vendor: 'ACME', model: 'Z1' }, protocolPayload: BOOT_PAYLOAD,
    };
    const post = () => fetch(`${control.url}/internal/ocpp/boot`, {
      method: 'POST', headers: { authorization: `Bearer ${INTERNAL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => r.json());
    const first = await post();
    await new Promise((r) => setTimeout(r, 15));
    const second = await post();
    expect(second).toEqual(first); // identical serverTime: deterministic replay, not a new decision
    expect((await op.getStation(stationId))['bootCount']).toBe(1);
  });

  it('answers Pending/Rejected stations with a normal CALLRESULT and the retry interval', async () => {
    const pending = id('P');
    const rejected = id('R');
    const pp = (await op.createStation(pending, 'Pending')).password;
    const rp = (await op.createStation(rejected, 'Rejected')).password;
    const p = await TestCharger.connect(gw[0]!.port, pending, pp);
    expect((await p.call('BootNotification', BOOT_PAYLOAD))[2]).toMatchObject({ status: 'Pending', interval: 60 });
    const r = await TestCharger.connect(gw[0]!.port, rejected, rp);
    expect((await r.call('BootNotification', BOOT_PAYLOAD))[2]).toMatchObject({ status: 'Rejected', interval: 60 });
    const hb = await r.call('Heartbeat', {});
    expect(hb[0]).toBe(4);
    expect(hb[2]).toBe('SecurityError');
    p.close();
    r.close();
  });

  it('records nothing for an unknown station on the boot endpoint', async () => {
    const res = await fetch(`${control.url}/internal/ocpp/boot`, {
      method: 'POST', headers: { authorization: `Bearer ${INTERNAL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ stationId: 'ghost', ocppVersion: '1.6', connectionId: randomUUID(), ocppMessageId: '1', receivedAt: new Date().toISOString(), station: { vendor: 'a', model: 'b' }, protocolPayload: {} }),
    });
    expect(await res.json()).toMatchObject({ status: 'Rejected' });
    expect((await db.pool.query("SELECT 1 FROM station.station WHERE station_id = 'ghost'")).rowCount).toBe(0);
  });

  describe('handshake security and negotiation', () => {
    it('refuses wrong password, unknown station, username/path mismatch', async () => {
      const stationId = id('CP');
      const { password } = await op.createStation(stationId);
      const port = gw[0]!.port;
      expect(await TestCharger.connectExpectRefusal(port, stationId, 'wrong')).toBe(401);
      expect(await TestCharger.connectExpectRefusal(port, 'nobody', 'x')).toBe(401);
      expect(await TestCharger.connectExpectRefusal(port, stationId, password, { user: 'someone-else' })).toBe(401);
    });
    it('refuses a missing Authorization header', async () => {
      const stationId = id('CP');
      await op.createStation(stationId);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1', port: gw[0]!.port, path: `/ocpp/${stationId}`,
          headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Protocol': 'ocpp1.6' },
        });
        req.on('response', (res) => { res.resume(); resolve(res.statusCode ?? 0); });
        req.on('upgrade', () => reject(new Error('unexpected upgrade')));
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(401);
    });
    it('refuses stations that offer no supported subprotocol (400) and bad paths (404)', async () => {
      const stationId = id('CP');
      const { password } = await op.createStation(stationId);
      const port = gw[0]!.port;
      expect(await TestCharger.connectExpectRefusal(port, stationId, password, { protocols: ['ocpp2.0.1'] })).toBe(400);
      expect(await TestCharger.connectExpectRefusal(port, stationId, password, { path: '/elsewhere' })).toBe(404);
      expect(await TestCharger.connectExpectRefusal(port, stationId, password, { path: '/ocpp/bad%20id' })).toBe(404);
    });
    it('negotiates ocpp1.6 when offered among others', async () => {
      const stationId = id('CP');
      const { password } = await op.createStation(stationId);
      const c = await TestCharger.connect(gw[0]!.port, stationId, password, { protocols: ['ocpp2.0.1', 'ocpp1.6'] });
      expect(c.ws.protocol).toBe('ocpp1.6');
      c.close();
    });
  });

  describe('Charging Control HTTP API', () => {
    it('requires the right bearer token per surface', async () => {
      const noAuth = await fetch(`${control.url}/api/v1/stations`);
      expect(noAuth.status).toBe(401);
      const wrongSurface = await fetch(`${control.url}/api/v1/stations`, { headers: { authorization: `Bearer ${INTERNAL_TOKEN}` } });
      expect(wrongSurface.status).toBe(401);
      const internalWithOperator = await fetch(`${control.url}/internal/stations/authenticate`, { method: 'POST', headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, 'content-type': 'application/json' }, body: '{}' });
      expect(internalWithOperator.status).toBe(401);
    });
    it('creates once (201 + one-time password), rejects duplicates (409) and bad input (400), 404s unknown', async () => {
      const stationId = id('API');
      const created = await op.call('POST', '/api/v1/stations', { stationId });
      expect(created.status).toBe(201);
      const body = (await created.json()) as Record<string, unknown>;
      expect(body['password']).toMatch(/^[0-9a-f]{32}$/);
      expect(body).toMatchObject({ stationId, registrationStatus: 'Accepted', bootCount: 0 });
      expect((await db.pool.query('SELECT credential_hash FROM station.station WHERE station_id=$1', [stationId])).rows[0].credential_hash).not.toContain(body['password']);
      const get = await (await op.call('GET', `/api/v1/stations/${stationId}`)).json();
      expect(get).not.toHaveProperty('password');
      expect((await op.call('POST', '/api/v1/stations', { stationId })).status).toBe(409);
      expect((await op.call('POST', '/api/v1/stations', { stationId: 'bad id!' })).status).toBe(400);
      expect((await op.call('POST', '/api/v1/stations', { stationId: id('x'), registrationStatus: 'Nope' })).status).toBe(400);
      expect((await op.call('GET', '/api/v1/stations/does-not-exist')).status).toBe(404);
    });
    it('lists with keyset pagination', async () => {
      const p = id('LIST');
      for (const s of ['a', 'b', 'c']) await op.createStation(`${p}-${s}`);
      const first = (await (await op.call('GET', `/api/v1/stations?limit=2&after=${p}`)).json()) as { items: Array<{ stationId: string }> };
      expect(first.items.map((i) => i.stationId)).toEqual([`${p}-a`, `${p}-b`]);
      const second = (await (await op.call('GET', `/api/v1/stations?limit=2&after=${p}-b`)).json()) as { items: Array<{ stationId: string }> };
      expect(second.items[0]!.stationId).toBe(`${p}-c`);
    });
    it('reports liveness and readiness without auth', async () => {
      expect((await fetch(`${control.url}/healthz`)).status).toBe(200);
      expect((await fetch(`${control.url}/readyz`)).status).toBe(200);
    });
  });
});
