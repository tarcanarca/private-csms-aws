# Architecture Decision Records

An ADR records one architecture decision, its context and its consequences. New ADRs start from [TEMPLATE.md](TEMPLATE.md).

## Index

| Number | Title | Status | Link |
|---|---|---|---|
| 0001 | Phase 0/1 defaults and resolutions | Accepted (provisional defaults) | [0001-phase-0-1-decisions.md](0001-phase-0-1-decisions.md) |
| 0002 | Keep pessimistic row locking in `lockStation()` | Accepted | [0002-locking-strategy.md](0002-locking-strategy.md) |
| 0003 | Introduce a repository port between persistence and the station service | Accepted; implementation pending | [0003-repository-port.md](0003-repository-port.md) |
| 0004 | Single AWS account with per-environment isolation | Accepted | [0004-single-aws-account-environments.md](0004-single-aws-account-environments.md) |

ADR 0001 has a different shape from the others. It is a single document that collects several Phase 0/1 decisions
(ambiguity resolutions and open owner decisions) and uses a one-line `Status:` header instead of the
Status / Date / Deciders / Context sections defined in the template. ADRs 0002 to 0004 follow the template.

## Numbering rule

ADR numbers are sequential four-digit numbers (0001, 0002, ...) and are never reused. A rejected, withdrawn or
superseded ADR keeps its number. To change an accepted decision, write a new ADR and set the old one's Status to
"Superseded by NNNN".
