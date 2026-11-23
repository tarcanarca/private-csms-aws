terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  # Remote state backend is an open decision (architecture.md section 13, item 14).
  # Until decided, state is local and must not be committed (.gitignore).
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "csms", Environment = "dev", ManagedBy = "terraform" }
  }
}
