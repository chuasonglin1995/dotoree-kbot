# A single Secrets Manager secret holding ALL app config as a JSON object
# (one secret => ~$0.40/mo, vs ~$0.40 PER key). Real values are set out-of-band
# with `aws secretsmanager put-secret-value` (see plan Task 10); ignore_changes
# on secret_string means Terraform won't read or overwrite the real values.
resource "aws_secretsmanager_secret" "config" {
  name        = "dotoree_kbot-prod"
  description = "All env config for the kbot prod bot (JSON)."

  # Delete immediately on `terraform destroy` (no 7-30 day recovery window),
  # so the project — including its secret — tears down cleanly and can be re-created.
  recovery_window_in_days = 0
}

# Seed a placeholder version so the secret is immediately readable. The real
# values are written out-of-band; ignore_changes keeps Terraform from reverting them.
resource "aws_secretsmanager_secret_version" "config" {
  secret_id = aws_secretsmanager_secret.config.id
  secret_string = jsonencode({
    TELEGRAM_BOT_TOKEN       = "PLACEHOLDER"
    SUPABASE_URL             = "PLACEHOLDER"
    SUPABASE_SECRET_KEY      = "PLACEHOLDER"
    OPENAI_API_KEY           = "PLACEHOLDER"
    OPENAI_MODEL             = "gpt-4.1-mini"
    OPENAI_TTS_MODEL         = "gpt-4o-mini-tts"
    WHITELISTED_TELEGRAM_IDS = "PLACEHOLDER"
    PORT                     = "3000"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
