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

variable "ssm_parameters" {
  description = "App env vars stored in SSM Parameter Store. secure=true => SecureString."
  type        = map(object({ secure = bool }))
  default = {
    TELEGRAM_BOT_TOKEN       = { secure = true }
    SUPABASE_URL             = { secure = false }
    SUPABASE_SECRET_KEY      = { secure = true }
    OPENAI_API_KEY           = { secure = true }
    OPENAI_MODEL             = { secure = false }
    OPENAI_TTS_MODEL         = { secure = false }
    WHITELISTED_TELEGRAM_IDS = { secure = false }
    PORT                     = { secure = false }
  }
}
