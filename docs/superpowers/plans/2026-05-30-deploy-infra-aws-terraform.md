# AWS + Terraform Deployment Infrastructure Implementation Plan

> **For agentic workers:** This plan is **human-gated**. Terraform files can be written and `terraform validate`'d by an agent, but `terraform apply`, secret population, the AWS account, and GitHub OIDC/secret setup require real credentials and create billable resources with outward effects. Do NOT run `apply`, `put-secret-value`, or `gh variable set` autonomously — produce the files, then hand off the gated commands to the human. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the v1 deployment for the bot — a single EC2 `t4g.nano` running the bot as a hardened systemd service, provisioned by Terraform, deployed via GitHub Actions (OIDC → S3 artifact → SSM), per ADR 0002.

**Architecture:** One Terraform stack (`infra/prod`) in the AWS default VPC: an egress-only EC2 instance with an instance profile that reads its config from a single Secrets Manager secret and pulls build artifacts from S3. A separate one-time `infra/bootstrap` stack creates the S3 state backend. CI/CD is a GitHub Actions workflow that authenticates via OIDC (no stored keys), builds in CI, uploads an artifact to S3, and triggers `deploy.sh` on the box via SSM Run Command. No inbound ports; access and deploys both go through SSM.

**Tech Stack:** Terraform ≥ 1.10 (S3 native state locking), AWS provider ~> 5.0, Amazon Linux 2023 (arm64), Node 22, systemd, GitHub Actions.

**Prerequisites (human, before Task 1):**
- An AWS account + a local profile with admin (for the initial apply). `aws sts get-caller-identity` works.
- `terraform` ≥ 1.10 and `aws` CLI installed.
- The bot's real secret values on hand (Telegram token, Supabase URL + secret key, OpenAI key, whitelist IDs).
- Admin on the GitHub repo `chuasonglin1995/dotoree-kbot` (to add repo variables; OIDC needs no secret).
- The app-side readiness branch merged or present (this plan assumes `dist/main.js` build output and the deep `/healthz` from `2026-05-30-deploy-readiness-app-side.md`).

**Global parameters used throughout (change to taste):**
- Region: `ap-southeast-1` (Singapore). Latency to Telegram/OpenAI is non-critical; pick closest/cheapest.
- State bucket: `dotoree-kbot-tfstate` — **S3 bucket names are globally unique; if taken, change everywhere.**
- Artifact bucket: `dotoree-kbot-artifacts` — same caveat.
- GitHub repo: `chuasonglin1995/dotoree-kbot`.
- Secrets Manager secret id: `dotoree_kbot-prod` (one secret, JSON body of all env vars).
- App dir on box: `/opt/kbot` (releases in `/opt/kbot/releases/<sha>`, symlinked `current`).

---

## File Structure

```
infra/
├── bootstrap/
│   ├── main.tf            # one-time: S3 state bucket (local state)
│   └── terraform.tfvars   # bucket name (gitignored if it contains anything sensitive; here it's just a name)
└── prod/
    ├── versions.tf        # terraform + provider version pins
    ├── backend.tf         # S3 backend (native locking)
    ├── providers.tf       # aws provider + default_tags
    ├── variables.tf       # region, repo, instance_type, bucket names, alert_email
    ├── data.tf            # caller identity, default VPC, AL2023 arm64 AMI
    ├── network.tf         # egress-only security group
    ├── iam.tf             # instance role + profile (SSM core, read the config secret, KMS decrypt, read artifacts)
    ├── secrets.tf         # one Secrets Manager secret (JSON), placeholder value, ignore_changes
    ├── artifacts.tf       # S3 artifact bucket (versioned, lifecycle-expired, private)
    ├── compute.tf         # EC2 instance + user_data
    ├── alarms.tf          # SNS topic + StatusCheckFailed alarm (+ EC2 auto-recover) + AWS Budget
    ├── oidc.tf            # GitHub OIDC provider + deploy role/policy
    ├── outputs.tf         # instance_id, artifact_bucket, deploy_role_arn
    ├── user_data.sh.tpl   # bootstrap: Node 22, kbot user, systemd units, deploy.sh
    └── terraform.tfvars   # concrete values for the variables
.github/
└── workflows/
    └── deploy.yml         # CI/CD: build → OIDC → S3 → SSM Run Command
.gitignore                 # add Terraform + dist ignores
```

Each Terraform file has one responsibility (network, iam, compute, …) so the stack is readable and a change touches one concern. `user_data.sh.tpl` and the systemd units it writes are the only imperative shell.

---

### Task 1: Bootstrap the Terraform state backend

**Files:**
- Create: `infra/bootstrap/main.tf`
- Create: `infra/bootstrap/terraform.tfvars`

- [ ] **Step 1: Write `infra/bootstrap/main.tf`**

```hcl
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for Terraform state."
}

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "state_bucket" {
  value = aws_s3_bucket.tfstate.id
}
```

- [ ] **Step 2: Write `infra/bootstrap/terraform.tfvars`**

```hcl
region            = "ap-southeast-1"
state_bucket_name = "dotoree-kbot-tfstate"
```

- [ ] **Step 3: Validate (agent-safe — no credentials needed)**

Run: `cd infra/bootstrap && terraform init -backend=false && terraform validate && terraform fmt -check`
Expected: `Success! The configuration is valid.` and no fmt diffs.

- [ ] **Step 4: (HUMAN) Create the bucket**

Run:
```bash
cd infra/bootstrap
terraform init
terraform apply   # review plan, type yes
```
Expected: creates the bucket; outputs `state_bucket = "dotoree-kbot-tfstate"`. This stack uses **local** state (committed nowhere — it only ever creates the bucket once).

- [ ] **Step 5: Commit**

```bash
git add infra/bootstrap
git commit -m "infra: bootstrap stack for S3 Terraform state backend"
```

---

### Task 2: Prod stack scaffolding (versions, backend, provider, variables, data)

**Files:**
- Create: `infra/prod/versions.tf`, `infra/prod/backend.tf`, `infra/prod/providers.tf`, `infra/prod/variables.tf`, `infra/prod/data.tf`

- [ ] **Step 1: Write `infra/prod/versions.tf`**

```hcl
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

- [ ] **Step 2: Write `infra/prod/backend.tf`**

```hcl
terraform {
  backend "s3" {
    bucket       = "dotoree-kbot-tfstate"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true # S3-native state locking (Terraform >= 1.10)
  }
}
```

- [ ] **Step 3: Write `infra/prod/providers.tf`**

```hcl
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
```

- [ ] **Step 4: Write `infra/prod/variables.tf`**

```hcl
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
```

- [ ] **Step 5: Write `infra/prod/data.tf`**

```hcl
data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

# Latest Amazon Linux 2023 arm64 AMI, resolved at plan time from the public SSM parameter.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}
```

- [ ] **Step 6: Validate**

Run: `cd infra/prod && terraform init -backend=false && terraform validate && terraform fmt -check`
Expected: valid (it will report unknown resources referencing later files only once those exist; at this point with only these 5 files it should validate clean since nothing references missing symbols yet). If validate complains about undefined references, that's because later tasks add the referenced resources — proceed; you'll re-validate at the end of each task.

- [ ] **Step 7: Commit**

```bash
git add infra/prod/versions.tf infra/prod/backend.tf infra/prod/providers.tf infra/prod/variables.tf infra/prod/data.tf
git commit -m "infra(prod): stack scaffolding — versions, backend, provider, variables, data"
```

---

### Task 3: Networking — egress-only security group

**Files:**
- Create: `infra/prod/network.tf`

- [ ] **Step 1: Write `infra/prod/network.tf`**

```hcl
resource "aws_security_group" "kbot" {
  name        = "${var.project}-egress-only"
  description = "Egress-only; no inbound. Access via SSM, not SSH."
  vpc_id      = data.aws_vpc.default.id

  # NOTE: all outbound is allowed (not just 443) on purpose: the box needs DNS
  # (UDP/TCP 53) plus 443 to Telegram/OpenAI/Supabase/SSM/S3 and dnf during
  # bootstrap. Tightening to 53+443 is possible later; the security win here is
  # that there are NO ingress rules at all.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-egress-only"
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid, no fmt diffs.

- [ ] **Step 3: Commit**

```bash
git add infra/prod/network.tf
git commit -m "infra(prod): egress-only security group (no inbound; SSM for access)"
```

---

### Task 4: IAM — instance role + profile

**Files:**
- Create: `infra/prod/iam.tf`

- [ ] **Step 1: Write `infra/prod/iam.tf`**

```hcl
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.project}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM agent: enables Session Manager + Run Command (the access/deploy channel).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "ReadConfigSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.config.arn]
  }

  statement {
    sid       = "DecryptSecrets"
    actions   = ["kms:Decrypt"]
    resources = ["*"] # the AWS-managed Secrets Manager key; scope to a CMK ARN if you create one
  }

  statement {
    sid       = "ReadArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "${var.project}-runtime"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.runtime.json
}

resource "aws_iam_instance_profile" "kbot" {
  name = "${var.project}-instance"
  role = aws_iam_role.instance.name
}
```

- [ ] **Step 2: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid (references `aws_s3_bucket.artifacts` from Task 6 — if validate errors on the missing reference, complete Task 6 then re-validate; tasks 4–6 are co-dependent and validate together).

- [ ] **Step 3: Commit**

```bash
git add infra/prod/iam.tf
git commit -m "infra(prod): instance IAM role/profile — SSM core, read config secret, KMS decrypt, read artifacts"
```

---

### Task 5: Secrets — one Secrets Manager secret (JSON)

**Files:**
- Create: `infra/prod/secrets.tf`

All app config is stored as a single JSON secret (`dotoree_kbot-prod`) — ~$0.40/mo total, vs ~$0.40 *per key*. The secret is created **empty** (no value seeded in Terraform); you populate it out-of-band (Task 10). This keeps real values out of state entirely. `deploy.sh` renders `.env` from *whatever keys* the JSON contains (`jq to_entries`), so there's no fixed schema in Terraform — `src/config/env.ts` validates required keys at startup. `recovery_window_in_days = 0` lets `terraform destroy` remove the secret immediately (clean per-project teardown, no 7–30 day name-reservation window).

> Because the secret starts empty, the **first deploy fails until you set the value** (deploy.sh's `get-secret-value` has nothing to read). Populate it right after `terraform apply` (Task 10 Step 3).

- [ ] **Step 1: Write `infra/prod/secrets.tf`**

```hcl
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
```

- [ ] **Step 2: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid.

- [ ] **Step 3: Commit**

```bash
git add infra/prod/secrets.tf
git commit -m "infra(prod): Secrets Manager JSON config secret (placeholder; value set out-of-band)"
```

---

### Task 6: Artifact S3 bucket

**Files:**
- Create: `infra/prod/artifacts.tf`

- [ ] **Step 1: Write `infra/prod/artifacts.tf`**

```hcl
resource "aws_s3_bucket" "artifacts" {
  bucket = var.artifact_bucket_name
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Keep the bucket tidy: expire old build artifacts.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid.

- [ ] **Step 3: Commit**

```bash
git add infra/prod/artifacts.tf
git commit -m "infra(prod): private, versioned S3 artifact bucket with lifecycle expiry"
```

---

### Task 7: Compute — EC2 instance + user_data bootstrap

**Files:**
- Create: `infra/prod/compute.tf`
- Create: `infra/prod/user_data.sh.tpl`

- [ ] **Step 1: Write `infra/prod/compute.tf`**

```hcl
resource "aws_instance" "kbot" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.kbot.name
  vpc_security_group_ids = [aws_security_group.kbot.id]

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    region          = var.region
    artifact_bucket = aws_s3_bucket.artifacts.id
    project         = var.project
  })

  # Force IMDSv2.
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project}-prod"
  }
}
```

- [ ] **Step 2: Write `infra/prod/user_data.sh.tpl`**

```bash
#!/usr/bin/env bash
set -euxo pipefail

# --- Node 22 (arm64) + tooling ---
dnf install -y nodejs22 nodejs22-npm tar gzip jq awscli || dnf install -y nodejs npm tar gzip jq
# AL2023 ships Node via dnf; if the versioned package name differs, fall back to the default.
ln -sf "$(command -v node)" /usr/local/bin/node || true

# --- app user + dirs ---
id kbot >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/kbot --shell /usr/sbin/nologin kbot
mkdir -p /opt/kbot/releases /opt/kbot/.cache/audio
chown -R kbot:kbot /opt/kbot

# --- deploy script (pulled artifact -> release dir -> render env -> swap symlink -> restart) ---
cat >/opt/kbot/deploy.sh <<'DEPLOY'
#!/usr/bin/env bash
set -euo pipefail
SHA="$1"
REGION="${region}"
BUCKET="${artifact_bucket}"
REL="/opt/kbot/releases/$SHA"

aws s3 cp "s3://$BUCKET/kbot-$SHA.tgz" "/tmp/kbot-$SHA.tgz" --region "$REGION"
mkdir -p "$REL"
tar -xzf "/tmp/kbot-$SHA.tgz" -C "$REL"
cd "$REL"
npm ci --omit=dev

# render /opt/kbot/.env from the Secrets Manager JSON secret
aws secretsmanager get-secret-value --secret-id dotoree_kbot-prod --region "$REGION" \
  --query SecretString --output text \
  | jq -r 'to_entries[] | "\(.key)=\(.value)"' > /opt/kbot/.env
chmod 600 /opt/kbot/.env
chown kbot:kbot /opt/kbot/.env

ln -sfn "$REL" /opt/kbot/current
chown -R kbot:kbot "$REL"

systemctl restart kbot

# keep only the last 5 releases
ls -dt /opt/kbot/releases/*/ | tail -n +6 | xargs -r rm -rf
DEPLOY
chmod +x /opt/kbot/deploy.sh

# --- systemd: main service ---
cat >/etc/systemd/system/kbot.service <<'UNIT'
[Unit]
Description=Dotoree Kbot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kbot
WorkingDirectory=/opt/kbot/current
ExecStart=/usr/bin/env node dist/main.js
EnvironmentFile=/opt/kbot/.env
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/kbot

[Install]
WantedBy=multi-user.target
UNIT

# --- systemd: health probe (deep /healthz) ---
cat >/etc/systemd/system/kbot-health.service <<'UNIT'
[Unit]
Description=Probe kbot /healthz and restart if unhealthy

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3000/healthz
ExecStopPost=/bin/sh -c 'systemctl is-failed --quiet kbot-health.service && systemctl restart kbot.service'
UNIT

cat >/etc/systemd/system/kbot-health.timer <<'UNIT'
[Unit]
Description=Run kbot health probe every minute

[Timer]
OnBootSec=120s
OnUnitActiveSec=60s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
# Enable on boot. kbot will crash-loop (Restart=always) until the first deploy
# delivers code + /opt/kbot/.env; that is expected and harmless.
systemctl enable kbot.service kbot-health.timer
systemctl start kbot-health.timer || true
```

- [ ] **Step 3: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid. (`templatefile` is evaluated at plan time; if a `${...}` in the bash heredocs is wrongly interpreted as a Terraform interpolation, validate/plan will error. The only intended Terraform substitutions are `${region}`, `${artifact_bucket}`, `${project}`. The systemd `<<'UNIT'` heredocs are single-quoted so the shell won't expand them, but **Terraform's templatefile still scans the whole file** — there are no other `${}` sequences in the units, so this is safe. If you later add a shell `${VAR}` to the template, escape it as `$${VAR}`.)

- [ ] **Step 4: Commit**

```bash
git add infra/prod/compute.tf infra/prod/user_data.sh.tpl
git commit -m "infra(prod): EC2 t4g.nano + user_data (Node 22, kbot user, systemd units, deploy.sh)"
```

---

### Task 8: Alarms — SNS, StatusCheckFailed (+auto-recover), Budget

**Files:**
- Create: `infra/prod/alarms.tf`

- [ ] **Step 1: Write `infra/prod/alarms.tf`**

```hcl
resource "aws_sns_topic" "alerts" {
  name = "${var.project}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Host-level failure: alert + EC2 auto-recover.
resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  alarm_name          = "${var.project}-status-check-failed"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.kbot.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions = [
    aws_sns_topic.alerts.arn,
    "arn:aws:automate:${var.region}:ec2:recover",
  ]
  ok_actions = [aws_sns_topic.alerts.arn]
}

# Cost guardrail: catch accidental NAT/egress/instance-size surprises.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = "15"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: valid.

- [ ] **Step 3: Commit**

```bash
git add infra/prod/alarms.tf
git commit -m "infra(prod): SNS alerts, StatusCheckFailed alarm with auto-recover, monthly budget"
```

---

### Task 9: GitHub OIDC provider + deploy role

**Files:**
- Create: `infra/prod/oidc.tf`
- Create: `infra/prod/outputs.tf`

- [ ] **Step 1: Write `infra/prod/oidc.tf`**

```hcl
# The GitHub OIDC provider is account-wide (one per URL) and is typically shared
# across projects. Look it up instead of creating it (creating a duplicate errors
# with EntityAlreadyExists). If your account has NONE yet, create it once with a
# `resource "aws_iam_openid_connect_provider"` and switch this to reference it.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "UploadArtifacts"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    sid       = "FindInstanceByTag"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"] # DescribeInstances does not support resource-level scoping
  }
  statement {
    sid     = "TriggerDeploy"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.kbot.id}",
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }
  statement {
    sid       = "ReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${var.project}-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
```

- [ ] **Step 2: Write `infra/prod/outputs.tf`**

```hcl
output "instance_id" {
  value = aws_instance.kbot.id
}

output "artifact_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "region" {
  value = var.region
}
```

- [ ] **Step 3: Validate the whole stack**

Run: `cd infra/prod && terraform validate && terraform fmt -check`
Expected: `Success! The configuration is valid.` with all files present.

- [ ] **Step 4: Commit**

```bash
git add infra/prod/oidc.tf infra/prod/outputs.tf
git commit -m "infra(prod): GitHub OIDC provider + scoped deploy role; stack outputs"
```

---

### Task 10: Apply the stack + populate secrets + first manual deploy (HUMAN)

**Files:**
- Create: `infra/prod/terraform.tfvars`

- [ ] **Step 1: Write `infra/prod/terraform.tfvars`**

```hcl
region               = "ap-southeast-1"
artifact_bucket_name = "dotoree-kbot-artifacts"
alert_email          = "chuasonglin1995@gmail.com"
github_repo          = "chuasonglin1995/dotoree-kbot"
```

- [ ] **Step 2: (HUMAN) Init + apply**

```bash
cd infra/prod
terraform init      # configures the S3 backend created in Task 1
terraform plan      # review: ~1 instance, SG, IAM, Secrets Manager secret, S3, alarms, OIDC
terraform apply     # type yes
```
Expected: outputs `instance_id`, `artifact_bucket`, `deploy_role_arn`, `region`. Confirm the SNS email subscription (check inbox, click confirm).

- [ ] **Step 3: (HUMAN) Populate the real secret value**

Write all config as one JSON object into the secret (this never touches Terraform state). Put the real values in a local `secrets.json` (gitignored — `*.tgz`/`.env` are ignored, but **do not commit this file**) and load it with `file://` to avoid shell-history/quoting issues:
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
  --secret-id dotoree_kbot-prod \
  --secret-string file:///tmp/kbot-secret.json

rm -f /tmp/kbot-secret.json   # don't leave secrets on disk
```
> Use a **separate bot token from your local dev** (ADR 0001: one instance per token).
> Verify (names only, no secret values): `aws secretsmanager get-secret-value --secret-id dotoree_kbot-prod --region ap-southeast-1 --query SecretString --output text | jq 'keys'`

- [ ] **Step 4: (HUMAN) Build + upload a first artifact, then deploy via SSM**

```bash
# from repo root
npm ci && npm run build
SHA=$(git rev-parse --short HEAD)
tar -czf kbot-$SHA.tgz dist package.json package-lock.json
aws s3 cp kbot-$SHA.tgz s3://dotoree-kbot-artifacts/ --region ap-southeast-1

IID=$(terraform -chdir=infra/prod output -raw instance_id)
aws ssm send-command --region ap-southeast-1 \
  --instance-ids "$IID" \
  --document-name AWS-RunShellScript \
  --comment "first deploy $SHA" \
  --parameters commands="/opt/kbot/deploy.sh $SHA"
```

- [ ] **Step 5: (HUMAN) Verify the bot is alive**

```bash
aws ssm start-session --region ap-southeast-1 --target "$IID"
# on the box:
systemctl status kbot --no-pager
curl -s localhost:3000/healthz | jq    # expect ok:true, non-null lastTelegramOkAtMs
journalctl -u kbot -n 50 --no-pager    # expect "Telegraf bot launched (polling)."
```
Then message the bot on Telegram — it should reply. No commit (this step is operational).

---

### Task 11: CI/CD — GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write   # required for OIDC
  contents: read

concurrency:
  group: deploy-prod
  cancel-in-progress: false   # never overlap deploys (single-instance bot)

env:
  AWS_REGION: ap-southeast-1
  ARTIFACT_BUCKET: dotoree-kbot-artifacts
  AWS_DEPLOY_ROLE_ARN: arn:aws:iam::892532234259:role/kbot-github-deploy
  INSTANCE_NAME: kbot-prod   # the EC2 Name tag; looked up at deploy time

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run build

      - name: Package artifact
        run: tar -czf "kbot-${GITHUB_SHA::7}.tgz" dist package.json package-lock.json

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ env.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Find the EC2 instance by Name tag
        run: |
          IID=$(aws ec2 describe-instances --region "$AWS_REGION" \
            --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
            --query 'Reservations[0].Instances[0].InstanceId' --output text)
          if [ -z "$IID" ] || [ "$IID" = "None" ]; then
            echo "::error::no running instance tagged Name=$INSTANCE_NAME"; exit 1
          fi
          echo "IID=$IID" >> "$GITHUB_ENV"
          echo "instance: $IID"

      - name: Upload artifact to S3
        run: aws s3 cp "kbot-${GITHUB_SHA::7}.tgz" "s3://${ARTIFACT_BUCKET}/"

      - name: Trigger deploy via SSM
        run: |
          CMD_ID=$(aws ssm send-command \
            --instance-ids "$IID" \
            --document-name AWS-RunShellScript \
            --comment "deploy ${GITHUB_SHA::7}" \
            --parameters commands="/opt/kbot/deploy.sh ${GITHUB_SHA::7}" \
            --query 'Command.CommandId' --output text)
          echo "command: $CMD_ID"
          aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$IID" || true
          aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
            --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
            --output json
```

> No GitHub repo variables needed: the role ARN + region are hardcoded in `env:` (not
> secret), and the instance is looked up by its `Name=kbot-prod` tag at deploy time, so the
> workflow survives a box rebuild (new instance ID) with no edits. The deploy role grants
> `ec2:DescribeInstances` for that lookup.

- [ ] **Step 2: Append Terraform + dist ignores to `.gitignore`**

Add these lines to `.gitignore` (create the file if missing — the repo already ignores `.cache`):

```gitignore
# Terraform
**/.terraform/*
*.tfstate
*.tfstate.*
.terraform.lock.hcl
crash.log

# Build output
dist/
*.tgz
```

> Keep `infra/prod/terraform.tfvars` committed (it holds only non-secret config + an email). If you'd rather not commit the email, gitignore it and document the variables instead.

- [ ] **Step 3: (HUMAN) — nothing to set**

No GitHub repo variables are required. The role ARN, region, and artifact bucket are
hardcoded in the workflow's `env:` (none are secret), and the instance is looked up by its
`Name=kbot-prod` tag at deploy time. If you ever rename the repo/account/role, update the
hardcoded `AWS_DEPLOY_ROLE_ARN` in `.github/workflows/deploy.yml`.

- [ ] **Step 4: Validate the workflow locally (agent-safe)**

Run: `npx --yes @action-validator/cli .github/workflows/deploy.yml 2>/dev/null || echo "validator unavailable — eyeball the YAML"`
Expected: no schema errors (or a manual eyeball if the validator isn't available).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "ci: deploy workflow (OIDC -> S3 artifact -> SSM Run Command) + terraform gitignore"
```

---

### Task 12: End-to-end pipeline verification + rollback drill (HUMAN)

**Files:** none (operational).

- [ ] **Step 1: Trigger a real deploy**

Push a trivial change to `main` (or merge this branch). Watch the Action: it should build, test, upload the artifact, and the SSM step should print `Status: Success` with the `deploy.sh` stdout.

- [ ] **Step 2: Confirm the new release is live**

```bash
aws ssm start-session --region ap-southeast-1 --target "$(terraform -chdir=infra/prod output -raw instance_id)"
# on the box:
ls -l /opt/kbot/current            # symlink points at releases/<new-sha>
ls /opt/kbot/releases              # at most 5 release dirs
curl -s localhost:3000/healthz | jq
```

- [ ] **Step 3: Rollback drill**

On the box, repoint `current` at the previous release and restart:
```bash
PREV=$(ls -dt /opt/kbot/releases/*/ | sed -n 2p)
sudo ln -sfn "$PREV" /opt/kbot/current
sudo systemctl restart kbot
curl -s localhost:3000/healthz | jq   # still ok
```
Confirm the bot recovers. Then redeploy latest (re-run the Action) to return to current. No commit.

---

## Self-Review

**Spec coverage** (against `2026-05-29-deployment-target-design.md` → "Deployment work breakdown (v1)"):
- Terraform S3 state + native locking → Task 1, Task 2 (`backend.tf`). ✅
- Public subnet + public IP + egress-only SG, **no NAT** → Task 3 (default VPC auto-assigns public IP in default subnets). ✅ (Corrected the design's "443-only" to all-egress because DNS/dnf need more than 443; noted inline.)
- AL2023 arm64 + Node 22 + non-root `kbot` + systemd hardening + correct `WorkingDirectory` → Task 7. ✅
- Secrets Manager (single JSON secret) rendered into `EnvironmentFile`; instance role scoped to the secret ARN → Task 4, Task 5, Task 7 (`deploy.sh`). ✅
- Build-in-CI + artifact + release dirs + `current` symlink rollback → Task 7 (`deploy.sh`), Task 11, Task 12. ✅
- GitHub OIDC provider + deploy role + Actions → S3 → SSM → Task 9, Task 11. ✅
- Deep `/healthz` self-heal via systemd timer; `StatusCheckFailed` alarm; journald (default) → Task 7, Task 8. ✅ (journald retention cap `SystemMaxUse` not set — see deliberate cut below.)
- AWS Budget; EC2 auto-recovery; audio-cache eviction → Task 8 (budget + auto-recover). **Audio-cache eviction NOT implemented** — see deliberate cut.
- Single-instance: separate dev token → called out in Task 10 Step 3. ✅
- SSM access; EC2 Instance Connect break-glass → SSM throughout; **Instance Connect break-glass not codified** — see deliberate cut.

**Deliberate cuts (named so they aren't mistaken for gaps):**
- **journald retention cap** (`SystemMaxUse`) — minor; an 8 GB disk with low log volume won't fill soon. Add a `journald.conf` drop-in in a follow-up if desired.
- **Audio-cache eviction** — the cache lives under `/opt/kbot/.cache/audio` and is regenerable; on a low-traffic bot it grows slowly. A `systemd` timer running `find … -mtime +N -delete` is a small follow-up, not v1-blocking.
- **EC2 Instance Connect break-glass** — works out-of-the-box on AL2023 without extra Terraform (ephemeral keys, no standing port); documented as the fallback in the design doc. No resource needed unless you want to restrict it.
- **Observability stack** (Prometheus/Grafana/CloudWatch metrics) — explicitly deferred per ADR 0002.

**Placeholder scan:** none — the secret is created empty and its value is set out-of-band (Task 10); no fake values live in Terraform or state. Bucket names / account-specific values are parameterized via variables/tfvars.

**Consistency check:** region (`ap-southeast-1`), bucket names, `/kbot/prod/` SSM prefix, `/opt/kbot` paths, and the `kbot-<sha>.tgz` artifact name are identical across `user_data.sh.tpl` (`deploy.sh`), the workflow, and the manual commands. The `${GITHUB_SHA::7}` short-SHA in CI matches the `git rev-parse --short HEAD` used in the Task 10 manual deploy.

**Known fragility to watch on first apply:** `templatefile` scans `user_data.sh.tpl` for `${...}`; only `${region}`, `${artifact_bucket}`, `${project}` are intended. If you add shell `${VAR}` expansions later, escape them `$${VAR}` or `terraform plan` will fail. Flagged inline in Task 7 Step 3.

---

## Relationship to the other plan

This plan assumes the app-side readiness work (`2026-05-30-deploy-readiness-app-side.md`) is present: the deep `/healthz` (so `kbot-health.timer` is meaningful), the graceful shutdown (so SSM-triggered `systemctl restart` flushes the poll offset cleanly), and the `dist/main.js` build output (so `ExecStart=node dist/main.js` and the artifact tarball resolve). Land that branch first.
```
