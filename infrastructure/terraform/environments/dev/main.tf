locals {
  name = "csms-dev"
}

module "network" {
  source            = "../../modules/network"
  name              = local.name
  nat_gateway_count = 1
}

resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(["ocpp-gateway", "charging-control"])
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# Secret CONTAINERS only. Values are set out-of-band (never in Terraform state):
#   aws secretsmanager put-secret-value --secret-id <name> --secret-string '...'
resource "aws_secretsmanager_secret" "internal_api_token" { name = "${local.name}/internal-api-token" }
resource "aws_secretsmanager_secret" "operator_api_token" { name = "${local.name}/operator-api-token" }
resource "aws_secretsmanager_secret" "database_url" { name = "${local.name}/database-url" }

module "public_alb" {
  source               = "../../modules/alb"
  name                 = "${local.name}-public"
  vpc_id               = module.network.vpc_id
  subnet_ids           = module.network.public_subnet_ids
  internal             = false
  certificate_arn      = var.public_certificate_arn
  target_port          = 9000
  ingress_cidrs        = var.station_ingress_cidrs
  deregistration_delay = 60
}

module "internal_alb" {
  source                     = "../../modules/alb"
  name                       = "${local.name}-int"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  internal                   = true
  certificate_arn            = var.internal_certificate_arn
  target_port                = 8080
  ingress_cidrs              = var.internal_client_cidrs
  ingress_security_group_ids = [module.gateway.security_group_id]
}

module "gateway" {
  source                     = "../../modules/ecs-service"
  name                       = "ocpp-gateway"
  region                     = var.region
  cluster_arn                = aws_ecs_cluster.this.arn
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  image                      = var.gateway_image
  container_port             = 9000
  target_group_arn           = module.public_alb.target_group_arn
  ingress_security_group_ids = [module.public_alb.security_group_id]
  stop_timeout               = 30
  environment = {
    CONTROL_BASE_URL        = "https://${module.internal_alb.dns_name}"
    REQUIRE_FORWARDED_HTTPS = "true"
    DRAIN_TIMEOUT_MS        = "20000"
  }
  secrets = { INTERNAL_API_TOKEN = aws_secretsmanager_secret.internal_api_token.arn }
}

module "control" {
  source                     = "../../modules/ecs-service"
  name                       = "charging-control"
  region                     = var.region
  cluster_arn                = aws_ecs_cluster.this.arn
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  image                      = var.control_image
  container_port             = 8080
  target_group_arn           = module.internal_alb.target_group_arn
  ingress_security_group_ids = [module.internal_alb.security_group_id]
  secrets = {
    INTERNAL_API_TOKEN = aws_secretsmanager_secret.internal_api_token.arn
    OPERATOR_API_TOKEN = aws_secretsmanager_secret.operator_api_token.arn
    DATABASE_URL       = aws_secretsmanager_secret.database_url.arn
  }
}

module "database" {
  source                     = "../../modules/database"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  ingress_security_group_ids = [module.control.security_group_id]
  multi_az                   = var.db_multi_az
}

output "public_alb_dns" { value = module.public_alb.dns_name }
output "internal_alb_dns" { value = module.internal_alb.dns_name }
output "database_endpoint" { value = module.database.endpoint }
output "database_master_secret_arn" { value = module.database.master_secret_arn }
