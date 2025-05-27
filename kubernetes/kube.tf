provider "hcloud" {
  token = var.hcloud_token
}

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = ">= 1.43.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.7.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.26.0"
    }
  }
}

variable "hcloud_token" {
  sensitive = true
  default   = ""
}

module "kube-hetzner" {
  providers = {
    hcloud = hcloud
  }
  hcloud_token = var.hcloud_token

  source = "github.com/kube-hetzner/terraform-hcloud-kube-hetzner"
  cluster_name = "autofun-cluster"

  ssh_public_key  = file("~/.ssh/id_ed25519.pub")
  ssh_private_key = file("~/.ssh/id_ed25519")

  network_region = "eu-central"

  control_plane_nodepools = [
    {
      name        = "control-plane"
      server_type = "cpx31"
      location    = "fsn1"
      count       = 3
      labels = [
        "node.kubernetes.io/role=control-plane"
      ]
      taints = []
    }
  ]

  agent_nodepools = [
    {
      name        = "agent-pool"
      server_type = "cpx51"
      location    = "fsn1"
      count       = 4
      longhorn_volume_size = 100
      labels = [
        "node.kubernetes.io/role=agent"
      ]
      taints = []
    }
  ]

  autoscaler_nodepools = [
    {
      name        = "autoscaler-pool"
      server_type = "cpx51"
      location    = "fsn1"
      min_nodes   = 0
      max_nodes   = 2
      labels = {
        "node.kubernetes.io/role" = "autoscaler"
      }
      taints = [
        {
          key    = "node.kubernetes.io/role"
          value  = "autoscaler"
          effect = "NoSchedule"
        }
      ]
    }
  ]

  enable_longhorn = true

  load_balancer_type     = "lb21"
  load_balancer_location = "fsn1"

  ingress_controller = "nginx"

  initial_k3s_channel = "v1.29"

  cluster_autoscaler_version   = "20240226"
  cluster_autoscaler_log_level = 4
}

output "kubeconfig" {
  value     = module.kube-hetzner.kubeconfig
  sensitive = true
}