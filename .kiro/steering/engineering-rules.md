---
inclusion: always
---

# Engineering rules

Source of truth: [DELIVERY.md section 9](../../docs/DELIVERY.md). Update this file in the same pull request as any change to L1, L2 or P1 there.

## Read first

- [docs/architecture.md](../../docs/architecture.md)
- [docs/ENVIRONMENTS.md](../../docs/ENVIRONMENTS.md)

## L1. Pessimistic locking for short per-station serialization

- Use pessimistic locking (`SELECT ... FOR UPDATE`) for short per-station serialization, such as boot handling across gateway replicas.
- Rationale: the operation is short and hot, so waiting on a row lock is cheaper and simpler than retrying failed optimistic updates. See [ADR 0002](../../docs/adr/0002-locking-strategy.md).
- Do not change `lockStation()` without a new ADR.

## L2. Optimistic locking for low-contention updates

- Use optimistic row-version locking for low-contention updates.
- Rationale: conflicts are rare, so holding no lock avoids blocking, and a rare retry is acceptable. See [ADR 0002](../../docs/adr/0002-locking-strategy.md).

## P1. Depend on repository ports

- Application and domain code depend on repository ports, not on database clients.
- Rationale: the domain stays independent of the database and can be unit tested with in-memory fakes. See [ADR 0003](../../docs/adr/0003-repository-port.md).
- Note: the current station service does not yet follow this rule.

## Environments

- Do not mix prod resources, secrets or state under dev names or roles.
- Name resources `csms-<env>-...`, for example `csms-dev-...` and `csms-prod-...`.
