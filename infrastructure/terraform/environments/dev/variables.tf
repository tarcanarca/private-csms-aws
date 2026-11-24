variable "region" {
  description = "AWS region (decision pending; see ADR-0001)."
  type        = string
}
variable "public_certificate_arn" {
  description = "ACM certificate for the public station WSS endpoint."
  type        = string
}
variable "internal_certificate_arn" {
  description = "ACM certificate for the internal ALB."
  type        = string
}
variable "internal_hostname" {
  description = "Hostname covered by internal_certificate_arn. A private Route 53 zone resolves it to the internal ALB inside the VPC, so the gateway can reach Charging Control over TLS."
  type        = string
}
variable "gateway_image" {
  description = "ECR image URI for the OCPP Gateway."
  type        = string
}
variable "control_image" {
  description = "ECR image URI for Charging Control."
  type        = string
}
variable "station_ingress_cidrs" {
  description = "CIDRs allowed to open station WebSockets. Defaults open because the station network is undecided."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
variable "internal_client_cidrs" {
  description = "CIDRs (VPN / peered network) allowed to reach the internal ALB for the operator API."
  type        = list(string)
  default     = []
}
variable "db_multi_az" {
  type    = bool
  default = false # dev only; production environments must set true
}
