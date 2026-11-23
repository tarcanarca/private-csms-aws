# Implementation Plan: Project Docs Structure

## Overview

This plan creates and edits Markdown files only: the docs set, three ADRs, steering files, `AGENTS.md` and optional repository metadata files. It makes no change to source code, Terraform or CI workflows. Documents are written in Markdown, and the "language" for any illustrative snippet is TypeScript, as in the design.

Execution rules for every task:

- Work in a new git worktree on a dedicated branch (W1). Verify (W2), then open a GitHub pull request (W3) that a human reviews before merge.
- Re-read `.github/workflows/ci.yml`, `package.json`, `tests/` and `infrastructure/terraform/` at execution time. Do not trust the design snapshot.
- Mark any statement that cannot be verified in the repository as `**Assumption:** ...` and list all assumptions in the PR description (Requirement 11.4).
- Do not modify `packages/persistence/src/station-repository.ts`, anything under `apps/`, Terraform files or `.github/workflows/`.
- Use relative Markdown links only. Give each new doc a title, a one-line purpose, a `Status` line and a `Related` line.

Separate follow-up, out of scope here: implement the `StationRepository` port refactor described in ADR 0003 (Requirement 8.6). It is recorded in ADR 0003 and in the PR description and is not performed by any task below.

## Tasks

- [x] 1. Write the ADRs
  - [x] 1.1 Create `docs/adr/0002-locking-strategy.md`
    - Use the sections Status, Date, Deciders, Context, Decision, Alternatives considered, Consequences, Related.
    - Context: serializing BootNotification handling per station across gateway replicas, using `lockStation()` with `SELECT ... FOR UPDATE` inside `withTransaction`.
    - Decision: keep it. Record rule L1 (pessimistic for short per-station serialization) and L2 (optimistic row-version for low-contention updates).
    - Alternatives: optimistic version with retry, advisory locks, Redis lock, unique constraints only.
    - Consequences: short transaction scope, no network calls inside the lock, lock timeout noted as follow-up, `lockStation()` left unchanged.
    - Link to the first scenario row of `RELIABILITY.md` and to `architecture.md`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x] 1.2 Create `docs/adr/0003-repository-port.md`
    - Same sections as 1.1. Status line: "Accepted; implementation pending".
    - Decision: the station service depends on a `StationRepository` port owned by the domain or application layer, and `packages/persistence` implements it (rule P1).
    - Include the illustrative TypeScript interface from the design, with the transaction scope kept on the port so the ADR 0002 lock keeps its boundary.
    - Alternatives: direct imports, ORM repository, port only for new modules.
    - Consequences: in-memory fakes for unit tests, one more interface to maintain, current code does not yet match.
    - State the port refactor as a separate follow-up task and the open question about where the interface lives (`packages/domain/stations` is the candidate).
    - _Requirements: 8.1, 8.2, 8.6_

  - [x] 1.3 Create `docs/adr/0004-single-aws-account-environments.md`
    - Same sections as 1.1. Environments are `local`, `dev`, `prod`, with no staging.
    - Decision: one AWS account, isolation by IAM roles, resource naming, secret paths and Terraform state keys.
    - Alternatives: account per environment, separate prod account only, a staging environment (rejected by the owner).
    - Consequences: weaker isolation, no account-level SCPs, shared account quotas between dev load tests and prod, revisit trigger.
    - State that it settles only the account/environment part of the open list in ADR 0001. Region and Terraform state backend stay open. Do not edit ADR 0001.
    - _Requirements: 2.2, 3.2, 3.7_

  - [x]* 1.4 Create `docs/adr/TEMPLATE.md`
    - Section skeleton: `# ADR NNNN: Title`, Status (Proposed, Accepted, Superseded by NNNN), Date, Deciders, Context, Decision, Alternatives considered, Consequences, Related.
    - State the numbering rule: sequential four digits, never reused.
    - _Requirements: 7.2_

  - [x]* 1.5 Create `docs/adr/README.md` (ADR index)
    - Table of ADR number, title, status and relative link for 0001 to 0004. Note that ADR 0001 has a different shape.
    - Link to `TEMPLATE.md` if task 1.4 was done.
    - _Requirements: 1.3, 1.4_

- [x] 2. Environments and architecture updates
  - [x] 2.1 Create `docs/ENVIRONMENTS.md`
    - Follow the design outline: purpose and status, overview table (`local` exists, `dev` exists, `prod` planned, no staging), single AWS account, isolation dimensions table (IAM, AWS resources, secrets, Terraform state), naming convention table, artifact promotion by image digest (planned), Terraform structure, configuration differences, deviations, related.
    - Check `infrastructure/terraform/` and list existing resource names that do not follow `csms-<env>-<resource>` under "Known gaps". Do not rename anything.
    - State the remote state backend as undecided and the state key convention as planned.
    - List the deviations: no staging versus the requirements text, single-account interpretation, planned promotion and remote state.
    - Link to `architecture.md`, `DELIVERY.md` and ADR 0004.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 2.2 Edit `docs/architecture.md` (sections 13 onward only)
    - Section 13 item 9: remove "AWS account/environment strategy (dev/stage/prod)" and keep region, AZ count, VPC egress/NAT/VPC endpoints, costs and quotas.
    - Add after the "Phase 1 resolutions" paragraph: links to `ENVIRONMENTS.md` and ADR 0004 (account strategy resolved), ADR 0002 (locking) and ADR 0003 (repository port).
    - Add a new section 16 "Dependency direction" with the mermaid diagram (service → `StationRepository` port ← persistence) and the note "Target state; the current code imports persistence functions directly. See ADR 0003."
    - Confirm section 11 already lists `tests/protocol`, `tests/integration`, `tests/reliability`, `tests/load`. Do not edit it.
    - Do not change sections 1 to 12.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.5_

  - [x] 2.3 Reword Requirement 3.6 and the glossary in `.kiro/specs/project-docs-structure/requirements.md`
    - Change "stage and prod as planned" to "prod planned; no staging environment" in Requirement 3.6, the Requirement 3 user story and the introduction, to match ENVIRONMENTS.md.
    - _Requirements: 3.6_

- [x] 3. Delivery document
  - [x] 3.1 Create `docs/DELIVERY.md`
    - Follow the design outline: pipeline today (jobs `node`, `terraform`, `images`, from the current `ci.yml`, triggers on push to `main` and pull requests), planned-not-implemented list (registry push, plan on PR, apply per environment, deploy to dev, smoke tests, prod deploy, signing and scans), infrastructure provisioning with plan and apply per environment, quality gates, deployment safety (rolling deploys, migration compatibility, rollback), AI-assisted development with mandatory human review, change workflow from worktree to merge, testing paragraph linking to `TESTING.md`.
    - Add the "Workflow rules" section with full text of W1 to W5, R1, L1, L2, P1: ID, rule, rationale, source requirement. This section is the source of truth for the condensed copies.
    - Add a "Last verified" date to the status line.
    - Link to `ENVIRONMENTS.md`, `TESTING.md` and `RELIABILITY.md`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 7.5, 8.3_

  - [x]* 3.2 Add a "Documentation checks" section to `docs/DELIVERY.md` (doc-lint, manual)
    - List the manual `grep` and `git diff` commands for checking relative links, README index coverage, rule-ID mirroring, reliability table cells, unchanged architecture sections 1 to 12 and the path allow-list.
    - Note that a scripted doc-lint in CI is a separate follow-up and is not created here.
    - _Requirements: 11.2, 11.4_

- [x] 4. Testing document
  - [x] 4.1 Create `docs/TESTING.md` (include decision)
    - Re-compare the intended content with `DELIVERY.md`. The design recommends including it because test layers, local versus cloud and evidence handling differ from pipeline content. Record the decision and reason for the final report.
    - Cover test layers table (`*.test.ts` next to source, `tests/protocol`, `tests/integration`, `tests/reliability`, `tests/load`) with status written from what exists in `tests/` at execution time.
    - Distinguish local tests (Compose, `npm run db:up`, `npm test`) from cloud smoke, reliability and load tests against `dev`. Cloud tests do not target `prod` without explicit approval.
    - List real scripts from `package.json`, property-based testing guidance, and the two-way link convention with `RELIABILITY.md`.
    - Link to `DELIVERY.md`, `ENVIRONMENTS.md` and `RELIABILITY.md`.
    - _Requirements: 1.5, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 5. Reliability document
  - [x] 5.1 Create `docs/RELIABILITY.md`
    - State up front that it holds evidence, not targets.
    - Targets table (10,000 stations, 5,000 sessions, 99.9%) with status "target, not yet measured". Do not restate them as results anywhere.
    - Failure scenarios table with columns Scenario, Expected behaviour, ADR, Architecture section, Evidence. Use the six design rows. Each ADR cell is a resolving link or "none yet". Each architecture cell links to `architecture.md`.
    - Retries and idempotency section, measured-results table with columns Topic, Metric, Value, Date, Environment, Method, Evidence link (initially empty), "not yet measured" entries for latency, throughput, recovery time and operational limits, and a note that `tests/reliability` and `tests/load` evidence directories are planned.
    - Add the shared-account quota note from ADR 0004 as an operational limit to measure.
    - Add the maintenance rule R1.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 6. Agent guidance and repository metadata
  - [x] 6.1 Create `.kiro/steering/workflow.md`
    - Front matter `inclusion: always`. Check the syntax against current Kiro steering conventions first.
    - Condensed W1 to W5 and R1 with the same IDs and one-line summaries as `DELIVERY.md`. Reminder to list assumptions in the PR description. Link to `docs/DELIVERY.md`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.8_

  - [x] 6.2 Create `.kiro/steering/engineering-rules.md`
    - Front matter `inclusion: always`.
    - L1 and L2 with the pointer to ADR 0002 and the statement "do not change `lockStation()` without a new ADR".
    - P1 with the pointer to ADR 0003 and the note that the current station service does not yet follow it.
    - Environment rule: do not mix `prod` resources, secrets or state under `dev` names or roles. Name pattern `csms-<env>-...`.
    - Docs to read first: `docs/architecture.md`, `docs/ENVIRONMENTS.md`.
    - _Requirements: 7.6, 8.3_

  - [x] 6.3 Create `AGENTS.md`
    - Project in two sentences and the monorepo layout with a link to `docs/architecture.md`.
    - Commands from `package.json`: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run db:up`.
    - Condensed W1 to W5, R1, L1, L2, P1 with the same IDs and wording as `DELIVERY.md`.
    - Boundaries: no source, Terraform or CI changes outside the task, do not install skills, no `prod` actions, ask before architectural changes, humans review every PR.
    - Doc index with relative links.
    - _Requirements: 6.7, 6.8, 7.6, 8.4_

  - [x]* 6.4 Create `.github/pull_request_template.md`
    - Checklist: verification method (W2), ADR link or "not applicable" (W4), `RELIABILITY.md` updated or "not applicable" (R1), steering and `AGENTS.md` updated when rules changed (W5), assumptions list, human review.
    - This is a repository metadata file, not a workflow. It needs owner approval.
    - _Requirements: 5.7, 6.8, 11.4_

  - [x]* 6.5 Create `.github/CODEOWNERS` entries for docs
    - Add entries for `docs/adr/` and `docs/RELIABILITY.md`. Ask the owner for the team or user names first. Skip if none are given.
    - _Requirements: 4.6_

- [~] 7. Checkpoint - Review new documents
  - Ensure all new docs render, links resolve, and ask the user if questions arise.

- [x] 8. README index and skill recommendations
  - [x] 8.1 Edit `README.md`
    - Add a "Documentation" section: table of path and one-line purpose for `docs/architecture.md`, `docs/ENVIRONMENTS.md`, `docs/DELIVERY.md`, `docs/RELIABILITY.md`, `docs/TESTING.md`, `docs/adr/` (link to the index if task 1.5 was done, else list ADRs 0001 to 0004) and `AGENTS.md`.
    - Keep all existing README content.
    - _Requirements: 1.4_

  - [x] 8.2 Search for skills and write the Skill_Recommendation_Report (no install)
    - Run `npx skills find <query>` or use skills.sh for: git worktree, ADR writing (`adr`), Terraform and AWS, GitHub pull request workflow, testing (refine with property-based testing).
    - Produce a table with Topic, Skill, Source, Reason per topic, or "no skill found for this topic". Report tool failures per topic.
    - Put the report in the final message to the user. Do not install any skill and do not store the report in the repository.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 9. Verification of documentation properties
  - [ ]* 9.1 Check inter-document links
    - **Property 1: Inter-document links are relative and resolve**
    - **Validates: Requirements 1.3, 2.1, 2.4, 5.5**

  - [ ]* 9.2 Check README indexes every Docs_Set file
    - **Property 2: README indexes every Docs_Set file**
    - **Validates: Requirements 1.4**

  - [ ]* 9.3 Check rule IDs are mirrored
    - **Property 3: Rule IDs are mirrored across the three rule locations**
    - **Validates: Requirements 6.5, 6.6, 6.7, 7.6, 8.3, 8.4**

  - [ ]* 9.4 Check reliability figures carry evidence
    - **Property 4: Reliability figures carry evidence**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 9.5 Check failure scenarios link to an ADR and architecture section
    - **Property 5: Every failure scenario links to an ADR and an architecture section**
    - **Validates: Requirements 5.5**

  - [ ]* 9.6 Check architecture sections 1 to 12 are unchanged
    - **Property 6: Architecture sections 1 to 12 are unchanged**
    - **Validates: Requirements 2.3**

  - [ ]* 9.7 Check the PR touches only allowed paths
    - **Property 7: Documentation PRs touch only allowed paths**
    - **Validates: Requirements 7.7, 8.6, 11.1, 11.2**

  - [ ]* 9.8 Check environment naming examples
    - **Property 8: Environment naming convention is applied**
    - **Validates: Requirements 3.4**

  - [ ]* 9.9 Check `DELIVERY.md` covers every CI job
    - **Property 9: Delivery doc covers every CI job**
    - **Validates: Requirements 4.1, 4.2**

- [~] 10. Final checkpoint - Ensure all checks pass
  - Ensure all checks pass, ask the user if questions arise. The final report states the `TESTING.md` include decision, the assumptions list, the skill report and the repository-port refactor follow-up.

## Notes

- Tasks marked with `*` are optional and can be skipped: ADR template and index, PR template, CODEOWNERS, manual doc-lint section, and the property checks.
- The property checks are run manually with `grep` and `git diff`. No test code is written, because a scripted doc-lint is a code and CI change and is a separate follow-up.
- The `StationRepository` port refactor is a separate follow-up and is not part of this plan.
- Each task references requirements for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "8.2"] },
    { "id": 1, "tasks": ["1.5", "2.1", "3.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 3, "tasks": ["8.1"] },
    { "id": 4, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9"] }
  ]
}
```
