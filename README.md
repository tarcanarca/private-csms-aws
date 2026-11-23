# private-csms-aws

Private-network CPO charging station management system (OCPP 1.6J / 2.0.1) on AWS. Architecture baseline:
[`docs/architecture.md`](docs/architecture.md). Decisions: [`docs/adr/`](docs/adr/).

## Documentation

| Path | Purpose |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Architecture baseline: components, boundaries and data flow. |
| [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) | Environments and how they are configured. |
| [`docs/DELIVERY.md`](docs/DELIVERY.md) | Build, CI and delivery process. |
| [`docs/RELIABILITY.md`](docs/RELIABILITY.md) | Reliability expectations and failure-handling behavior. |
| [`docs/TESTING.md`](docs/TESTING.md) | Test strategy, test layers and how to run them. |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records (index in `docs/adr/README.md`). |
| [`AGENTS.md`](AGENTS.md) | Instructions and conventions for AI coding agents working in this repository. |

## Status

Phase 0 (foundations) and the first Phase 1 slice are implemented: OCPP 1.6J `BootNotification` (sync, persisted) and
`Heartbeat` (gateway-local) over a real WebSocket gateway, backed by Charging Control and PostgreSQL.
Everything else in the architecture is **not built yet**. See ADR-0001 for what is and is not covered.

## Layout

```
apps/ocpp-gateway        WebSocket / OCPP-J adapter (protocol only; no business rules)
apps/charging-control    Fastify HTTP API; domain modules; owns all DB writes
packages/contracts       Version-independent DTOs (zod) shared by gateway and control
packages/ocpp-1.6        Frames, error codes, OCA JSON schemas, 1.6 <-> canonical adapters
packages/domain/stations Pure station rules (no I/O)
packages/persistence     pg pool, transactions, migrator, SQL migrations, repositories
packages/observability   Structured logger with redaction
tests/                   protocol (contract), integration, reliability (failure paths), support (charger harness)
infrastructure/terraform Skeleton (network, 2 ALBs, ECS, RDS); validated, never applied
```

## Run it

```bash
npm ci
npm run db:up                  # PostgreSQL 16 on localhost:5433 (docker compose)
npm run build
npm run typecheck && npm run lint
npm test                       # unit + protocol contract + integration + failure-path (needs db:up)
npm run test:unit              # no database needed

# run the real processes
export DATABASE_URL=postgres://csms:csms@localhost:5433/csms INTERNAL_API_TOKEN=dev-internal OPERATOR_API_TOKEN=dev-operator
npm run migrate
PORT=8080 node apps/charging-control/dist/main.js &
CONTROL_BASE_URL=http://127.0.0.1:8080 PORT=9001 node apps/ocpp-gateway/dist/main.js &
curl -s -XPOST localhost:8080/api/v1/stations -H 'authorization: Bearer dev-operator' \
  -H 'content-type: application/json' -d '{"stationId":"CP001"}'    # returns the one-time password
# connect a charger to ws://localhost:9001/ocpp/CP001 with subprotocol ocpp1.6 and Basic auth CP001:<password>
```

Docker: `docker build --build-arg APP=charging-control -t csms/charging-control .` (same for `ocpp-gateway`).
Terraform (validate only): `cd infrastructure/terraform/environments/dev && terraform init -backend=false && terraform validate`.

## Configuration

Control: `DATABASE_URL`, `INTERNAL_API_TOKEN`, `OPERATOR_API_TOKEN` (required, must differ), `PORT`, `DB_POOL_MAX`,
`HEARTBEAT_INTERVAL_SECONDS`, `BOOT_RETRY_INTERVAL_SECONDS`.
Gateway: `CONTROL_BASE_URL`, `INTERNAL_API_TOKEN` (required), `PORT`, `AUTH_TIMEOUT_MS`, `BOOT_TIMEOUT_MS`,
`REQUIRE_FORWARDED_HTTPS`, `MAX_PAYLOAD_BYTES`, `MAX_QUEUED_CALLS`, `PING_INTERVAL_MS`, `DRAIN_TIMEOUT_MS`.
