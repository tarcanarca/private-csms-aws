# ADR-0001: Phase 0/1 defaults and resolutions

Status: accepted (provisional defaults; see "Owner decisions still open")
Date: 2026-11-19
Baseline: `docs/architecture.md` v1.0

Each entry records a decision that `docs/architecture.md` left open or ambiguous, the conservative default
taken for the first slice, and what would change it.

## Ambiguities in the baseline and how they are resolved

| # | Ambiguity | Resolution |
|---|---|---|
| A1 | Phase 1 acceptance says "multiple gateway replicas", but Redis leases are Phase 4. | Phase 1 has no Redis. Replicas share state only through Control/PostgreSQL. Boot and Heartbeat need no cross-instance routing. Integration tests run two gateway instances against one Control. |
| A2 | Heartbeat is "gateway-local" yet connectivity must not live only in gateway memory (section 5). | Heartbeat is answered locally with no I/O. Persisted connectivity/last-seen is deliberately **not** built yet; it is the first item of the Phase 2 connectivity work. |
| A3 | Is Heartbeat valid before an accepted BootNotification on a socket? A reconnecting station need not re-boot. | Heartbeat is answered unless a BootNotification on **this connection** returned Rejected, in which case `SecurityError`. |
| A4 | OCPP 1.6 vs 2.0.1 error codes differ (`FormationViolation`/`FormatViolation`, `OccurenceConstraintViolation` spelling). | Error codes live in `packages/ocpp-1.6`. A future `packages/ocpp-2.0.1` has its own table; no shared enum. |
| A5 | "Business denial is a normal CALLRESULT": what is denial for Boot? | Unknown station: `Rejected`. Known with registration `Pending`/`Rejected`: that status. Dependency failure/timeout: CALLERROR `InternalError`. |
| A6 | Section 6: schema names "to finalize". | `station` now; `access`, `session`, `operation`, `messaging` created by the phase that first needs them. `public.schema_migrations` tracks migrations. |
| A7 | Section 3.4 says the coordinator may touch outbox tables directly while others must use APIs. | Not exercised in Phase 1. Unchanged; revisit in Phase 2 when the outbox lands. |

## Decisions

- **D1 Station identity (baseline 13.2).** Path `/ocpp/{stationId}` + HTTP Basic (OCPP 1.6 security profile 2 shape). TLS terminates at the public ALB; the gateway can require `X-Forwarded-Proto: https` (`REQUIRE_FORWARDED_HTTPS`, on in Terraform). Username must equal the path id. Passwords are server-generated (128-bit hex), shown once, stored as salted scrypt. Unknown station and wrong password are indistinguishable (one dummy hash verification). Control unreachable/misconfigured **fails closed** (503). mTLS / profile 3 and rotation are not decided.
- **D2 Client access path (13.1).** Operator API is private-only behind the internal ALB, bearer-token protected with a token distinct from the gateway's internal token. Static tokens are a placeholder; the real mechanism (SSO/JWT, SigV4, mTLS) is open.
- **D3 Sync budgets (13.4).** Handshake auth 3 s, Boot 5 s, no gateway retry. Timeout or any non-2xx from Control becomes CALLERROR `InternalError`; a decision is never fabricated. The station's own retry is the retry.
- **D4 Durability boundary for Boot.** Control returns only after `COMMIT`. The gateway answers only after Control answers. Tests prove: COMMIT failure produces CALLERROR and zero rows.
- **D5 Lost-response safety for Boot.** Unique key `(station_id, connection_id, ocpp_message_id)` on `station.boot_event`, storing the full decision. A replay under the row lock returns the stored decision (same `serverTime`). A *new* message id after a lost reply is a new boot, which is correct: Boot is repeatable. Boot-log growth from a boot-looping station is bounded only by the retry interval; a retention policy is open.
- **D6 Concurrency.** `SELECT ... FOR UPDATE` on the station row serializes boots for one station across replicas; `last_boot_at` uses `GREATEST` so a late-applied older boot cannot move it backwards.
- **D7 Persistence tooling.** `pg` + hand-written SQL; forward-only SQL migrations with checksums and an advisory lock; migrations run as a separate one-off task (`apps/charging-control/dist/migrate.js`), never on service start (rolling-deploy safety). No ORM (baseline 13.10).
- **D8 Protocol validation.** OCA draft-04 JSON Schemas are vendored (hash-pinned, `SOURCES.md`) and enforced on requests **and on our own responses**. Violation kinds map: `required` -> `OccurenceConstraintViolation`, `type` -> `TypeConstraintViolation`, other -> `PropertyConstraintViolation`; bad frame -> `FormationViolation` with id `-1` when no id is usable; unknown action -> `NotImplemented`; known-but-unbuilt -> `NotSupported`.
- **D9 Connection hygiene.** 64 KiB max frame (close 1009), text-only (1003), at most 8 queued calls (1008), 30 s server ping (also keeps the ALB idle timer alive), newest connection per station wins **per instance** (close 4000), drain closes with 1001 and fails `/readyz` first. Cross-instance fencing is Phase 4.
- **D10 Intervals.** Heartbeat 300 s, retry 60 s (env-configurable).
- **D11 AWS skeleton.** Region undecided (variable). One NAT gateway in dev (cost; single-AZ egress risk accepted for dev only). RDS Multi-AZ is a variable defaulting true in the module, false in dev. Secrets are created as empty containers; values are set out of band. No SQS, Redis, workers, WAF or Grafana yet.
- **D12 Tests live outside deployables.** The charger harness is `tests/support/charger.ts`; nothing in `apps/` or `packages/` imports it.

## Owner decisions still open (none block the slice)

Station security profile and credential rotation (13.2) · real operator/driver auth (13.1) · rate limiting of handshake auth (scrypt per handshake is CPU-heavy at reconnect-storm scale; a verified-credential cache or cheaper per-station token scheme should be evaluated before Phase 7) · AWS region/account strategy · Terraform state backend · boot-log retention.
