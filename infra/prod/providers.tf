provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "dotoree-kbot"
      Env       = "prod"
      ManagedBy = "terraform"
    }
  }
}
