output "role_arn" {
  description = "Paste this into the console's 'connect AWS account' form, alongside the external_id you chose in variables.tf."
  value       = aws_iam_role.this.arn
}

output "backup_role_arn" {
  description = "Paste this into the console's optional 'Backup role ARN' field. Same external ID as the main role."
  value       = var.create_backup_role ? aws_iam_role.backup[0].arn : null
}
