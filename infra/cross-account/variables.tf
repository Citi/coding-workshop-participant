# FR-CRED-1: an organizer runs this Terraform root once, in their own
# AWS account, then pastes the resulting role_arn output plus the
# external_id they chose here back into the console's "connect AWS
# account" form.

variable "platform_account_id" {
  description = "The platform's own AWS account ID (332991882156 for the hosted instance) -- the only principal this role's trust policy ever allows to assume it."
  type        = string
  default     = "332991882156"
}

variable "external_id" {
  description = "A value only you and the platform know, entered here and in the console's connect form -- this is what stops a confused-deputy attack (a third party who somehow learns this role's ARN still cannot assume it without also knowing this). Generate one with `openssl rand -hex 16` or similar; do not reuse a value from another integration."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.external_id) >= 16
    error_message = "external_id should be at least 16 characters -- a short or guessable value defeats its purpose."
  }
}

variable "role_name" {
  description = "NFR-SEC-3: kept configurable, not hardcoded, so an organizer running this more than once (e.g. separate roles per environment) can avoid a name collision. The console's readiness check (FR-CRED-4) reads this role's own policy by the ARN you supply, not by name, so renaming it here needs no corresponding console-side change."
  type        = string
  default     = "organizer-console-cross-account"
}

variable "terraform_state_bucket_arn" {
  description = "Optional. ARN of a bucket of your own (one not named coding-workshop-...) that you will give the console as an event's Terraform state bucket (FR-CRED-4's 'reachable S3 bucket for Terraform state'); scopes the role's access to it. Leave it out to let the console create its own buckets: they are named coding-workshop-..., which the role can already manage."
  type        = string
  default     = null
}

variable "create_backup_role" {
  description = "Also create the small role the console uses for backups (it only reads WorkSpaces and the event's bucket). Give its ARN to the console alongside the main role's; without it, backups use the main role."
  type        = bool
  default     = true
}
