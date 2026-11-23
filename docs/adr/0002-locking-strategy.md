# ADR 0002: Keep pessimistic row locking in `lockStation()`

## Status

Accepted

## Date

**Assumption:** date to be set to the merge date of the pull request that adds this ADR (not verifiable from the repository).

## Deciders

**Assumption:** project owner and maintainers; to be confirmed in pull request review.

## Context

A station can send `BootNotification` through any gateway replica. Two boots for the same station can therefore reach `charging-control` at the same time. Handling a boot is a read-decide-write sequence: read the station's registration status, look for a stored decision for the same message, decide, and record the boot. Without per-station serialization, concurrent boots could interleave these steps.

Current implementation (verified in the repository):

- `lockStation(q, stationId)` in `packages/persistence/src/station-repository.ts` runs `SELECT station_id, registration_status FROM station.station WHERE station_id = $1 FOR UPDATE` and returns `null` when the station does not exist.
- `StationService.boot()` in `apps/charging-control/src/station-service.ts` calls `withTransaction(this.pool, ...)` from `packages/persistence/src/db.ts`. Inside the transaction it calls `lockStation()`, then `findBootDecision()`, `decideBoot()` and `recordBoot()`. The decision is returned only after `COMMIT`.
- For an unknown station, `boot()` returns the decision without persisting anything.
- `recordBoot()` sets `last_boot_at` with `GREATEST(...)`, so a late-applied older boot cannot move it backwards. ADR 0001 (D5, D6) records the boot idempotency key and the use of the row lock.
- `createPool()` in `packages/persistence/src/db.ts` sets `statement_timeout` to 5 s and `idle_in_transaction_session_timeout` to 10 s. It sets no `lock_timeout`.

A boot holds the lock only for the duration of its transaction. No row-version column exists on `station.station` today.

## Decision

Keep `SELECT ... FOR UPDATE` in `lockStation()` unchanged. Adopt the following locking rule for persistence operations:

- **L1.** Use pessimistic locking (`SELECT ... FOR UPDATE`) for short per-station serialization.
- **L2.** Use optimistic row-version locking for low-contention updates.

L2 is a rule for future code. No existing operation uses a row version, and this ADR does not add one.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Optimistic row version with retry | A boot is a short operation that two replicas can contend on for one station. Retries add a failure path and extra round trips to a synchronous call that has a 5 s budget (ADR 0001 D3). It also needs a new column and migration. |
| PostgreSQL advisory locks (`pg_advisory_xact_lock`) | Works without a row, but lock keys live outside the schema and are harder to trace. The row lock already ties the lock to the data it protects. |
| Redis lock | Adds a dependency to the boot path. The architecture does not make Redis a source of truth, and ADR 0001 A1 keeps Redis out of Phase 1. |
| Unique constraints only | The unique key on `(station_id, connection_id, ocpp_message_id)` protects against duplicate inserts, but it cannot serialize the read-decide-write sequence for different message ids. |

## Consequences

- Keep the locked transaction short. Do the work that needs the lock and nothing else.
- Make no network calls inside the lock. Hashing, HTTP and queue calls happen before or after the transaction.
- A concurrent boot for the same station waits for the lock instead of failing. Boots for different stations do not block each other.
- If the station row does not exist, nothing is locked and `lockStation()` returns `null`.
- Lock wait is bounded only by the pool's `statement_timeout` (5 s), which also bounds the statement. No explicit `lock_timeout` is configured. Adding one is a follow-up and is not part of this ADR.
- **Assumption:** under the current pool settings, a statement that waits for the lock longer than `statement_timeout` fails and the boot surfaces as an `InternalError` CALLERROR (ADR 0001 D3). This has not been verified by a test.
- `lockStation()` is left unchanged by this change.
- A change to locking behaviour updates [RELIABILITY](../RELIABILITY.md) in the same pull request (rule R1).
- Changing `lockStation()` later requires a new ADR.

## Related

- [ADR 0001: Phase 0/1 defaults and resolutions](0001-phase-0-1-decisions.md) (D5 lost-response safety, D6 concurrency)
- [Reliability](../RELIABILITY.md): concurrent boots scenario
- [Architecture](../architecture.md)
