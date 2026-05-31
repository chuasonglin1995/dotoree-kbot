# Deployment (AWS + Terraform)

Operator runbook for the bot's v1 deployment. For *why* it's built this way, see
[ADR 0001 (polling)](../docs/adr/0001-bot-transport-mode-polling-vs-webhook.md) and
[ADR 0002 (EC2 host)](../docs/adr/0002-deployment-host-ec2.md). For the first-time
build, follow the step-by-step
[infra plan](../docs/superpowers/plans/2026-05-30-deploy-infra-aws-terraform.md).
This README is the day-to-day operational guide.

## What this is

A single always-on EC2 `t4g.nano` runs the bot as a hardened systemd service. Polling
(not webhook), so the box is **egress-only** — no inbound ports. Access and deploys both
go over **AWS SSM** (no SSH, no stored keys). CI builds the app, drops a release artifact
in S3, and triggers a deploy on the box via SSM.

```
push to main
  └─ GitHub Actions: npm ci → test → build → tar → (OIDC) → upload kbot-<sha>.tgz to S3
       └─ aws ssm send-command → runs /opt/kbot/deploy.sh <sha> ON the box
            └─ deploy.sh: pull artifact from S3 → npm ci --omit=dev
                          → render /opt/kbot/.env from Secrets Manager
                          → repoint /opt/kbot/current symlink → systemctl restart kbot
```

Config/secrets live in one AWS Secrets Manager secret (`dotoree_kbot-prod`, a JSON object).
DB is external (Supabase). Audio cache is local + regenerable.

## Layout

- `bootstrap/` — run **once**, ever. Creates the S3 bucket that holds Terraform state. Uses local state.
- `prod/` — the actual deployment (EC2, IAM, secret, artifact bucket, alarms, OIDC). State lives in the bootstrap bucket.

## First-time setup

Full detail (with every command + expected output) is in the
[infra plan](../docs/superpowers/plans/2026-05-30-deploy-infra-aws-terraform.md). The gated
sequence, in brief:

```bash
# 0. Terraform >= 1.10 required (Homebrew core is frozen at 1.5.7; use hashicorp/tap or tfenv)
terraform version

# 1. bootstrap the state bucket (once)
cd infra/bootstrap && tf init && tf apply

# 2. stand up prod
cd ../prod && tf init && tf plan && tf apply
#    -> note the outputs: instance_id, artifact_bucket, deploy_role_arn, region

# 3. confirm the SNS subscription email (chuasonglin1995@gmail.com)

# 4. set the real secret values (see "Rotating / updating secrets" below)

# 5. first deploy (see "Deploying" -> manual)

# 6. wire CI: set GitHub repo variables
gh variable set AWS_DEPLOY_ROLE_ARN --body "$(tf -chdir=infra/prod output -raw deploy_role_arn)"
gh variable set KBOT_INSTANCE_ID    --body "$(tf -chdir=infra/prod output -raw instance_id)"
```

## Deploying

**Normal path:** push to `main`. The `deploy` GitHub Action builds, tests, uploads the
artifact, and triggers `deploy.sh` via SSM. Watch it under the repo's Actions tab; the
final step prints the on-box deploy stdout.

**Manual path** (first deploy, or when CI is unavailable):

```bash
npm ci && npm run build
SHA=$(git rev-parse --short HEAD)
tar -czf kbot-$SHA.tgz dist package.json package-lock.json
aws s3 cp kbot-$SHA.tgz s3://dotoree-kbot-artifacts/ --region ap-southeast-1

IID=$(tf -chdir=infra/prod output -raw instance_id)
aws ssm send-command --region ap-southeast-1 \
  --instance-ids "$IID" \
  --document-name AWS-RunShellScript \
  --comment "manual deploy $SHA" \
  --parameters commands="/opt/kbot/deploy.sh $SHA"
```

> Deploys are stop-then-start (single-instance polling). Expect a few seconds of silence;
> Telegram queues messages and replays them when the new version comes up.

## Accessing the box

No SSH — use SSM (no inbound port needed):

```bash
IID=$(tf -chdir=infra/prod output -raw instance_id)
aws ssm start-session --region ap-southeast-1 --target "$IID"

# on the box:
systemctl status kbot --no-pager          # is it running?
curl -s localhost:3000/healthz | jq        # deep health (ok / telegram / cron freshness)
journalctl -u kbot -n 100 --no-pager       # app logs (incl. "[health] telegram getMe failed: ..." on outages)
journalctl -u kbot-health.service -n 50    # health-probe restarts
ls -l /opt/kbot/current                     # which release is live
```

To hit `/healthz` from your laptop without opening a port, port-forward over SSM:

```bash
aws ssm start-session --region ap-southeast-1 --target "$IID" \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}'
# then: curl localhost:3000/healthz
```

Break-glass if the SSM agent ever wedges: **EC2 Instance Connect** (ephemeral key, no standing port).

## Rolling back

Previous releases stay on disk (`/opt/kbot/releases/`, last 5 kept). On the box:

```bash
PREV=$(ls -dt /opt/kbot/releases/*/ | sed -n 2p)   # the release before current
sudo ln -sfn "$PREV" /opt/kbot/current
sudo systemctl restart kbot
curl -s localhost:3000/healthz | jq
```

To return to latest, re-run the deploy (push, or the manual deploy above).

## Rotating / updating secrets

All config is one JSON secret (`dotoree_kbot-prod`). Terraform creates it **empty** — you
must set the value before the first deploy (or that deploy fails, since `deploy.sh` reads
the secret to render `/opt/kbot/.env`). `deploy.sh` writes *whatever keys* the JSON contains
to `.env`, so to add a new env var you just add a key here — no Terraform change needed.
The change takes effect on the **next deploy/restart**.

```bash
cat > /tmp/kbot-secret.json <<'JSON'
{
  "TELEGRAM_BOT_TOKEN": "REAL_PROD_BOT_TOKEN",
  "SUPABASE_URL": "https://xxxx.supabase.co",
  "SUPABASE_SECRET_KEY": "REAL_SUPABASE_SECRET",
  "OPENAI_API_KEY": "REAL_OPENAI_KEY",
  "OPENAI_MODEL": "gpt-4.1-mini",
  "OPENAI_TTS_MODEL": "gpt-4o-mini-tts",
  "WHITELISTED_TELEGRAM_IDS": "123456789,987654321",
  "PORT": "3000"
}
JSON
aws secretsmanager put-secret-value --region ap-southeast-1 \
  --secret-id dotoree_kbot-prod --secret-string file:///tmp/kbot-secret.json
rm -f /tmp/kbot-secret.json

# apply now without a code change:
aws ssm start-session --region ap-southeast-1 --target "$IID"   # then on box: sudo /opt/kbot/deploy.sh <current-sha>
```

Notes:
- Use a **separate bot token from local dev** — only one instance may poll a token (ADR 0001).
- Inspect keys (not values): `aws secretsmanager get-secret-value --secret-id dotoree_kbot-prod --region ap-southeast-1 --query SecretString --output text | jq 'keys'`
- Real values never touch Terraform state or git (Terraform seeds a placeholder and `ignore_changes`).

## Monitoring

| Failure | Detected by | Self-heals? | Alerts you? |
|---|---|---|---|
| Host/VM dead | CloudWatch `StatusCheckFailed` | ✅ EC2 auto-recover | ✅ email via SNS |
| `node` process crashed | systemd `Restart=always` | ✅ | ❌ |
| Process up but wedged (poll loop / cron stuck) | `kbot-health.timer` probing deep `/healthz` → 503 | ✅ restart | ❌ |

**Known gap (deferred, ADR 0002):** app-level failures *self-heal* but do **not** page you.
There is no "the bot itself stopped answering" alert yet. To add one, wire an **outbound
heartbeat** (e.g. the `node-cron` job pings Healthchecks.io; alert fires when pings stop) or
push a CloudWatch heartbeat metric + missing-data alarm. The `AWS Budget` ($15/mo, alerts at
80%) is a separate cost guardrail.

## Cost

~**$4.40/mo**: EC2 `t4g.nano` + 8 GB gp3 (~$4) + Secrets Manager single secret (~$0.40).
S3/SSM/SNS/CloudWatch/OIDC are effectively free at this scale. The budget alarm catches
surprises (e.g. an accidental NAT gateway, which would be ~$32/mo).

## Teardown

Removes everything cleanly (the secret has `recovery_window_in_days = 0`, so no name-reservation window):

```bash
cd infra/prod      && tf destroy   # EC2, IAM, secret, artifact bucket, alarms, OIDC
cd ../bootstrap    && tf destroy   # the state bucket (do this LAST; empty it first if versioned objects block deletion)
```

> `terraform destroy` on prod will fail to delete a non-empty artifact bucket if objects
> remain — empty it first (`aws s3 rm s3://dotoree-kbot-artifacts --recursive`) or accept the
> error and remove the bucket manually.
