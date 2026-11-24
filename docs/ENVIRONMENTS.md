# Environments

Purpose: describes the environments of the CSMS platform, how they are isolated inside one AWS account, and how they are named and promoted.

Status: describes current state for `local` and `dev`, and planned state for `prod`, artifact promotion and the remote Terraform state backend.

Related: [architecture](architecture.md), [DELIVERY](DELIVERY.md), [ADR 0004: single AWS account](adr/0004-single-aws-account-environments.md).

## 1. Purpose and status

The platform has three environments: `local`, `dev` and `prod`. There is no staging environment.

- `local` exists. It runs on a developer machine with Docker Compose (`docker-compose.yml`). It does not emulate API Gateway, ALB or ECS Fargate.
- `dev` exists. It runs in real AWS and is provisioned by `infrastructure/terraform/environments/dev`. It is the only environment provisioned under `infrastructure/terraform/environments/`.
- `prod` is planned and not provisioned. There is no `infrastructure/terraform/environments/prod` yet.

## 2. Environment overview

| Environment | Where it runs | Provisioned by | Purpose | Status |
|---|---|---|---|---|
| `local` | Developer machine, Docker Compose | `docker-compose.yml`, `npm run db:up` | Development, unit and integration tests, charger harness. Only PostgreSQL runs in Compose today. | Exists |
| `dev` | AWS, shared account | Terraform `environments/dev` | Hosts dev deployments and verifies AWS integrations. Automated post-deploy tests run through the real endpoints. | Exists |
| `prod` | AWS, shared account | Terraform `environments/prod` (not created) | Isolated infrastructure built from the same reusable Terraform modules. Deployments follow successful dev verification and use safeguards. | Planned |

Rationale for having no staging environment:

- It minimizes cost.
- `dev` doubles as the cloud integration test environment.
- A staging environment may be introduced if complexity, team size or the need for production parity justify it. That would be a new architectural decision and needs an ADR.

## 3. Single AWS account

All AWS environments (`dev` and `prod`) share a single AWS account. The decision and its alternatives are in [ADR 0004](adr/0004-single-aws-account-environments.md).

Isolation inside one account relies on IAM, resource naming, secret paths and Terraform state keys, not on an account boundary. A wrong credential or policy can therefore reach the other environment, and account-level quotas are shared. The dimensions below are the mitigation.

## 4. Isolation dimensions

| Dimension | `local` | `dev` | `prod` (planned) |
|---|---|---|---|
| IAM | Not applicable. | Task roles, execution roles and the CI deploy role are specific to `dev` and scoped to resources whose names contain `csms-dev`. | Separate roles scoped to `csms-prod` resources. No role is shared with `dev`. A role that can apply `dev` cannot apply `prod`. |
| AWS resources | Docker Compose containers. | Own VPC, ECS cluster, ALBs and RDS instance, all created by `environments/dev`. | Own VPC, ECS cluster, ALBs and RDS instance, created by `environments/prod`. No security-group rules across environments. |
| Secrets | Local values in the Compose file and untracked `.env` files. | AWS Secrets Manager secrets under the `dev` name. Values are set out-of-band and never stored in Terraform state. | Secrets Manager secrets under the `prod` name, with values set out-of-band. |
| Terraform state | Not applicable. | Local state today (see section 7). Own state key once a backend exists. | Own state key and lock entry once a backend exists. |

## 5. Naming convention

`<env>` is one of `local`, `dev` or `prod`.

| Item | Pattern | Example |
|---|---|---|
| AWS resource name | `csms-<env>-<resource>` | `csms-dev-public` |
| Secret path | `/csms/<env>/<service>/<name>` | `/csms/dev/charging-control/database-url` |
| Terraform state key | `csms/<env>/terraform.tfstate` | `csms/prod/terraform.tfstate` |
| Tags | `Project=csms`, `Environment=<env>`, `ManagedBy=terraform` | Set as `default_tags` in `environments/dev/versions.tf` |

### Known gaps

The following existing `dev` resources do not follow the pattern. They are listed here and are not renamed by this document. Renaming most of them replaces the resource and needs its own change.

| Resource | Current name | Source | Pattern |
|---|---|---|---|
| ECS services, task definition families and containers | `ocpp-gateway`, `charging-control` | `environments/dev/main.tf`, `modules/ecs-service` | `csms-<env>-<resource>` |
| CloudWatch log groups | `/csms/ocpp-gateway`, `/csms/charging-control` | `modules/ecs-service` | Environment token missing |
| Task security groups, execution roles, task roles | name prefix `ocpp-gateway-...`, `charging-control-...` | `modules/ecs-service` | Environment token missing |
| ECR repositories | `ocpp-gateway`, `charging-control` | `environments/dev/main.tf` | Environment token missing. The repositories are not environment-specific. |
| Secrets Manager secrets | `csms-dev/internal-api-token`, `csms-dev/operator-api-token`, `csms-dev/database-url` | `environments/dev/main.tf` | `/csms/<env>/<service>/<name>`: leading slash and `<service>` segment missing |
| Terraform state | Local state, no key | `environments/dev/versions.tf` | `csms/<env>/terraform.tfstate` |

Resources that already use the `csms-dev` prefix: the ECS cluster (`csms-dev`), the public and internal ALBs (`csms-dev-public`, `csms-dev-int`), the RDS instance and subnet group (`csms-dev`), and the network resources (`csms-dev...`).

The ECS service module is shared by the environments. Once `prod` is added in the same account, its service names, log groups and IAM roles would collide with or be confused with `dev` unless the gaps above are closed first.

## 6. Artifact promotion

Status: planned. `.github/workflows/ci.yml` builds images but does not push them, and no deploy job exists.

Target flow:

1. Run local and CI tests.
2. Build an immutable artifact once from a commit and identify it by image digest.
3. Deploy that digest to `dev`.
4. Run integration and smoke tests through the real `dev` endpoints.
5. Promote the same verified digest to `prod`.
6. Run non-destructive smoke tests on `prod`.

The image is never rebuilt per environment. Environments differ only in configuration: environment variables, secrets and Terraform variables. ECR repositories already use immutable tags (`image_tag_mutability = "IMMUTABLE"`). See [DELIVERY](DELIVERY.md) for the pipeline.

## 7. Terraform structure

- `infrastructure/terraform/modules/` holds the reusable modules: `alb`, `database`, `ecs-service` and `network`.
- `infrastructure/terraform/environments/<env>/` composes the modules with the variables of that environment. Only `dev` exists.
- Adding `prod` means adding `environments/prod` from the same modules. It does not mean forking modules for `prod`.
- State is local today. The remote state backend is undecided (architecture section 13, item 14; the comment in `environments/dev/versions.tf`). The state key convention in section 5 applies once a backend is chosen.

## 8. Configuration differences

Only values found in the repository are listed.

| Setting | `local` | `dev` | `prod` | Source |
|---|---|---|---|---|
| `REQUIRE_FORWARDED_HTTPS` | Not set (disabled) | `true` | To be decided | `apps/ocpp-gateway/src/config.ts`, `environments/dev/main.tf` |
| `DRAIN_TIMEOUT_MS` (gateway) | Not set | `20000` | To be decided | `environments/dev/main.tf` |
| Database | PostgreSQL 16 container, data in tmpfs, host port 5433 | RDS, `db.t4g.micro` default, 7-day backup retention | To be decided | `docker-compose.yml`, `modules/database` |
| `db_multi_az` | Not applicable | `false` (variable default) | The variable comment says production must set `true` | `environments/dev/variables.tf` |
| RDS deletion protection and final snapshot | Not applicable | Off, follows `db_multi_az` | On when `db_multi_az` is `true` | `modules/database` |
| ALB deletion protection | Not applicable | `false` | The module comment says set `true` in prod | `modules/alb` |
| ECS desired count | Not applicable | Module default `2` | To be decided | `modules/ecs-service` |
| CloudWatch log retention | Not applicable | 30 days | To be decided | `modules/ecs-service` |

## 9. Deviations

Aside, for readers who compare this document with the original environment proposal and the requirements text:

- The requirements text and glossary name `stage` and `prod`. This document follows the proposal instead: `local`, `dev` and `prod`, with no staging.
- All AWS environments sit in one account (section 3). Isolation comes from the dimensions in section 4.
- Artifact promotion by digest and the remote state backend are described as planned because neither exists yet.

## 10. Related

- [architecture](architecture.md)
- [DELIVERY](DELIVERY.md)
- [ADR 0004: single AWS account](adr/0004-single-aws-account-environments.md)
