# Reliability

Failure scenarios, retry and idempotency behaviour, and measured results for the private AWS CSMS.

**This file holds evidence, not targets.** A figure appears in the measured-results table only when it comes from an executed test or an observed run, with its date, environment and method. Where no such result exists, the topic reads "not yet measured".

**Status:** Describes current state. No latency, throughput, recovery-time or capacity measurement has been recorded yet.

**Related:** [architecture](architecture.md) · [ADR 0001](adr/0001-phase-0-1-decisions.md) · [ADR 0002 locking](adr/0002-locking-strategy.md) · [ADR 0003 repository port](adr/0003-repository-port.md) · [ADR 0004 single AWS account](adr/0004-single-aws-account-environments.md)

## 1. Targets (not results)

These targets come from [architecture section 1](architecture.md#1-goals-and-scope). They are goals that require load testing. Nothing in this file claims they are met.

| Target | Value | Status |
|---|---|---|
| Concurrently connected stations | 10,000 | target, not yet measured |
| Concurrent charging sessions | 5,000 | target, not yet measured |
| Availability objective | 99.9% | target, not yet measured |

## 2. Failure scenarios

"Evidence" links to an automated test that checks the behaviour (pass/fail). Such a test shows the behaviour exists. It is not a measurement and does not appear in the measured-results table. "none yet" means no ADR records the scenario, and "not yet exercised" means no test covers it.

| Scenario | Expected behaviour | ADR | Architecture section | Evidence |
|---|---|---|---|---|
| Concurrent boots for one station from two gateway replicas | Boots for the same station are serialized by a row lock (`SELECT ... FOR UPDATE`). The second boot waits, then sees the first boot's committed state. Boots for different stations do not block each other. | [ADR 0002](adr/0002-locking-strategy.md), [ADR 0001](adr/0001-phase-0-1-decisions.md) (D6) | [3.1](architecture.md#31-ocpp-gateway--ecs-fargate), [7](architecture.md#7-reliable-processing-patterns) | [boot-flow.test.ts](../tests/integration/boot-flow.test.ts) ("serializes concurrent boots"). Behaviour test only. Lock wait beyond `statement_timeout` is not tested (see ADR 0002 assumption). |
| Duplicate or reordered SQS delivery | Consumers must be idempotent and tolerate reordering (inbox unique keys, `seqNo` ordering for OCPP 2.0.1). **Assumption:** not implemented. ADR 0001 D11 states that no SQS exists yet. | none yet | [5](architecture.md#5-processing-contracts-ocpp-calls), [7](architecture.md#7-reliable-processing-patterns) | not yet exercised |
| Lost HTTP response after commit (synchronous call) | The domain state is committed. The station's retry with the same message id returns the stored decision. A new message id is a new boot. A late Control reply times out at the station. | [ADR 0001](adr/0001-phase-0-1-decisions.md) (D4, D5) | [5](architecture.md#5-processing-contracts-ocpp-calls) | [failures.test.ts](../tests/reliability/failures.test.ts) ("commit-then-response-loss"), [boot-flow.test.ts](../tests/integration/boot-flow.test.ts) ("returns the stored decision for a retried boot request"). Behaviour tests only. |
| Control service unavailable at handshake or boot | Handshake fails closed with HTTP 503. Boot returns CALLERROR `InternalError` without fabricating a decision. Heartbeat is answered locally and is unaffected. | [ADR 0001](adr/0001-phase-0-1-decisions.md) (D1, D3, A5) | [5](architecture.md#5-processing-contracts-ocpp-calls) | [failures.test.ts](../tests/reliability/failures.test.ts) ("Control unreachable", "database down"). Behaviour tests only. |
| Redis outage with commands pending | Architecture direction: pause new cross-instance command dispatch instead of relying on stale ownership. **Assumption:** not implemented. ADR 0001 A1 states that Phase 1 has no Redis and D9 defers cross-instance fencing to Phase 4. | none yet | [7](architecture.md#7-reliable-processing-patterns) (Distributed WebSocket ownership) | not yet exercised |
| Database failover during a request | Architecture direction: RDS Multi-AZ. The in-flight request fails, and the station retries. **Assumption:** the exact client-visible behaviour is unknown. ADR 0001 D11 sets Multi-AZ to false in dev, so a real failover cannot be exercised there today. The "database down" test only simulates an unreachable database. | none yet | [9](architecture.md#9-aws-infrastructure) | not yet exercised (see the "database down" test above for the unreachable-database case) |

A scenario without an ADR is a signal to write one, or to record why none applies.

## 3. Retries and idempotency

| Path | Mechanism | Source | Evidence |
|---|---|---|---|
| Boot (gateway to Control) | No gateway retry. The station's own retry is the retry. Timeouts: handshake auth 3 s, Boot 5 s. | [ADR 0001](adr/0001-phase-0-1-decisions.md) D3, D10 | [failures.test.ts](../tests/reliability/failures.test.ts) (behaviour only; the timeout values are not measured here) |
| Boot replay | Unique key `(station_id, connection_id, ocpp_message_id)` on `station.boot_event` stores the full decision. A replay under the row lock returns the stored decision. | [ADR 0001](adr/0001-phase-0-1-decisions.md) D5 | [boot-flow.test.ts](../tests/integration/boot-flow.test.ts) (behaviour only) |
| Boot ordering | `last_boot_at` uses `GREATEST`, so a late-applied older boot cannot move it backwards. | [ADR 0001](adr/0001-phase-0-1-decisions.md) D6 | not yet exercised |
| Per-station serialization | Pessimistic row lock (rule L1). Optimistic row version (rule L2) is a rule for future code and is not used today. | [ADR 0002](adr/0002-locking-strategy.md) | see the first scenario row |
| Database timeouts | The pool sets `statement_timeout` to 5 s and `idle_in_transaction_session_timeout` to 10 s. No `lock_timeout` is set. | [ADR 0002](adr/0002-locking-strategy.md) | not yet exercised |
| Async inbound events (SQS), outbox, command retries | Described in [architecture section 7](architecture.md#7-reliable-processing-patterns). **Assumption:** not implemented yet. | none yet | not yet exercised |

## 4. Measured results

Only rows with all seven cells filled are allowed. Environment is one of `local`, `dev` or `prod`. Date is ISO 8601.

| Topic | Metric | Value | Date | Environment | Method | Evidence link |
|---|---|---|---|---|---|---|
| _no measured results yet_ | | | | | | |

Topics without a measured result:

| Topic | Status |
|---|---|
| Latency (for example OCPP response time, p50/p95/p99) | not yet measured |
| Throughput (connections, messages per second, sessions) | not yet measured |
| Recovery time (gateway drain and reconnect, database failover, dependency restoration) | not yet measured |
| Operational limits (see section 5) | not yet measured |

## 5. Operational limits

Limits are recorded only after they are measured.

| Limit | Status |
|---|---|
| Maximum concurrent WebSocket connections per gateway task | not yet measured |
| Handshake authentication cost under a reconnect storm (scrypt per handshake, see [ADR 0001](adr/0001-phase-0-1-decisions.md) open decisions) | not yet measured |
| Database connection pool pressure | not yet measured |
| Shared AWS account quotas. All environments share one account ([ADR 0004](adr/0004-single-aws-account-environments.md)), so load tests on `dev` can consume quota that `prod` needs. Measure which quotas a load run uses before any large `dev` test. | not yet measured |

## 6. Evidence locations

- `tests/reliability` exists and holds [failures.test.ts](../tests/reliability/failures.test.ts), which checks failure behaviour. It does not record measurements. Evidence directories for measured runs, with stored run output, are planned.
- `tests/load` does not exist yet. Load profiles toward the targets in section 1 are planned.
- Each measured row links to the test that produced it and to where its run output is stored.

## 7. Maintenance rule

**R1.** A change to retry, idempotency, locking, timeout or capacity behaviour updates this file in the same pull request. Update the scenario rows, the retries table and any measured result the change invalidates. If nothing here is affected, say "not applicable" in the pull request description.
