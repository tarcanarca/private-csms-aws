# ADR 0003: Introduce a repository port between persistence and the station service

## Status

Accepted; implementation pending.

## Date

2026-11-23

## Deciders

Project owner.

## Context

`StationService` in `apps/charging-control/src/station-service.ts` takes a `pg` `Pool` in its constructor. It imports free functions from `@csms/persistence` (`getCredentialHash`, `getStation`, `insertStation`, `listStations`, `lockStation`, `findBootDecision`, `recordBoot`, `withTransaction`) and calls them directly. The application layer therefore depends on the database client and on the concrete persistence module. Testing the service requires a real PostgreSQL instance.

[ADR 0002](0002-locking-strategy.md) keeps `lockStation()` as a `SELECT ... FOR UPDATE` inside `withTransaction`. Any abstraction must keep that lock and the transaction it runs in on the same boundary.

## Decision

The station service depends on a `StationRepository` port. The domain or application layer owns the interface. `packages/persistence` implements it with PostgreSQL. This is rule P1: application and domain code depend on repository ports, not on database clients.

Illustrative shape (not implemented by this ADR):

```typescript
export interface StationRepository {
  withTransaction<T>(work: (tx: StationTx) => Promise<T>): Promise<T>;
}

export interface StationTx {
  lockStation(stationId: string): Promise<StationLockRow | null>;
  recordBoot(input: RecordBootInput): Promise<void>;
  insertStation(input: NewStation): Promise<void>;
  listStations(): Promise<StationSummary[]>;
}
```

Transaction scope stays on the port. `lockStation()` is only reachable through a `StationTx`, so the lock from ADR 0002 keeps its transaction boundary and cannot be taken outside one.

The port refactor is a separate follow-up task. This ADR records the target and does not change code.

## Alternatives considered

- **Keep direct imports.** Simplest and matches today's code. Couples the service to `pg` and forces a database in every service test.
- **ORM repository.** Gives a repository abstraction out of the box. Conflicts with the decision in [ADR 0001](0001-phase-0-1-decisions.md) (D7) to use `pg` with hand-written SQL, and with the ORM question in architecture section 13 item 10.
- **Port only for new modules.** Avoids touching existing code. Leaves two styles in one codebase and keeps the station service coupled, which is the case that motivated this ADR.

## Consequences

- Unit tests of `StationService` can use an in-memory fake of `StationRepository` and need no database.
- There is one more interface to maintain, and the PostgreSQL implementation must stay in step with it.
- The current code does not match this ADR. `StationService` still imports persistence functions and a `Pool` directly. Until the follow-up refactor lands, the status stays "Accepted; implementation pending".
- Integration tests against real PostgreSQL remain necessary for the implementation, in particular for locking behaviour.

## Open question

Where the interface lives. `packages/domain/stations` is the candidate, since the service already imports from it. The follow-up task decides this and updates this ADR.

## Related

- [ADR 0002: Locking strategy](0002-locking-strategy.md)
- [ADR 0001: Phase 0/1 decisions](0001-phase-0-1-decisions.md)
- [Architecture](../architecture.md)
- Source: `apps/charging-control/src/station-service.ts`, `packages/persistence/src/station-repository.ts`
