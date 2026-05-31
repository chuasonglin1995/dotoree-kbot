variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "kbot"
}

variable "github_repo" {
  type        = string
  description = "owner/name of the GitHub repo allowed to assume the deploy role."
  default     = "chuasonglin1995/dotoree-kbot"
}

variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "artifact_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket for build artifacts."
}

variable "alert_email" {
  type        = string
  description = "Email to subscribe to the SNS alerts topic."
}
