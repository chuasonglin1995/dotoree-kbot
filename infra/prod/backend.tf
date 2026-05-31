terraform {
  backend "s3" {
    bucket       = "dotoree-kbot-tfstate"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true # S3-native state locking (Terraform >= 1.10)
  }
}
