resource "aws_eks_cluster" "this" {
  count    = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  name     = format("%s-%s", var.aws_project, local.app_id)
  version  = "1.36"
  role_arn = local.eks_role_arn

  vpc_config {
    endpoint_public_access = true
    subnet_ids = local.public_subnet_ids
  }

  tags = local.app_tags
}

resource "aws_eks_fargate_profile" "this" {
  count                  = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  cluster_name           = one(aws_eks_cluster.this.*.name)
  fargate_profile_name   = format("%s-%s", var.aws_project, local.app_id)
  subnet_ids             = local.public_subnet_ids
  pod_execution_role_arn = local.eks_role_arn

  selector {
    namespace = "default"
  }

  selector {
    namespace = "kube-system"
  }

  tags = local.app_tags
}

resource "null_resource" "helm_chart" {
  count = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0

  triggers = {
    source_code_hash = one(aws_eks_cluster.this.*.name)
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws eks update-kubeconfig --region us-east-1 --name ${one(aws_eks_cluster.this.*.name)} && \
      helm repo add jupyterhub https://jupyter.org && \
      helm repo update && \
      helm upgrade --cleanup-on-fail \
        --install jupyterhub jupyterhub/jupyterhub \
        --namespace jupyter --values config.yaml
    EOT
  }
}
