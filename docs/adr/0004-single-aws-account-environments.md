# ADR 0004: Single AWS account with per-environment isolation

## Status

Accepted

## Date

**Assumption:** date to be set to the merge date of the pull request that adds this ADR (not verifiable from the repository).

## Deciders

**Assumption:** project owner and maintainers; to be confirmed in pull request review. The owner rejected a staging environment (see Alternatives considered).

## Context

`docs/architecture.md` section 13, item 9 and ADR 0001 ("Owner decisions still open") list the AWS account/environment strategy as undecided. The platform is a private CSMS with a small team, so the cost and operating overhead of several AWS accounts matter.

The environments are `local`, `dev` and `prod`. There is no staging environment.

- `local` runs on a developer machine with Docker Compose.
- `dev` runs in AWS and is provisioned by `infrastructure/terraform/environments/dev`. It is the only AWS environment that exists today.
- `prod` runs in AWS. It is planned and not provisioned. No `infrastructure/terraform/environments/prod` exists.

Terraform state is local today. The remote backend is still open (ADR 0001).

## Decision

Use one AWS account for all AWS environments (`dev` and, later, `prod`). Isolate the environments by convention and by IAM, not by an account boundary:

- **IAM roles.** Each environment has its own task, execution and CI roles. Permissions are scoped to resources whose names contain the environment token. No role is shared between `dev` and `prod`.
- **Resource naming.** Every AWS resource name identifies its environment, for example `csms-<env>-<resource>`.
- **Secret paths.** Secrets live under a per-environment path, for example `/csms/<env>/<service>/<name>`.
- **Terraform state keys.** Each environment has its own state key and lock entry, for example `csms/<env>/terraform.tfstate`. This applies once a remote backend exists.

The exact conventions are defined in [Environments](../ENVIRONMENTS.md).

This ADR settles only the account/environment part of the open list in ADR 0001. The AWS region and the Terraform state backend stay open. ADR 0001 is not edited.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| One AWS account per environment | Gives the strongest blast-radius isolation and allows account-level service control policies. It also adds account setup, cross-account roles and billing overhead that a small private platform does not need yet. |
| Separate account for `prod` only | A middle path that isolates production from dev experiments and load tests. Deferred, not rejected. It becomes the next step if the revisit trigger below fires. |
| A staging environment | Rejected by the owner. Changes go from `local` to `dev` to `prod`. |

## Consequences

- Isolation is weaker than with separate accounts. A mistaken credential, policy or Terraform run can reach the other environment, so role scoping and naming must be applied consistently.
- Account-level service control policies (SCPs) are not available, so guardrails rely on IAM policies and review.
- Account quotas are shared. Load tests on `dev` can consume quota that `prod` needs. [Reliability](../RELIABILITY.md) records this as an operational limit to measure.
- Anything that must differ between environments (names, secret paths, state keys, roles) has to be checked in review, because the account does not enforce it.
- Revisit trigger: the first real production users, or a compliance or customer requirement for stronger isolation. At that point, evaluate a separate `prod` account.
- Architecture section 13, item 9 narrows to the remaining open topics: region, AZ count, VPC egress/NAT/VPC endpoints, costs and quotas.

## Related

- [ADR 0001: Phase 0/1 defaults and resolutions](0001-phase-0-1-decisions.md) (open list: AWS region/account strategy, Terraform state backend)
- [Environments](../ENVIRONMENTS.md)
- [Architecture](../architecture.md) (section 13, item 9)
- [Reliability](../RELIABILITY.md)
