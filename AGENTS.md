# AGENTS.md

Private-network CPO charging station management system (OCPP 1.6J / 2.0.1) on AWS. Phase 0 and the first Phase 1 slice are built (BootNotification and Heartbeat over a WebSocket gateway, backed by Charging Control and PostgreSQL); the rest of the architecture is not built yet.

## Layout

Details: [docs/architecture.md](docs/architecture.md).

```
apps/ocpp-gateway        WebSocket / OCPP-J adapter (protocol only; no business rules)
apps/charging-control    Fastify HTTP API; domain modules; owns all DB writes
packages/contracts       Version-independent DTOs (zod)
packages/ocpp-1.6        Frames, error codes, schemas, 1.6 <-> canonical adapters
packages/domain/stations Pure station rules (no I/O)
packages/persistence     pg pool, transactions, migrator, SQL migrations, repositories
packages/observability   Structured logger with redaction
tests/                   protocol, integration, reliability, support
infrastructure/terraform Skeleton; validated, never applied
```

## Commands

```bash
npm run typecheck         # tsc -b plus tests project
npm run lint              # eslint
npm run test:unit         # no database needed
npm run db:up             # start PostgreSQL (docker compose)
npm run test:integration  # needs db:up
```

## Workflow rules

Source of truth: [docs/DELIVERY.md](docs/DELIVERY.md) section 9. Same IDs; update both in the same pull request (W5).

- **W1.** Each change starts in a new git worktree on a dedicated branch.
- **W2.** Verify the change with the methods explicitly provided for it. If none are provided, run the existing tests. Do this before opening a pull request.
- **W3.** Open a GitHub pull request after verification. A human reviews every pull request before merge, including AI-assisted ones.
- **W4.** Every architectural change gets an ADR in `docs/adr/`.
- **W5.** When W1 to W4, L1, L2 or P1 change, update `docs/DELIVERY.md`, the Steering_Files in `.kiro/steering/` and `AGENTS.md` in the same pull request.
- **R1.** A change to retry, idempotency, locking, timeout or capacity behaviour updates [RELIABILITY](docs/RELIABILITY.md) in the same pull request.
- **L1.** Use pessimistic locking (`SELECT ... FOR UPDATE`) for short per-station serialization, such as boot handling across gateway replicas.
- **L2.** Use optimistic row-version locking for low-contention updates.
- **P1.** Application and domain code depend on repository ports, not on database clients.

## Boundaries

- Do not change source, Terraform or CI outside the scope of your task.
- Do not install skills without approval.
- No production actions (no Terraform apply to `prod`, no deploys).
- Ask before architectural changes.
- Humans review every pull request; agents do not merge.

## Documentation index

- [docs/architecture.md](docs/architecture.md): architecture baseline
- [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md): environments
- [docs/DELIVERY.md](docs/DELIVERY.md): pipeline, quality gates, workflow rules
- [docs/RELIABILITY.md](docs/RELIABILITY.md): retry, idempotency, locking, timeouts, capacity
- [docs/TESTING.md](docs/TESTING.md): test layers and commands
- [docs/adr/README.md](docs/adr/README.md): architecture decision records
