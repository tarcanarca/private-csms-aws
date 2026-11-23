variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "ingress_security_group_ids" { type = list(string) }
variable "instance_class" { default = "db.t4g.micro" }
variable "multi_az" {
  description = "Architecture requires Multi-AZ in production. Dev may set false to halve cost."
  type        = bool
  default     = true
}
variable "allocated_storage" { default = 20 }

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-db-"
  vpc_id      = var.vpc_id
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "pg" {
  for_each                     = toset(var.ingress_security_group_ids)
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "this" {
  identifier                  = var.name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.instance_class
  allocated_storage           = var.allocated_storage
  storage_encrypted           = true
  db_name                     = "csms"
  username                    = "csms_admin"
  manage_master_user_password = true # password lives in Secrets Manager, never in state/variables
  multi_az                    = var.multi_az
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.this.id]
  publicly_accessible         = false
  backup_retention_period     = 7
  deletion_protection         = var.multi_az # treat Multi-AZ as "production-like"
  skip_final_snapshot         = !var.multi_az
  final_snapshot_identifier   = var.multi_az ? "${var.name}-final" : null
  auto_minor_version_upgrade  = true
}

output "endpoint" { value = aws_db_instance.this.address }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
