# Testing

How tests are organised and run in this repository, and how reliability and load runs feed [RELIABILITY](RELIABILITY.md).

Status: describes the current state, verified against `package.json`, `vitest.config.ts` and `tests/` on the day this file was written. Cloud testing is planned.

Related: [DELIVERY](DELIVERY.md) (CI gates and the change workflow), [ENVIRONMENTS](ENVIRONMENTS.md) (`local`, `dev`, `prod`), [RELIABILITY](RELIABILITY.md) (scenarios and measured evidence), [architecture](architecture.md).

## Test layers

| Location | Purpose | Vitest project | Runs where | Status |
|---|---|---|---|---|
| `*.test.ts` next to source (`packages/**/src`, `apps/**/src`) | Pure logic and unit behavior | `unit` | local, CI job `node` | Exists (5 files, for example `session.test.ts`, `password.test.ts`) |
| `tests/protocol` | OCPP 1.6 schema and contract tests (BootNotification, Heartbeat) and vendored schema provenance | `unit` | local, CI | Exists (2 files). OCPP 2.0.1 is not covered. |
| `tests/integration` | Gateway and control service with a real PostgreSQL: boot flow across two gateway replicas, handshake security, HTTP API, migrator | `integration` | local (Compose Postgres), CI (Postgres service container) | Exists (2 files) |
| `tests/reliability` | Failure paths: commit failure, database down, control service unreachable, response loss after commit, protocol abuse, connection lifecycle and drain | `integration` | local today | Exists (1 file, `failures.test.ts`). Runs against local fakes and fault injection, not against AWS. |
| `tests/load` | Connection and session load profiles toward the targets in [RELIABILITY](RELIABILITY.md) | none | `dev` only | Planned. The directory does not exist. |
| `tests/support` | Shared helpers: `charger.ts` (charger harness), `db.ts` (isolated database per test), `faults.ts`, `stack.ts` | not a test project | used by the layers above | Exists |

Notes:

- `tests/reliability` runs in the `integration` project, so `npm run test:integration` includes it.
- `tests/integration` and `tests/reliability` need PostgreSQL. `tests/support/db.ts` fails with an error, and does not skip, when the database is unreachable. It reads `TEST_DATABASE_ADMIN_URL` and defaults to `postgres://csms:csms@localhost:5433/postgres`.

## Local versus cloud tests

Local tests verify application behavior. Cloud tests verify the deployed system and its AWS integrations.

| | Local | Cloud |
|---|---|---|
| Environment | `local` (see [ENVIRONMENTS](ENVIRONMENTS.md)) | `dev`, after a dev deployment |
| Infrastructure | Docker Compose PostgreSQL | Deployed ECS services, ALB, RDS and other AWS resources |
| Test kinds | Unit, protocol, integration, reliability (fault injection in-process) | Smoke, reliability and load |
| What it proves | Application logic, protocol conformance, failure handling in code | The deployed system is reachable and wired correctly (networking, IAM, secrets, load balancer, database) and holds up under load |
| Status | Exists | Planned. No deploy or smoke job exists in CI (see [DELIVERY](DELIVERY.md)). |

Rules for cloud tests:

- Cloud tests run against `dev` only.
- Cloud tests never target `prod` without explicit approval.
- Load tests on `dev` share the single AWS account with `prod`, so they can use quota that `prod` needs (see [ENVIRONMENTS](ENVIRONMENTS.md)).
- Run cloud smoke tests only after a successful dev deployment.

**Assumption:** the cloud smoke, reliability and load suites will be placed under `tests/` (`tests/reliability`, `tests/load`) and selected by an environment variable or separate script. No such mechanism exists yet.

## Commands

Scripts from the root `package.json`:

| Command | What it does |
|---|---|
| `npm run db:up` | Starts the Compose `postgres` service and waits until it is healthy |
| `npm run db:down` | Stops the Compose stack |
| `npm test` | `vitest run`: all projects (`unit` and `integration`). Needs PostgreSQL. |
| `npm run test:unit` | `vitest run --project unit`: source tests and `tests/protocol`. No database needed. |
| `npm run test:integration` | `vitest run --project integration`: `tests/integration` and `tests/reliability`. Needs PostgreSQL. |
| `npm run typecheck` | `tsc -b` plus `tsc -p tests/tsconfig.json` |
| `npm run lint` | `eslint .` |

Local run:

```sh
npm run db:up
npm test
npm run db:down
```

CI runs `typecheck`, `lint`, `test:unit` and `test:integration` in job `node`. The gates and merge rules are in [DELIVERY](DELIVERY.md) and are not repeated here.

There are no scripts for cloud smoke or load tests yet.

## Property-based testing

Use property-based tests for pure logic where a rule holds for many inputs:

- OCPP frame and message adapters (parse then serialize round trips, rejection of malformed input).
- Idempotency keys and retry decisions.
- Sequence ordering and duplicate handling.
- Validation functions with defined input ranges.

Do not use them for Terraform, service wiring, HTTP routes with a fixed contract, or tests that need a database and take long per run. Use example-based tests there.

Guidelines:

- State the property in one sentence in the test name or a comment, and name the requirement or rule it supports.
- Write generators that produce valid inputs for the domain, not arbitrary strings.
- Keep a failing counterexample as a fixed example test.

**Assumption:** no property-based testing library is a dependency today (none is listed in the root `package.json`). Adding one, such as `fast-check`, needs a dependency decision.

## Linking tests to RELIABILITY.md

[RELIABILITY](RELIABILITY.md) holds evidence. This file holds how the evidence is produced. The two files link both ways:

1. **Test to scenario.** Each reliability or load test names the RELIABILITY.md scenario row it supports, in the `describe` or `it` title or a comment directly above it. Example: `// RELIABILITY: Concurrent boots for one station`.
2. **Scenario to test.** Each scenario row and each measured result row in [RELIABILITY](RELIABILITY.md) links to the test file that produced it under `tests/reliability` or `tests/load`, and to the location of the run output.
3. **Measured values.** A figure goes into RELIABILITY.md only with value, date, environment, method and a link to the test. Local runs are recorded as `local` and are not presented as cloud results.
4. **Same PR.** A change to retry, idempotency, locking, timeout or capacity behavior updates the test and RELIABILITY.md in the same pull request (rule R1 in [DELIVERY](DELIVERY.md)).

Today `tests/reliability/failures.test.ts` covers failure paths but its tests do not yet carry scenario references. Adding them belongs with the creation of RELIABILITY.md.

## Why this file exists

This file separates how tests are built and run (directories, harness, local versus cloud, evidence handling) from the delivery pipeline described in [DELIVERY](DELIVERY.md). DELIVERY.md keeps one paragraph and a link to this file.
