# One Secrets Manager secret holding ALL app config as a JSON object
# (one secret => ~$0.40/mo, vs ~$0.40 PER key).
#
# We intentionally do NOT seed a value here — the secret is created empty and you
# populate it out-of-band (Console UI, or `aws secretsmanager put-secret-value`;
# see infra/README.md). That keeps real values out of Terraform state entirely,
# and the bot validates required keys at startup (src/config/env.ts).
#
# Expected JSON keys:
#   TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY,
#   OPENAI_MODEL, OPENAI_TTS_MODEL, WHITELISTED_TELEGRAM_IDS, PORT
#
# NOTE: until you set the value, the first deploy will fail (deploy.sh reads this
# secret to render /opt/kbot/.env). Populate it right after `terraform apply`.
resource "aws_secretsmanager_secret" "config" {
  name        = "dotoree_kbot-prod"
  description = "All env config for the kbot prod bot (JSON object)."

  # Delete immediately on `terraform destroy` (no 7-30 day recovery window),
  # so the project — including its secret — tears down cleanly and can be re-created.
  recovery_window_in_days = 0
}
