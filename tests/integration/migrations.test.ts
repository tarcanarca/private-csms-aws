import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@csms/persistence';
import { createTestDatabase, type TestDatabase } from '../support/db.js';

describe('migrator', () => {
  let db: TestDatabase;
  beforeAll(async () => void (db = await createTestDatabase({ migrate: false })));
  afterAll(async () => db.drop());

  it('applies migrations once, is idempotent, and tolerates concurrent runners', async () => {
    const runs = await Promise.all([migrate(db.pool), migrate(db.pool), migrate(db.pool)]);
    const appliedCount = runs.reduce((n, r) => n + r.applied.length, 0);
    expect(appliedCount).toBe(1); // exactly one runner applied 0001; the advisory lock serialized the rest
    const again = await migrate(db.pool);
    expect(again.applied).toEqual([]);
    expect(again.alreadyApplied).toEqual(['0001_station_schema.sql']);
    const { rows } = await db.pool.query("SELECT to_regclass('station.boot_event') AS t");
    expect(rows[0].t).not.toBeNull();
  });

  it('refuses to run when an applied migration file was modified', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
    await writeFile(path.join(dir, '0001_x.sql'), 'CREATE TABLE public.t1 (id int);');
    await migrate(db.pool, dir);
    await writeFile(path.join(dir, '0001_x.sql'), 'CREATE TABLE public.t1 (id int, extra int);');
    await expect(migrate(db.pool, dir)).rejects.toThrow(/modified after being applied/);
  });

  it('rolls a failing migration back completely and does not record it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
    await writeFile(path.join(dir, '0001_bad.sql'), 'CREATE TABLE public.half (id int); SELECT 1/0;');
    await expect(migrate(db.pool, dir)).rejects.toThrow(/0001_bad.sql failed/);
    const { rows } = await db.pool.query("SELECT to_regclass('public.half') AS t");
    expect(rows[0].t).toBeNull();
    const rec = await db.pool.query("SELECT 1 FROM public.schema_migrations WHERE version = '0001_bad.sql'");
    expect(rec.rowCount).toBe(0);
  });
});
