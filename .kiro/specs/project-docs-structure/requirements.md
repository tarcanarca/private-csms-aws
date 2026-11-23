# Requirements Document

## Introduction

This feature restructures the project documentation of the private AWS CSMS monorepo and records the engineering rules that govern future changes. The requirements phase produces a reviewable plan only. The documents, ADR, steering files and AGENTS.md are created during later task execution, and no source code, Terraform or CI changes are made by this feature.

Current state: `docs/` contains `architecture.md` and one ADR (`docs/adr/0001-phase-0-1-decisions.md`). `.github/workflows/ci.yml` has node, terraform (dev only) and images jobs, with no deploy, smoke or production job. Only `infrastructure/terraform/environments/dev` exists. No `.kiro` steering, `AGENTS.md` or `tests/` directory exists yet.

Clarified decisions: a flat layout of top-level files plus `docs/adr/`; a single AWS account with separation by IAM roles, resources, secrets and Terraform state; keeping the pessimistic `SELECT ... FOR UPDATE` in `lockStation()`; a repository port between persistence and the station service; workflow rules mirrored in human-readable and agent-readable form.

## Glossary

- **Docs_Set**: The documentation files under `docs/` defined by this feature: `architecture.md`, `ENVIRONMENTS.md`, `DELIVERY.md`, `RELIABILITY.md`, optionally `TESTING.md`, and the files under `docs/adr/`.
- **Architecture_Doc**: `docs/architecture.md`.
- **Environments_Doc**: `docs/ENVIRONMENTS.md`.
- **Delivery_Doc**: `docs/DELIVERY.md`.
- **Reliability_Doc**: `docs/RELIABILITY.md`.
- **Testing_Doc**: `docs/TESTING.md`.
- **ADR**: An Architecture Decision Record stored in `docs/adr/` with a sequential four-digit prefix.
- **Steering_Files**: Agent guidance files in `.kiro/steering/`.
- **Agents_File**: `AGENTS.md` at the repository root.
- **Workflow_Rules**: The change rules listed in Requirement 6.
- **Locking_Rule**: The documented rule that selects pessimistic or optimistic locking for a persistence operation.
- **Repository_Port**: A TypeScript interface owned by the domain or application layer that the station service depends on, with the persistence package providing the implementation.
- **Station_Service**: The station service in `apps/charging-control/src/station-service.ts`.
- **Persistence_Package**: The `packages/persistence` package, including `station-repository.ts`.
- **Measured_Result**: A reliability or performance figure obtained from an executed test or observed run, recorded with date, environment and method.
- **Skill_Recommendation_Report**: The report listing agent skills found with `npx skills find <query>` or skills.sh.
- **Plan_Author**: The agent or person executing the later tasks.

## Requirements

### Requirement 1: Documentation layout

**User Story:** As a maintainer, I want a flat, predictable documentation layout, so that I can find any project document without navigating nested folders.

#### Acceptance Criteria

1. THE Docs_Set SHALL consist of flat files directly under `docs/` plus the `docs/adr/` directory.
2. THE Docs_Set SHALL contain `architecture.md`, `ENVIRONMENTS.md`, `DELIVERY.md` and `RELIABILITY.md`.
3. THE Docs_Set SHALL link each file to the related Docs_Set files by relative path.
4. THE README.md SHALL list each Docs_Set file with a one-line purpose.
5. WHERE the Testing_Doc is included, THE Docs_Set SHALL contain `docs/TESTING.md`.

### Requirement 2: Architecture document update

**User Story:** As an architect, I want the architecture document to reflect the account strategy decision, so that the baseline no longer lists it as open.

#### Acceptance Criteria

1. THE Architecture_Doc SHALL reference the Environments_Doc by relative link.
2. THE Architecture_Doc SHALL record the single AWS account strategy as decided in section 13, item 9, and SHALL remove the account/environment strategy from the list of open decisions.
3. THE Architecture_Doc SHALL retain all other content of sections 1 to 12 unchanged.
4. THE Architecture_Doc SHALL reference the ADRs that record the locking strategy and the repository port.
5. THE Architecture_Doc SHALL list `tests/protocol`, `tests/integration`, `tests/reliability` and `tests/load` in its monorepo layout, which already includes them.

### Requirement 3: Environments document

**User Story:** As an operator, I want one document describing environments, so that I know how dev, and later prod, are isolated inside one AWS account, with prod planned and no staging environment.

#### Acceptance Criteria

1. THE Environments_Doc SHALL be based on the example supplied by the user.
2. THE Environments_Doc SHALL state that all environments share a single AWS account.
3. THE Environments_Doc SHALL describe separation per environment of IAM roles, AWS resources, secrets and Terraform state.
4. THE Environments_Doc SHALL define a naming convention that identifies the environment in each resource, secret path and state key.
5. THE Environments_Doc SHALL identify `dev` as the only environment currently provisioned under `infrastructure/terraform/environments/`.
6. THE Environments_Doc SHALL mark prod as planned and not provisioned and SHALL state that no staging environment exists.
7. IF the supplied example conflicts with the single-account decision, THEN THE Plan_Author SHALL follow the single-account decision throughout the Environments_Doc and SHALL NOT reproduce the conflicting detail from the example in any section.
8. WHERE the Environments_Doc notes a deviation from the supplied example, THE Environments_Doc SHALL present the deviation only as an explanatory aside.

### Requirement 4: Delivery document

**User Story:** As a contributor, I want a delivery document, so that I know how changes move from idea to deployment safely.

#### Acceptance Criteria

1. THE Delivery_Doc SHALL describe the CI/CD pipeline as it exists in `.github/workflows/ci.yml`, naming the node, terraform and images jobs.
2. THE Delivery_Doc SHALL list pipeline capabilities that do not yet exist (deploy, smoke test, production) as planned and not implemented.
3. THE Delivery_Doc SHALL describe infrastructure provisioning with Terraform, including the plan and apply steps per environment.
4. THE Delivery_Doc SHALL list the quality gates a change must pass before merge.
5. THE Delivery_Doc SHALL describe deployment safety, including rolling deploys, migration compatibility and rollback.
6. THE Delivery_Doc SHALL describe AI-assisted development with mandatory human review of every pull request before merge.
7. THE Delivery_Doc SHALL describe the change-management workflow from branch creation to merge.
8. THE Delivery_Doc SHALL contain the Workflow_Rules in human-readable form.

### Requirement 5: Reliability document

**User Story:** As an operator, I want a reliability document backed by evidence, so that I can trust its numbers.

#### Acceptance Criteria

1. THE Reliability_Doc SHALL cover failure scenarios, retries, idempotency, latency, throughput, recovery and operational limits.
2. THE Reliability_Doc SHALL record only Measured_Results as figures.
3. THE Reliability_Doc SHALL record each Measured_Result with its date, environment and method.
4. IF no Measured_Result exists for a topic, THEN THE Reliability_Doc SHALL mark the topic as "not yet measured".
5. THE Reliability_Doc SHALL link each failure scenario to the relevant ADR and to the relevant Architecture_Doc section.
6. THE Reliability_Doc SHALL NOT restate the 10,000-station, 5,000-session or 99.9% targets as achieved results.
7. WHEN a change alters retry, idempotency, locking, timeout or capacity behaviour, THE Plan_Author SHALL update the Reliability_Doc in the same pull request.

### Requirement 6: Workflow rules

**User Story:** As a maintainer, I want one set of change rules, so that humans and agents work the same way.

#### Acceptance Criteria

1. THE Workflow_Rules SHALL require a new git worktree and a dedicated branch for each change.
2. THE Workflow_Rules SHALL require verification of each change by explicit methods or by existing tests before a pull request is opened.
3. THE Workflow_Rules SHALL require a GitHub pull request to be opened after verification.
4. THE Workflow_Rules SHALL require an ADR for each architectural change.
5. THE Delivery_Doc SHALL contain the full Workflow_Rules.
6. THE Steering_Files SHALL contain a condensed form of the Workflow_Rules in `.kiro/steering/`.
7. THE Agents_File SHALL contain a condensed form of the Workflow_Rules.
8. WHEN the Workflow_Rules change, THE Plan_Author SHALL update the Delivery_Doc, the Steering_Files and the Agents_File in the same pull request.

### Requirement 7: Locking strategy ADR and rule

**User Story:** As a developer, I want the locking choice recorded, so that the pessimistic lock in `lockStation()` is not mistaken for an oversight.

#### Acceptance Criteria

1. THE Docs_Set SHALL contain a new ADR in `docs/adr/` numbered after `0001`, recording the decision to keep `SELECT ... FOR UPDATE` in `lockStation()`.
2. THE ADR SHALL state the context, decision, alternatives considered and consequences.
3. THE ADR SHALL describe the use case of serializing a station's boot handling across gateway replicas for a short time.
4. THE Locking_Rule SHALL select pessimistic locking for short per-station serialization.
5. THE Locking_Rule SHALL select optimistic row-version locking for low-contention updates.
6. THE Locking_Rule SHALL appear in the Steering_Files and the Agents_File.
7. THE Plan_Author SHALL leave the `lockStation()` implementation unchanged.

### Requirement 8: Repository abstraction rule

**User Story:** As a developer, I want a repository port between persistence and the station service, so that the domain stays independent of the database.

#### Acceptance Criteria

1. THE Docs_Set SHALL contain an ADR recording the decision to introduce a Repository_Port between the Persistence_Package and the Station_Service.
2. THE ADR SHALL state that the Station_Service depends on the Repository_Port and that the Persistence_Package implements it.
3. THE Steering_Files SHALL contain a rule that application and domain code depend on repository ports and not on database clients.
4. THE Agents_File SHALL contain the same rule in condensed form.
5. THE Architecture_Doc SHALL describe the dependency direction from application to port to persistence.
6. THE Plan_Author SHALL record the port refactor as a separate follow-up task and not perform it within this feature.

### Requirement 9: Testing document decision

**User Story:** As a contributor, I want a testing document only if it adds value, so that guidance is not duplicated.

#### Acceptance Criteria

1. WHEN the Plan_Author evaluates the Testing_Doc, THE Plan_Author SHALL compare its intended content with the Delivery_Doc.
2. IF the Testing_Doc would add no content beyond the Delivery_Doc, THEN THE Plan_Author SHALL omit `docs/TESTING.md` and place the testing guidance in the Delivery_Doc.
3. WHERE the Testing_Doc is included, THE Testing_Doc SHALL distinguish local tests from cloud integration and smoke tests that run after a dev deployment.
4. WHERE the Testing_Doc is included, THE Testing_Doc SHALL describe the purpose of `tests/protocol`, `tests/integration`, `tests/reliability` and `tests/load`.
5. THE Plan_Author SHALL record the include or omit decision and its reason in the final report.

### Requirement 10: Skill recommendations

**User Story:** As a maintainer, I want skill suggestions, so that agents can follow the new workflow with better tooling.

#### Acceptance Criteria

1. WHEN the Plan_Author prepares the Skill_Recommendation_Report, THE Plan_Author SHALL search with `npx skills find <query>` or skills.sh for git worktrees, ADR writing, Terraform and AWS, GitHub pull request workflow, and testing.
2. THE Skill_Recommendation_Report SHALL list for each topic the skill name, its source and a one-line reason.
3. IF a search returns no result for a topic, THEN THE Skill_Recommendation_Report SHALL state that no skill was found for that topic.
4. THE Plan_Author SHALL report the recommendations to the user without installing any skill.

### Requirement 11: Plan-only scope and review

**User Story:** As the project owner, I want to review the plan before any change, so that I stay in control.

#### Acceptance Criteria

1. THE requirements phase SHALL produce only files under `.kiro/specs/project-docs-structure/`.
2. THE requirements phase SHALL leave source code, Terraform, CI workflows and existing documentation unmodified.
3. WHEN task execution creates documents, THE Plan_Author SHALL deliver them through a pull request following the Workflow_Rules.
4. IF a document statement cannot be verified against the repository, THEN THE Plan_Author SHALL mark the statement as an assumption and list it in the pull request description.
