resource "aws_eks_cluster" "this" {
  count    = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  name     = format("%s-%s", var.aws_project, local.app_id)
  version  = "1.36"
  role_arn = local.eks_role_arn

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    endpoint_public_access  = true
    endpoint_private_access = true
    subnet_ids              = local.public_subnet_ids
  }

  tags = local.app_tags
}

resource "aws_eks_node_group" "this" {
  count           = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  cluster_name    = one(aws_eks_cluster.this.*.name)
  node_group_name = format("%s-%s", var.aws_project, local.app_id)
  node_role_arn   = local.eks_role_arn
  subnet_ids      = local.public_subnet_ids
  capacity_type   = "SPOT" # Use "ON_DEMAND" or "SPOT"
  instance_types  = ["t3.medium", "t3a.medium", "t2.medium"]
  disk_size       = 50

  scaling_config {
    desired_size = 1
    max_size     = 1
    min_size     = 1
  }

  update_config {
    max_unavailable = 1
  }

  tags = local.app_tags
}

resource "null_resource" "helm_chart" {
  count = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0

  triggers = {
    source_code_hash = one(aws_eks_node_group.this.*.id)
    aws_ds_ip        = var.aws_ds_ip
  }

  provisioner "local-exec" {
    command = <<-EOT
      if [ -z "${var.aws_ds_ip}" ] || [ "${var.aws_ds_ip}" = "null" ]; then echo "ERROR: aws_ds_ip is not set"; exit 1; fi && \
      aws eks update-kubeconfig --region ${data.aws_region.this.region} --name ${one(aws_eks_cluster.this.*.name)} && \
      helm upgrade --cleanup-on-fail \
        --install jupyterhub https://hub.jupyter.org/helm-chart/ \
        --set hub.config.LDAPAuthenticator.server_address=${var.aws_ds_ip} \
        --namespace default
    EOT
  }
}

resource "null_resource" "helm_python_job" {
  for_each = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? local.data_names_python : {}

  triggers = {
    source_code_hash = one(aws_eks_node_group.this.*.id)
    script_hash      = filemd5(format("%s/%s", each.value.path, each.value.file))
  }

  provisioner "local-exec" {
    command = <<-EOT
      helm upgrade --cleanup-on-fail \
        --install ${replace(each.key, "_", "-")}-python-job ./helm/ \
        --set pythonJob.enabled=true \
        --set pythonJob.name=${replace(each.key, "_", "-")} \
        --set-file pythonJob.scriptContent=${each.value.path}/${each.value.file} \
        --namespace default
    EOT
  }

  depends_on = [null_resource.helm_chart]
}
