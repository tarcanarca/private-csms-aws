# Delivery

How a change moves from idea to deployment, which checks run today, and which parts are still planned. This file also holds the workflow rules (section 9), which are the source of truth for the condensed copies in `.kiro/steering/` and `AGENTS.md`.

Status: describes the current pipeline plus planned delivery steps (marked as planned). Last verified: 2026-11-23 against `.github/workflows/ci.yml`, `package.json` and `infrastructure/terraform/`.

Related: [ENVIRONMENTS](ENVIRONMENTS.md), [TESTING](TESTING.md), [RELIABILITY](RELIABILITY.md), [architecture](architecture.md).

## 1. Pipeline today

Defined in `.github/workflows/ci.yml`, workflow name `ci`. Triggers: push to `main` and every pull request. Permissions: `contents: read`.

| Job | What it runs | Notes |
|---|---|---|
| `node` | `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration` | Node 22, npm cache, Postgres 16 service container (`postgres:16-alpine`, host port 5433) for integration tests. |
| `terraform` | `terraform fmt -check -recursive infrastructure/terraform`, `terraform init -backend=false`, `terraform validate` | Terraform 1.9.8. Validates `environments/dev` only. No backend, no plan, no apply. |
| `images` | `docker build --build-arg APP=<app> -t csms/<app>:ci .` | Matrix over `ocpp-gateway` and `charging-control`. Images are built only, not pushed. |

The three jobs run independently of each other. The workflow has no deploy, smoke test or production step.

## 2. Planned, not implemented

None of the following exists in `ci.yml` or elsewhere in the repository today.

- Push of images to a registry, identified by digest.
- `terraform plan` on pull requests.
- `terraform apply` per environment.
- Automatic deploy to `dev`.
- Post-deploy smoke tests against `dev`.
- Production deploy with approval (`prod` is not provisioned, see [ENVIRONMENTS](ENVIRONMENTS.md)).
- Image signing and security scans (architecture section 13, item 14).

## 3. Infrastructure provisioning

Terraform lives in `infrastructure/terraform`. Shared modules are `alb`, `database`, `ecs-service` and `network`. Only `environments/dev` exists. State is local and not committed, because the remote backend is an open decision (`environments/dev/versions.tf`, architecture section 13 item 14).

Target flow per environment (**planned**, apply is not automated):

1. `terraform plan` for the environment, attached to the pull request for review.
2. After merge, `terraform apply` for the same environment, run by a role scoped to that environment. `dev` is applied first.
3. `prod` gets its own `environments/prod` and its own role and state. Nothing is applied to `prod` without explicit human approval.

Today, apply is run manually by a human with credentials for the target environment. **Assumption:** no other apply process exists, since none is defined in the repository.

## 4. Quality gates before merge

Automated today:

- Typecheck (`npm run typecheck`).
- Lint (`npm run lint`).
- Unit tests (`npm run test:unit`).
- Integration tests with real PostgreSQL (`npm run test:integration`).
- `terraform fmt -check` and `terraform validate` for `dev`.
- Docker image build for both apps.

Review gates:

- At least one human approval of the pull request (W3).
- Documentation gate: R1 (reliability doc updated when behaviour changes) and W5 (mirrors updated when rules change).
- ADR gate for architectural changes (W4).

**Assumption:** branch protection on `main` that enforces the CI checks and the approval is configured in GitHub. It cannot be verified from the repository.

## 5. Deployment safety

Deployment itself is not automated yet (section 2). The intended practices are:

- **Rolling deploys.** ECS services replace tasks gradually, with connection draining so WebSocket connections end cleanly (architecture sections 9 and 12, phase 7). Status: planned.
- **Migration compatibility.** Each database migration works with both the previous and the next application version (expand, then contract). Migrations are forward-only. Status: practice to follow. Migrations currently run through `npm run migrate`.
- **Rollback.** Redeploy the previous image digest. Because migrations are compatible with the previous version, rollback does not need a schema rollback. Status: planned, requires registry push by digest (section 2).

## 6. AI-assisted development

Agents may write code, documentation and pull requests. Every pull request, including AI-assisted ones, is reviewed by a human before merge (W3). Agents do not merge, do not apply Terraform to `prod` and do not install skills without approval. Agents list unverified statements as assumptions in the PR description.

## 7. Change workflow

1. Create a new git worktree on a dedicated branch (W1).
2. Implement the change. Add an ADR if it is architectural (W4).
3. Verify with the methods given for the change, otherwise run the existing tests (W2).
4. Update `RELIABILITY.md` if retry, idempotency, locking, timeout or capacity behaviour changed (R1). Update the mirrors if a rule changed (W5).
5. Open a GitHub pull request, listing assumptions and the verification performed (W3).
6. CI runs (section 1). A human reviews.
7. Merge after approval and green checks. Remove the worktree and branch.

## 8. Testing

Test layers, commands, and the split between local and cloud tests are described in [TESTING](TESTING.md). Reliability and load evidence is recorded in [RELIABILITY](RELIABILITY.md).

## 9. Workflow rules

This section is the source of truth. The condensed copies in `.kiro/steering/` and `AGENTS.md` use the same IDs and must be updated in the same pull request (W5).

### W1. New worktree per change

- **Rule:** Each change starts in a new git worktree on a dedicated branch.
- **Rationale:** Several agents can work in parallel without interfering with each other, and each change can be reviewed, reverted or merged separately.
- **Source requirement:** 6.1

### W2. Verify before the pull request

- **Rule:** Verify the change with the methods explicitly provided for it. If none are provided, run the existing tests. Do this before opening a pull request.
- **Rationale:** A pull request should arrive with evidence that the change works, so reviewers do not spend time on broken changes.
- **Source requirement:** 6.2

### W3. Pull request and human review

- **Rule:** Open a GitHub pull request after verification. A human reviews every pull request before merge, including AI-assisted ones.
- **Rationale:** The pull request is the review and audit point, and human review keeps accountability for AI-written changes with a person.
- **Source requirement:** 6.3, 4.6

### W4. ADR for architectural changes

- **Rule:** Every architectural change gets an ADR in `docs/adr/`.
- **Rationale:** Decisions and their alternatives stay discoverable, so later changes do not undo them by accident.
- **Source requirement:** 6.4

### W5. Keep the rule copies in sync

- **Rule:** When W1 to W4, L1, L2 or P1 change, update this document, the Steering_Files in `.kiro/steering/` and `AGENTS.md` in the same pull request.
- **Rationale:** Humans and agents read different files. If the copies drift, they follow different rules.
- **Source requirement:** 6.8

### R1. Reliability document stays current

- **Rule:** A change to retry, idempotency, locking, timeout or capacity behaviour updates [RELIABILITY](RELIABILITY.md) in the same pull request.
- **Rationale:** Reliability claims are only trustworthy if they track the code that produces the behaviour.
- **Source requirement:** 5.7

### L1. Pessimistic locking for short per-station serialization

- **Rule:** Use pessimistic locking (`SELECT ... FOR UPDATE`) for short per-station serialization, such as boot handling across gateway replicas.
- **Rationale:** The operation is short and hot, so waiting on a row lock is cheaper and simpler than retrying failed optimistic updates. See the [locking ADR](adr/0002-locking-strategy.md).
- **Source requirement:** 7.4

### L2. Optimistic locking for low-contention updates

- **Rule:** Use optimistic row-version locking for low-contention updates.
- **Rationale:** Conflicts are rare, so holding no lock avoids blocking, and a rare retry is acceptable.
- **Source requirement:** 7.5

### P1. Depend on repository ports

- **Rule:** Application and domain code depend on repository ports, not on database clients.
- **Rationale:** The domain stays independent of the database and can be unit tested with in-memory fakes. See the [repository port ADR](adr/0003-repository-port.md). The current station service does not yet follow this rule.
- **Source requirement:** 8.3

## 10. Documentation checks

Run these by hand from the repository root before opening a documentation pull request. A scripted doc-lint in CI is a separate follow-up and does not exist yet.

**Relative links resolve.** List every relative link target, then confirm each file exists.

```sh
grep -noE '\]\((\.\./|\./)?[A-Za-z0-9_./-]+\.md(#[^)]*)?\)' README.md docs/*.md docs/adr/*.md
ls docs/adr docs
```

For each target, check the path relative to the file that contains the link, for example `test -f docs/adr/0002-locking-strategy.md`. Check anchors by finding the heading in the target file with `grep -n '^#' <file>`.

**README index coverage.** Every document in `docs/` and `docs/adr/` is listed in the README or the ADR index.

```sh
for f in docs/*.md; do grep -q "$(basename "$f")" README.md || echo "missing from README: $f"; done
for f in docs/adr/[0-9]*.md; do grep -q "$(basename "$f")" docs/adr/README.md || echo "missing from ADR index: $f"; done
```

**Rule IDs mirrored.** The IDs W1 to W5, R1, L1, L2 and P1 in this document must also appear in `.kiro/steering/` and `AGENTS.md`.

```sh
for id in W1 W2 W3 W4 W5 R1 L1 L2 P1; do
  grep -q "^### $id\." docs/DELIVERY.md || echo "$id missing in DELIVERY.md"
  grep -rq "\b$id\b" .kiro/steering AGENTS.md || echo "$id missing in steering/AGENTS.md"
done
```

**Reliability table cells filled.** No empty cells in the behaviour tables of [RELIABILITY](RELIABILITY.md). Lines with `| |` or `||` need a value or an explicit "not yet exercised".

```sh
grep -nE '\|\s*\|' docs/RELIABILITY.md
```

The measured-results table may contain the single placeholder row `_no measured results yet_` until results exist.

**Architecture sections 1 to 12 unchanged.** `docs/architecture.md` is listed in `.gitignore`, so `git diff` does not see it. Use a non-git check: record a checksum of the section 1 to 12 text before editing and compare afterwards.

```sh
awk '/^## 13\./{exit} {print}' docs/architecture.md | shasum -a 256
grep -n '^## ' docs/architecture.md | head -12
```

If the file is tracked in your branch (`git ls-files docs/architecture.md` prints a path), `git diff -- docs/architecture.md` must be empty or touch only section 13 onwards.

**Path allow-list for documentation PRs.** A documentation pull request changes only documentation paths.

```sh
git diff --name-only origin/main...HEAD | grep -vE '^(README\.md|AGENTS\.md|docs/|\.kiro/steering/|\.kiro/specs/)' && echo "unexpected paths above"
```

No output means every changed file is in the allow-list. Source, Terraform and `.github/` changes belong in a separate pull request.
