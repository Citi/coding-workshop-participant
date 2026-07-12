module "eks" {
  count   = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name       = format("%s-cluster-%s", var.aws_project, local.app_id)
  vpc_id     = data.aws_security_groups.this.ids
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

resource "helm_release" "this" {
  count           = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? 1 : 0
  repository      = "https://jupyter.org"
  name            = "jupyterhub"
  chart           = "jupyterhub"
  version         = "2.1.0"
  namespace       = "jupyter"
  atomic          = true
  cleanup_on_fail = true

  # repository = "https://jupyterhub.github.io/helm-chart/"
  values = [
    yamlencode({
      proxy = {
        chp = {
          nodeSelector = { "kubernetes.io/os" = "linux" }
        }
      }
      hub = {
        cookieSecret = random_pet.this.id
        nodeSelector = { "kubernetes.io/os" = "linux" }
        config = {
          JupyterHub = {
            authenticator_class = "ldapauthenticator.LDAPAuthenticator"
          }
          LDAPAuthenticator = {
            server_address   = "://yourdomain.com"
            server_port      = 389
            bind_dn_template = "CN={username},OU=Users,OU=CORP,DC=corp,DC=codingworkshop,DC=net"
            user_attribute   = "sAMAccountName"
            allowed_groups   = ["CN=JupyterUsers,OU=Groups,OU=CORP,DC=corp,DC=codingworkshop,DC=net"]
          }
        }
      }
      singleuser = {
        nodeSelector  = { "kubernetes.io/os" = "linux" }
        cloudMetadata = { blockWithIptables = false }
        image = {
          name = "jupyter/datascience-notebook"
          tag  = "latest"
        }
      }
    })
  ]

  depends_on = [module.eks]
}
