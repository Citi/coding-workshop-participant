# Cross-Account Role Template

Run this Terraform root **once, in your own AWS account** — not the
platform's — to create the IAM role the Organizer Console assumes to
provision, back up, and clean up your event's resources.

A session of this role lasts up to four hours; the build re-assumes it by
itself if a run is longer.

## Usage

```sh
cd infra/cross-account

# Generate an external ID -- a value only you and the platform know.
# This is the actual security boundary: keep it as secret
# as a password, and never reuse one from another integration.
openssl rand -hex 16

terraform init
terraform apply -var="external_id=<the value you just generated>"
```

Then, in the console, connect your AWS account using:
- **Role ARN**: this run's `role_arn` output.
- **External ID**: the same value you generated above.
- There is no state bucket or VPC to enter: the console creates both in your account when provisioning starts (a
  private, encrypted, versioned `coding-workshop-...` bucket for each event, and a dedicated VPC with public subnets and
  no NAT gateway shared by your events in that region) and removes them after cleanup. (A connection made earlier with a
  bucket or VPC of its own keeps using it, and the connection summary says so.)

- **Backup role ARN** (optional): this run's `backup_role_arn` output. Backups then assume this small read-only role
  (it can find and start WorkSpaces and read the event's `coding-workshop-...` bucket, nothing else) instead of the main
  role. Pass `-var="create_backup_role=false"` if you do not want it; backups then use the main role.

To use a state bucket of your own whose name does not start with `coding-workshop-`, also pass
`-var="terraform_state_bucket_arn=arn:aws:s3:::<your-terraform-state-bucket>"` so the role may read and write it.

## What the main role cannot do

The role is limited to what the workshop and network Terraform need, and cannot reach the rest of your account:

- no `kms:*` (it cannot create a key or schedule one for deletion), no `sts:*` beyond `GetCallerIdentity`, and `iam:*`
  only on the `coding-workshop-` roles (and `workspaces_DefaultRole`);
- it can attach only the AWS managed policies the Terraform attaches (never `AdministratorAccess`);
- it cannot **delete** a VPC, subnet, route table, internet gateway, security group, VPC endpoint, directory or WorkSpace
  that lacks the tag `application=coding-workshop`. Everything the console's Terraform creates has it; your own
  resources do not, so a cleanup cannot remove them.

If a run fails with `AccessDenied` or `explicit deny` after you update the role, the CloudTrail event for that call
names the action and resource; send it with the build log.

A role can still be given an *inline* policy by the Terraform that creates it; no IAM condition limits that.

## Updating

When a new console release changes this template (tracked in this
file's own git history — "audited and diffed release over release"),
re-run `terraform apply` with the same variables to update the role's
policy in place. The role ARN and external ID do not change,
so nothing needs re-entering in the console.

## Removing

`terraform destroy` removes the role. The console will report the
event's AWS connection as invalid on its next readiness check —
reconnect with a new role to keep provisioning. Pasted session
credentials are no longer accepted: the build can only reach your
account by assuming this role.

## Moving from the older template

An earlier template created a CodeBuild project and a service role *in your
account*. Those are no longer used. Re-apply this template (same variables,
same external ID) to give the role what the Terraform now needs, then delete
the old project and its role by hand if you want them gone:

```sh
aws codebuild delete-project --name coding-workshop-<region>
aws iam delete-role-policy --role-name coding-workshop-<region> --policy-name coding-workshop-<region>-policy
aws iam delete-role --role-name coding-workshop-<region>
```
