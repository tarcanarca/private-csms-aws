---
inclusion: always
---

# Workflow rules

Condensed copy of section 9 of [DELIVERY](../../docs/DELIVERY.md), which is the source of truth. Keep the IDs and rule wording identical (W5).

## W1. New worktree per change

- **Rule:** Each change starts in a new git worktree on a dedicated branch.

## W2. Verify before the pull request

- **Rule:** Verify the change with the methods explicitly provided for it. If none are provided, run the existing tests. Do this before opening a pull request.

## W3. Pull request and human review

- **Rule:** Open a GitHub pull request after verification. A human reviews every pull request before merge, including AI-assisted ones.

## W4. ADR for architectural changes

- **Rule:** Every architectural change gets an ADR in `docs/adr/`.

## W5. Keep the rule copies in sync

- **Rule:** When W1 to W4, L1, L2 or P1 change, update this document, the Steering_Files in `.kiro/steering/` and `AGENTS.md` in the same pull request.

## R1. Reliability document stays current

- **Rule:** A change to retry, idempotency, locking, timeout or capacity behaviour updates [RELIABILITY](../../docs/RELIABILITY.md) in the same pull request.

## Pull request description

List unverified statements as assumptions in the PR description, together with the verification performed.
