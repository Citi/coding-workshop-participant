# NFR-ARCH-4, NFR-SEC-3: "the platform publishes and version-controls
# the exact IAM policy document organizers must attach to the
# cross-account role, so it can be audited and diffed release over
# release." This file IS that published document.
#
# The platform's CodeBuild project (in the PLATFORM's account) runs the
# `.organizer/infra` Terraform for your event by assuming THIS role, so the
# role carries what that Terraform needs -- the same permissions
# `.organizer/bin/create-codebuild.sh` gives the service role of the
# legacy per-account project, minus what the platform does itself:
#   - NO codebuild:* -- nothing is created in your account for building;
#     builds run in the platform's account and reach yours only through
#     this role.
#   - NO route53:* -- the workshop DNS record lives in the platform's
#     account and is updated with the platform's own credentials.
#   - NO database permissions (event/participant data lives in the
#     platform's own Aurora DSQL, not here), NO ses:* (platform-owned,
#     NFR-ARCH-9).
# backend/tests/test_cross_account_role_template.py fails if this falls behind
# create-codebuild.sh's policy (other than the two exclusions above and the narrowings listed
# below), so a permission the Terraform needs cannot be missing here without a test saying so.
#
# What this role deliberately cannot do, which create-codebuild.sh's policy could:
#   - iam:*, kms:*, sts:* on every resource. IAM is limited to the coding-workshop- roles, the one service role
#     WorkSpaces needs, and a short list of AWS managed policies that may be attached (never AdministratorAccess);
#     nothing here creates or schedules the deletion of a KMS key; sts is GetCallerIdentity only.
#   - deleting a VPC, subnet, route table, internet gateway, security group, VPC endpoint, directory or WorkSpace that
#     does not carry the tag application=coding-workshop. Every resource the workshop and network Terraform create
#     carries it (provider default_tags), so the role can clean up after itself and cannot remove yours.
# A second, much smaller role (backup) is created next to this one for the backup job, which only reads.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

data "aws_partition" "this" {}
data "aws_caller_identity" "this" {}

locals {
  # .organizer/bin/create-codebuild.sh's own naming convention -- every
  # resource this role's policy scopes by name uses this same prefix,
  # so a resource this account's existing per-event pipeline didn't
  # create can never match.
  name_prefix = "coding-workshop-"

  # Every AWS managed policy the Terraform in .organizer/infra attaches to a role. A test keeps this equal to what the
  # Terraform names.
  managed_policy_arns = [
    for path in [
      "service-role/AWSLambdaVPCAccessExecutionRole",
      "service-role/AWSLambdaBasicExecutionRole",
      "AmazonEKSClusterPolicy",
      "AmazonEKSWorkerNodePolicy",
      "AmazonEKS_CNI_Policy",
      "AmazonEC2ContainerRegistryReadOnly",
      "service-role/AmazonEBSCSIDriverPolicy",
      "AmazonWorkSpacesServiceAccess",
      "AmazonWorkSpacesSelfServiceAccess",
      "AmazonWorkSpacesPoolServiceAccess",
    ] : "arn:${data.aws_partition.this.partition}:iam::aws:policy/${path}"
  ]

  # AWS managed policies a module the Terraform uses only reads, never attaches: terraform-aws-modules/lambda reads
  # AWSLambdaENIManagementAccess for attach_network_policy and copies it into an inline policy. Readable, so not in
  # managed_policy_arns, which is also the list AttachOnlyTheseManagedPolicies allows to be attached.
  readable_managed_policy_arns = concat(local.managed_policy_arns, [
    for path in [
      "service-role/AWSLambdaENIManagementAccess",
    ] : "arn:${data.aws_partition.this.partition}:iam::aws:policy/${path}"
  ])
}

resource "aws_iam_role" "this" {
  name = var.role_name

  # FR-CRED-1: "an IAM Role ARN ... with an external ID, which the
  # platform assumes via STS." The external ID condition is the actual
  # security boundary here, not the principal restriction alone --
  # anyone who learns this role's ARN still cannot assume it without
  # also knowing var.external_id.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:${data.aws_partition.this.partition}:iam::${var.platform_account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "sts:ExternalId" = var.external_id }
      }
    }]
  })

  # The build re-assumes this role by itself when a session runs out, so this only bounds
  # how long one session may be; four hours covers a whole provisioning run in one.
  max_session_duration = 14400
}

resource "aws_iam_role_policy" "this" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.this.id

  policy = data.aws_iam_policy_document.this.json
}

data "aws_iam_policy_document" "this" {
  # FR-CRED-4's readiness check reads this role's own policy back
  # (adapters/aws/readiness_checker.py's iam:ListRolePolicies/
  # iam:GetRolePolicy calls) to diff it against this same published
  # template -- the role needs permission to introspect itself for that
  # to work at all.
  statement {
    sid       = "SelfIntrospection"
    effect    = "Allow"
    actions   = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"]
    resources = [aws_iam_role.this.arn]
  }

  # FR-CRED-4: "a reachable S3 bucket for Terraform state." When the organizer supplies a bucket of their own
  # (variables.tf's terraform_state_bucket_arn) the role is scoped to exactly that one -- object-level access plus
  # listing, no bucket management. Left out, the console creates its own state buckets, named coding-workshop-...,
  # which the S3Buckets statement below already covers (including creating and deleting them).
  dynamic "statement" {
    for_each = var.terraform_state_bucket_arn == null ? [] : [var.terraform_state_bucket_arn]
    content {
      sid       = "TerraformStateBucket"
      effect    = "Allow"
      actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      resources = [statement.value, "${statement.value}/*"]
    }
  }

  # What the workshop Terraform needs from services whose APIs cannot be narrowed by resource (create-time
  # identifiers, describe/list calls). Mirrors the first statement of create-codebuild.sh's policy, without
  # codebuild:*, route53:*, iam:*, kms:* and sts:* (see the header).
  statement {
    sid    = "ServicesWithoutResourceScoping"
    effect = "Allow"
    actions = [
      "cloudwatch:*", "ds:*", "ec2:*", "kms:DescribeKey", "kms:ListAliases", "lambda:ListFunctions", "logs:e*",
      "rds:Describe*", "resource-groups:*", "sts:GetCallerIdentity", "tag:*", "workspaces:*",
    ]
    resources = ["*"]
  }

  # Deleting what is not the console's. The workshop and network Terraform tag everything they create with
  # application=coding-workshop (provider default_tags), and a delete of one of these kinds of resource is refused
  # unless the resource has it. Only deletes: creation and ordinary changes carry no such condition, so a first run in
  # a fresh account does not depend on tag-on-create behaviour. Every action named here supports the aws:ResourceTag
  # condition key for the resource it acts on (an action that did not would be denied outright, tag or not).
  statement {
    sid    = "NeverDeleteWhatIsNotTagged"
    effect = "Deny"
    actions = [
      "ec2:DeleteVpc", "ec2:DeleteSubnet", "ec2:DeleteRouteTable", "ec2:DeleteInternetGateway", "ec2:DeleteSecurityGroup",
      "ec2:DeleteVpcEndpoints", "ec2:TerminateInstances",
      "ds:DeleteDirectory",
      "workspaces:TerminateWorkspaces", "workspaces:DeregisterWorkspaceDirectory",
    ]
    resources = ["*"]
    condition {
      test     = "Null"
      variable = "aws:ResourceTag/application"
      values   = ["true"]
    }
  }

  statement {
    sid       = "DynamoDbTables"
    effect    = "Allow"
    actions   = ["dynamodb:*"]
    resources = ["arn:${data.aws_partition.this.partition}:dynamodb:*:${data.aws_caller_identity.this.account_id}:table/*"]
  }

  statement {
    sid     = "Ec2Resources"
    effect  = "Allow"
    actions = ["ec2:*"]
    resources = [
      for kind in ["instance", "internet-gateway", "launch-template", "network-interface", "route-table", "security-group", "subnet", "vpc", "vpc-endpoint"] :
      "arn:${data.aws_partition.this.partition}:ec2:*:${data.aws_caller_identity.this.account_id}:${kind}/*"
    ]
  }

  statement {
    sid       = "EcrRepositories"
    effect    = "Allow"
    actions   = ["ecr:*"]
    resources = ["arn:${data.aws_partition.this.partition}:ecr:*:${data.aws_caller_identity.this.account_id}:repository/${local.name_prefix}*"]
  }

  statement {
    sid     = "IamRoles"
    effect  = "Allow"
    actions = ["iam:*"]
    resources = [
      "arn:${data.aws_partition.this.partition}:iam::${data.aws_caller_identity.this.account_id}:role/workspaces_DefaultRole",
      "arn:${data.aws_partition.this.partition}:iam::${data.aws_caller_identity.this.account_id}:role/${local.name_prefix}*",
      "arn:${data.aws_partition.this.partition}:iam::${data.aws_caller_identity.this.account_id}:role/service-role/${local.name_prefix}*",
    ]
  }

  # The AWS managed policies the workshop Terraform attaches (infra/iam.tf, infra/locals.tf) and nothing else, so a role
  # this one creates cannot be given AdministratorAccess. Reading a managed policy needs no more than naming it; the
  # ones a module only reads are listed too.
  statement {
    sid       = "IamManagedPolicies"
    effect    = "Allow"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"]
    resources = local.readable_managed_policy_arns
  }

  # IamRoles lets the role manage the coding-workshop- roles, which includes attaching policies to them; this keeps what it
  # may attach to the AWS managed policies listed above. (A role can still be given an inline policy, which no condition
  # can limit; closing that needs a permissions boundary on the roles the Terraform creates.)
  statement {
    sid       = "AttachOnlyTheseManagedPolicies"
    effect    = "Deny"
    actions   = ["iam:AttachRolePolicy"]
    resources = ["*"]
    condition {
      test     = "ArnNotEquals"
      variable = "iam:PolicyARN"
      values   = local.managed_policy_arns
    }
  }

  # WorkSpaces and Directory Service create their own service-linked roles the first time they are used in an account.
  statement {
    sid       = "ServiceLinkedRoles"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:${data.aws_partition.this.partition}:iam::${data.aws_caller_identity.this.account_id}:role/aws-service-role/*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["workspaces.amazonaws.com", "ds.amazonaws.com"]
    }
  }

  statement {
    sid       = "LambdaFunctions"
    effect    = "Allow"
    actions   = ["lambda:*"]
    resources = ["arn:${data.aws_partition.this.partition}:lambda:*:${data.aws_caller_identity.this.account_id}:function:${local.name_prefix}*"]
  }

  statement {
    sid     = "LogGroups"
    effect  = "Allow"
    actions = ["logs:*"]
    resources = concat(
      ["arn:${data.aws_partition.this.partition}:logs:*:${data.aws_caller_identity.this.account_id}:log-group:*:log-stream:*"],
      [
        for group in ["codebuild", "eks", "lambda", "rds/cluster", "rds/instance"] :
        "arn:${data.aws_partition.this.partition}:logs:*:${data.aws_caller_identity.this.account_id}:log-group:/aws/${group}/${local.name_prefix}*"
      ],
    )
  }

  statement {
    sid     = "S3Buckets"
    effect  = "Allow"
    actions = ["s3:*"]
    resources = [
      "arn:${data.aws_partition.this.partition}:s3:::${local.name_prefix}*",
      "arn:${data.aws_partition.this.partition}:s3:::${local.name_prefix}*/*",
    ]
  }

  statement {
    sid       = "SqsQueues"
    effect    = "Allow"
    actions   = ["sqs:*"]
    resources = ["arn:${data.aws_partition.this.partition}:sqs:*:${data.aws_caller_identity.this.account_id}:${local.name_prefix}*"]
  }

  statement {
    sid     = "WorkspacesResources"
    effect  = "Allow"
    actions = ["workspaces:*"]
    resources = [
      "arn:${data.aws_partition.this.partition}:ds:*:${data.aws_caller_identity.this.account_id}:directory/*",
      "arn:${data.aws_partition.this.partition}:workspaces:*:${data.aws_caller_identity.this.account_id}:directory/*",
      "arn:${data.aws_partition.this.partition}:workspaces:*:${data.aws_caller_identity.this.account_id}:workspace/*",
      "arn:${data.aws_partition.this.partition}:workspaces:*:${data.aws_caller_identity.this.account_id}:workspacebundle/*",
    ]
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# The backup role. A backup only finds an event's WorkSpaces, starts the stopped ones so their files can be read, and
# copies the participants' code out of the event's own bucket; it needs none of the workshop Terraform's rights. The
# console uses this role for backups when you give it its ARN, and the workshop role above when you do not.
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "backup" {
  count = var.create_backup_role ? 1 : 0

  name = "${var.role_name}-backup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:${data.aws_partition.this.partition}:iam::${var.platform_account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "sts:ExternalId" = var.external_id }
      }
    }]
  })

  max_session_duration = 14400
}

resource "aws_iam_role_policy" "backup" {
  count = var.create_backup_role ? 1 : 0

  name   = "${var.role_name}-backup-policy"
  role   = aws_iam_role.backup[0].id
  policy = data.aws_iam_policy_document.backup[0].json
}

data "aws_iam_policy_document" "backup" {
  count = var.create_backup_role ? 1 : 0

  statement {
    sid       = "SelfIntrospection"
    effect    = "Allow"
    actions   = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"]
    resources = [aws_iam_role.backup[0].arn]
  }

  statement {
    sid       = "FindWorkspaces"
    effect    = "Allow"
    actions   = ["workspaces:DescribeWorkspaces", "workspaces:DescribeWorkspaceDirectories", "sts:GetCallerIdentity"]
    resources = ["*"]
  }

  statement {
    sid       = "StartStoppedWorkspaces"
    effect    = "Allow"
    actions   = ["workspaces:StartWorkspaces"]
    resources = ["arn:${data.aws_partition.this.partition}:workspaces:*:${data.aws_caller_identity.this.account_id}:workspace/*"]
  }

  statement {
    sid       = "ReadTheEventsBucket"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = ["arn:${data.aws_partition.this.partition}:s3:::${local.name_prefix}*", "arn:${data.aws_partition.this.partition}:s3:::${local.name_prefix}*/*"]
  }
}
