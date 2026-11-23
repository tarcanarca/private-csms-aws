import type {
  BootDecision,
  BootRequest,
  CreateStationRequest,
  StationView,
} from '@csms/contracts';
import { decideBoot, type StationPolicy } from '@csms/domain-stations';
import {
  findBootDecision,
  getCredentialHash,
  getStation,
  insertStation,
  listStations,
  lockStation,
  recordBoot,
  withTransaction,
  type Pool,
} from '@csms/persistence';
import { dummyHash, generateStationPassword, hashPassword, verifyPassword } from './password.js';

export class StationService {
  constructor(
    private readonly pool: Pool,
    private readonly policy: StationPolicy,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Constant-work credential check; unknown stations still pay one hash verification. */
  async authenticate(stationId: string, password: string): Promise<boolean> {
    const stored = await getCredentialHash(this.pool, stationId);
    const ok = await verifyPassword(password, stored ?? (await dummyHash()));
    return stored !== null && ok;
  }

  /**
   * Durability boundary: the returned decision exists only after COMMIT.
   * Idempotent on (station, connectionId, ocppMessageId): a retry returns the stored decision.
   */
  async boot(req: BootRequest): Promise<BootDecision> {
    return withTransaction(this.pool, async (tx) => {
      const station = await lockStation(tx, req.stationId);
      if (station === null) {
        return decideBoot(null, this.policy, this.clock()); // nothing persisted for unknown stations
      }
      const prior = await findBootDecision(tx, req.stationId, req.connectionId, req.ocppMessageId);
      if (prior !== null) return prior;
      const decision = decideBoot(station, this.policy, this.clock());
      await recordBoot(tx, req, decision);
      return decision;
    });
  }

  async createStation(
    req: CreateStationRequest,
  ): Promise<{ station: StationView; password: string }> {
    const password = generateStationPassword();
    const station = await insertStation(
      this.pool,
      req.stationId,
      req.registrationStatus,
      await hashPassword(password),
    );
    return { station, password };
  }

  getStation(stationId: string): Promise<StationView | null> {
    return getStation(this.pool, stationId);
  }

  list(limit: number, after?: string): Promise<StationView[]> {
    return listStations(this.pool, limit, after);
  }
}
