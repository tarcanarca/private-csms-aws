variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "internal" { type = bool }
variable "certificate_arn" { type = string }
variable "target_port" { type = number }
variable "health_check_path" { default = "/healthz" }
variable "ingress_cidrs" {
  description = "CIDRs allowed to reach the listener (public ALB: station network ranges, or 0.0.0.0/0 if undecided)."
  type        = list(string)
  default     = []
}
variable "ingress_security_group_ids" {
  type    = list(string)
  default = []
}
variable "idle_timeout" {
  description = "Seconds. The gateway pings every 30s, which counts as activity."
  default     = 120
}
variable "deregistration_delay" {
  description = "Seconds the ALB keeps established connections during deregistration. Must cover the gateway drain window."
  default     = 60
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-alb-"
  vpc_id      = var.vpc_id
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "cidr" {
  for_each          = toset(var.ingress_cidrs)
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "sg" {
  count                        = length(var.ingress_security_group_ids) # count, not for_each: the IDs may be unknown until apply
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.ingress_security_group_ids[count.index]
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_lb" "this" {
  name                       = var.name
  internal                   = var.internal
  load_balancer_type         = "application"
  subnets                    = var.subnet_ids
  security_groups            = [aws_security_group.this.id]
  idle_timeout               = var.idle_timeout
  drop_invalid_header_fields = true
  enable_deletion_protection = false # dev default; set true in prod
}

resource "aws_lb_target_group" "this" {
  name_prefix          = substr(var.name, 0, 6)
  port                 = var.target_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = var.deregistration_delay
  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

output "security_group_id" { value = aws_security_group.this.id }
output "target_group_arn" { value = aws_lb_target_group.this.arn }
output "dns_name" { value = aws_lb.this.dns_name }
