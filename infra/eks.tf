module "eks" {
  count   = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name       = format("%s-cluster-%s", var.aws_project, local.app_id)
  vpc_id     = data.aws_vpc.this.id
  subnet_ids = local.public_subnet_ids

  kubernetes_version                       = "1.36"
  create_auto_mode_iam_resources           = true
  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  compute_config = {
    enabled = true
  }

  fargate_profiles = {
    jupyter = {
      name      = format("%s-fargate-%s", var.aws_project, local.app_id)
      selectors = [{ namespace = "jupyter"}, { namespace = "kube-system"}]
    }
  }

  tags = local.app_tags
}

resource "null_resource" "helm_chart" {
  count = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0

  triggers = {
    source_code_hash = module.eks.cluster_arn
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws eks update-kubeconfig --region us-east-1 --name ${module.eks.cluster_name} && \
      helm repo add jupyterhub https://jupyter.org && \
      helm repo update && \
      helm upgrade --cleanup-on-fail \
        --install jupyterhub jupyterhub/jupyterhub \
        --namespace jupyter --values config.yaml
    EOT
  }
}
