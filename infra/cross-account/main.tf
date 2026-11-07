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
  name_prefix = "coding-workshop-"

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

  readable_managed_policy_arns = concat(local.managed_policy_arns, [
    for path in [
      "service-role/AWSLambdaENIManagementAccess",
    ] : "arn:${data.aws_partition.this.partition}:iam::aws:policy/${path}"
  ])
}

resource "aws_iam_role" "this" {
  name = var.role_name

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

resource "aws_iam_role_policy" "this" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.this.id

  policy = data.aws_iam_policy_document.this.json
}

data "aws_iam_policy_document" "this" {
  statement {
    sid       = "SelfIntrospection"
    effect    = "Allow"
    actions   = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"]
    resources = [aws_iam_role.this.arn]
  }

  dynamic "statement" {
    for_each = var.terraform_state_bucket_arn == null ? [] : [var.terraform_state_bucket_arn]
    content {
      sid       = "TerraformStateBucket"
      effect    = "Allow"
      actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      resources = [statement.value, "${statement.value}/*"]
    }
  }

  statement {
    sid    = "ServicesWithoutResourceScoping"
    effect = "Allow"
    actions = [
      "cloudwatch:*", "ds:*", "ec2:*", "kms:DescribeKey", "kms:ListAliases", "lambda:ListFunctions", "logs:e*",
      "rds:Describe*", "resource-groups:*", "sts:GetCallerIdentity", "tag:*", "workspaces:*",
    ]
    resources = ["*"]
  }

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

  statement {
    sid       = "IamManagedPolicies"
    effect    = "Allow"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"]
    resources = local.readable_managed_policy_arns
  }

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
