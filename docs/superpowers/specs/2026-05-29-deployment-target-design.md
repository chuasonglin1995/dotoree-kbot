# Deployment target design: EC2 vs ECS Fargate

- Date: 2026-05-29
- Author: songlin
- Status: Decided — **EC2 `t4g.nano`** chosen (recorded in [ADR 0002](../../adr/0002-deployment-host-ec2.md))
- Depends on: [ADR 0001 — Bot transport mode (polling)](../../adr/0001-bot-transport-mode-polling-vs-webhook.md)

> This is a design/reference doc, **not an ADR**. It captures the full EC2-vs-Fargate
> comparison, health-check mechanics, and observability plumbing so the eventual ADR
> 0002 can stay lean (decision + consequences) and link here for detail.

## Context

ADR 0001 committed us to **long-polling**, which requires a **single, always-on, long-running process** (the Telegram poll loop plus the in-process `node-cron` coach scheduler). That ADR deferred the host choice. We want to deploy on **AWS**, managed by **Terraform**, as cheaply as is reasonable while staying reliable.

This doc compares the two realistic AWS compute targets for a single always-on container — **EC2** and **ECS Fargate** — across cost, operations, deployment, health checking, and observability.

### Workload profile (what we're actually deploying)

- **One Node 22 process.** Polling loop + `node-cron` every 30 min. No public inbound — only outbound HTTPS to Telegram, OpenAI, and Supabase.
- **No managed database needed.** Supabase is external (its own hosting + free tier).
- **Tiny footprint.** ~512 MB RAM is ample. Single user + a few test users (per ADR 0001), negligible message volume.
- **Audio cache (`./.cache/audio`) is regenerable.** It is a cache, not durable state — losing it on restart costs a few re-synthesis calls.
- **Secrets:** `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, plus `WHITELISTED_TELEGRAM_IDS`.

### A note on "serverless"

Fargate is "serverless" only in the sense of **no host you manage** — it is *not* scale-to-zero/event-driven like Lambda. An always-on Fargate task is a **long-running process**, billed continuously, so it satisfies ADR 0001's polling requirement exactly as EC2 does. The EC2-vs-Fargate choice is therefore **cost vs. ops effort**, not an architectural conflict with ADR 0001. (A move to *Lambda*-style FaaS would re-open ADR 0001; Fargate does not.)

## Option A — EC2 `t4g.nano` (Graviton/ARM)

A small ARM Linux VM we own. The bot runs as a **systemd service** (no Docker required — no sidecars, and the DB is external). Terraform provisions the instance, security group (egress-only), IAM role for SSM, and a user-data bootstrap script.

- **Cost:** ~$3.10/mo instance (on-demand) + ~$0.80/mo for an 8 GB EBS root ≈ **~$4/mo**.
- **What we manage:** the OS (patches, kernel reboots), the Node runtime, process supervision.
- **Deploy unit:** source on the box (`git pull` → `npm ci` → `build` → `systemctl restart`), or a prebuilt artifact.
- **Disk:** EBS persists across restarts, so the audio cache survives "for free" (a nice-to-have, not required).
- **Self-healing:** `Restart=always` covers crashes; a systemd timer + `/healthz` probe covers "wedged but alive." Instance-death recovery needs an Auto Scaling Group (extra Terraform) — likely overkill for one bot.

### EC2 deployment process (systemd, no Docker — the lean path)

```
# one-time, via Terraform user-data: install Node 22, clone, write unit files,
# inject secrets, enable service
ssh/SSM → cd /opt/kbot → git pull → npm ci → npm run build → sudo systemctl restart kbot
```

No registry, no image build. The one chunk of imperative shell is the user-data bootstrap.

### EC2 base service unit

```ini
# /etc/systemd/system/kbot.service
[Unit]
Description=Dotoree Kbot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/kbot
ExecStart=/usr/bin/node dist/main.js
EnvironmentFile=/opt/kbot/.env
Restart=always
RestartSec=5
User=kbot

[Install]
WantedBy=multi-user.target
```

## Option B — ECS Fargate (0.25 vCPU / 0.5 GB, `desiredCount: 1`)

A container AWS runs for us — no VM to patch. Terraform provisions an ECR repo, ECS cluster, task definition, service, IAM roles, and a CloudWatch log group (default VPC is fine).

- **Cost:** ~**$9/mo** for one always-on task (0.25 vCPU + 0.5 GB), billed whether it handles 1 message or 10,000.
- **What we manage:** the container image and task definition. AWS owns and patches the host.
- **Deploy unit:** an image — `docker build` → push to ECR → roll the service.
- **Disk:** ephemeral. Audio cache rebuilds after every deploy/restart (fine — it's regenerable). Durable cache would mean EFS (added cost/complexity).
- **Self-healing:** built in. The task definition `healthCheck` curls `localhost/healthz` *inside* the container; ECS replaces an unhealthy or crashed task automatically.

### Fargate deployment process (image-based — required)

```
docker build -t kbot . → docker push <ECR>/kbot:<tag> → aws ecs update-service --force-new-deployment
```

All declarative Terraform, no bootstrap shell — but more AWS resources and a build/push step on every deploy.

## Comparison

| Dimension | **EC2 `t4g.nano`** | **ECS Fargate** |
|---|---|---|
| Monthly cost | **~$4** | ~$9 |
| Mental model | A small Linux VM you own | A container AWS runs; no VM |
| OS patching | **You** (`apt`/`dnf`, reboots) | **AWS** (no host visible) |
| Container registry | Optional (can run Node bare) | **Required** (ECR) |
| Process supervision | systemd (`Restart=always`) | ECS service (`desiredCount: 1`) |
| Crash self-heal | systemd restarts process | ECS replaces task |
| "Wedged but alive" self-heal | systemd timer + `/healthz` (you build) | task `healthCheck` curls `/healthz` (native) |
| Instance/host death | Manual restart, or ASG (extra TF) | Automatic |
| Disk for audio cache | Persists on EBS (free bonus) | Ephemeral (rebuilt each deploy) |
| Logs off-box | CloudWatch agent (opt-in) | CloudWatch via `awslogs` (automatic) |
| Terraform footprint | 1 instance + SG + IAM + user-data shell | ECR + cluster + task def + service + IAM + log group |
| Deploy flow | `ssh`/SSM → pull → build → restart | build → push ECR → roll service |
| Pairs with CI/CD later | Yes (SSM-based deploy) | Yes, naturally (ECR + ECS) |
| Best when optimizing for… | **the dollar** | **never touching a box** |

## Health checking

`/healthz` already exists on the Fastify server (`src/server.ts`), but two things matter:

1. **Make it a *deep* check.** For a polling bot, "Fastify returns 200" is a weak signal — the process can be up while the poll loop or cron is wedged. `/healthz` should report and gate on: time since last successful `getUpdates`, time since last cron tick, and a quick Supabase ping. Return non-2xx when any is stale.
2. **It is not reachable from the internet** (egress-only SG). It's consumed *internally* by the platform health check and *on demand* by you via SSM — never by a public curl.

### EC2 health check (assembled from systemd)

`Restart=always` (above) handles crash recovery. For "wedged but alive," add a timer + probe:

```ini
# /etc/systemd/system/kbot-health.timer
[Unit]
Description=Kbot health probe
[Timer]
OnUnitActiveSec=60s
OnBootSec=60s
[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/kbot-health.service
[Unit]
Description=Probe kbot /healthz and restart if unhealthy
[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS --max-time 5 http://localhost:3000/healthz
ExecStopPost=/bin/sh -c 'systemctl is-failed --quiet kbot-health.service && systemctl restart kbot.service'
```

Because `/healthz` is a *deep* check, a wedged poll loop returns non-2xx → probe fails → bot restarts. Enable: `systemctl enable --now kbot.service kbot-health.timer`.

*(Optional, more elegant)* `Type=notify` + `WatchdogSec=120s` with `sd_notify` — the app pets the watchdog only while the poll loop is genuinely alive; systemd restarts if petting stops. Costs a few lines in the bot and tracking `lastSuccessfulPollAt`.

### Fargate health check (native)

```jsonc
// task definition container healthCheck
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:3000/healthz || exit 1"],
  "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 20
}
```

ECS replaces the task on failure. No timers to write.

### Verifying either from your laptop without opening a port

- **EC2:** `aws ssm start-session --target <id>` then `curl localhost:3000/healthz`, or SSM `AWS-StartPortForwardingSession` to tunnel `:3000` to your laptop.
- **Fargate:** `aws ecs execute-command … --command "curl -f localhost:3000/healthz"`.

## Observability

The same three pillars apply to both targets; only the *plumbing* differs. The bot is **egress-only**, so anything pull-based (Prometheus scraping in) doesn't work from outside — the durable pattern is **expose `/metrics` locally + a local agent/sidecar that `remote_write`s out**.

### Metrics → Prometheus

App metrics (messages handled, OpenAI latency, cron runs, errors) are instrumented with `prom-client` and exposed on `/metrics` on the **existing Fastify server**. CloudWatch is *not* in this path. CloudWatch only matters for AWS-originated *infra* metrics, and only if we want them unified into Prometheus.

**EC2:**
- Bot exposes `/metrics` on localhost.
- Run a lightweight agent on the box — **Grafana Alloy** or **Prometheus agent mode** — that scrapes `localhost:3000/metrics` and `node_exporter` (CPU/mem/disk), then **`remote_write`s** over HTTPS to **Grafana Cloud (free tier)** or **Amazon Managed Prometheus (AMP)**.
- Infra metrics come from `node_exporter` (more granular than CloudWatch). CloudWatch is largely bypassed.

```
bot :3000/metrics ──scraped by local agent──> agent remote_writes ──HTTPS──> remote Prometheus
   (localhost)        (Grafana Alloy / Prom-agent)                          (Grafana Cloud / AMP)
```

**Fargate:**
- Bot exposes `/metrics`.
- Add an **ADOT (AWS Distro for OpenTelemetry) collector sidecar** in the task definition that scrapes the app container and `remote_write`s to **AMP** (the AWS-blessed path) or Grafana Cloud.
- Container/infra metrics come from **CloudWatch Container Insights**; bridge into Prometheus via the ADOT collector or a CloudWatch metric stream *only if* we want them alongside app metrics.

### Logs

- **EC2:** logs go to `journalctl` on the box by default. To centralize, install the **CloudWatch agent** (opt-in) or ship via the same Alloy/Vector agent to Loki/Grafana Cloud.
- **Fargate:** the `awslogs` driver streams stdout/stderr to **CloudWatch Logs automatically** — no agent. Optionally fan out to Loki via a `firelens`/Fluent Bit sidecar.

### Health & uptime alerting

`/healthz` + platform self-heal keeps the bot *up*; alerting tells *you* when it isn't. Because the bot is egress-only, the natural pattern is an **outbound heartbeat (dead-man's switch)** rather than inbound polling:
- The `node-cron` job pings **Healthchecks.io / Better Stack** (free tiers) each run; if pings stop, *they* alert you. Works identically on EC2 and Fargate.
- Alternatively, a **Prometheus/Grafana "no data" alert** when `remote_write` goes silent, or a **CloudWatch alarm** on a custom heartbeat metric (all-AWS).
- Cheapest end-to-end sanity check: message the bot and see if it replies — exercises poll → handle → OpenAI → send in one shot.

### Observability summary

| Pillar | EC2 | Fargate |
|---|---|---|
| App metrics → Prometheus | `prom-client` on `/metrics` → Grafana Alloy / Prom-agent → `remote_write` (Grafana Cloud / AMP) | `prom-client` on `/metrics` → ADOT sidecar → `remote_write` (AMP / Grafana Cloud) |
| Infra metrics | `node_exporter` on the box (CloudWatch bypassed) | CloudWatch Container Insights (bridge via ADOT if unifying) |
| Logs | `journalctl`; CloudWatch agent or Alloy to centralize | CloudWatch Logs automatic via `awslogs` |
| Health self-heal | systemd timer + deep `/healthz` (you build) | task `healthCheck` (native) |
| Uptime alerting | Outbound heartbeat (Healthchecks.io) or Prom/CloudWatch "no data" | same |
| On-demand probe | SSM session / port-forward | ECS Exec |

The key portability point: **app metrics and the outbound-heartbeat pattern are identical on both targets**, so the observability story doesn't lock us into either compute choice.

## Decision (v1)

**EC2 `t4g.nano`**, for the reasons above: cheapest reliable AWS shape (~$4/mo vs ~$9/mo), a single low-traffic bot never stresses a nano, and the polling + "stop-then-start deploy is fine" stance from ADR 0001 means we don't need Fargate's orchestration polish yet. The only real cost is *our* OS-patching minutes — small at this scale, and `Restart=always` + a systemd `/healthz` timer recover the failure modes that matter.

**No Docker Compose** (one service, external DB — nothing to orchestrate). The decision is recorded in [ADR 0002](../../adr/0002-deployment-host-ec2.md).

### Resolved open questions

- **EC2 or Fargate?** → **EC2.**
- **Environments?** → **Prod only** for v1; separate bot token for local dev so it never steals prod updates. Staging deferred.
- **Terraform state?** → **S3 backend + native locking** (small bootstrap step first).
- **Observability?** → **Deferred.** Ship compute + CI/CD with `journalctl` + systemd self-heal + the (near-free) `StatusCheckFailed` alarm. Add the metrics/alerting stack when we want *paging*, not just self-heal.
- **Secrets?** → **one AWS Secrets Manager secret** (`dotoree_kbot-prod`, JSON of all env vars) rendered into an `EnvironmentFile`, not a hand-placed `.env`. (Revised from SSM Parameter Store during infra build — both teardown cleanly via `terraform destroy`; chose the purpose-built secrets vault. ~$0.40/mo as one JSON secret.)
- **Region** — pick closest-to-cheapest; latency to Telegram/OpenAI is not critical.

## CI/CD evolution by stage

A ladder that adds machinery only when something demands it (mirrors ADR 0001's "ship simple, revisit when assumptions change"). **All stages authenticate via GitHub OIDC** — no long-lived AWS keys in GitHub secrets; the OIDC provider + role is set up once in stage 1 and reused.

| Stage | Adopt when | Flow | Why it earns its keep |
|---|---|---|---|
| **1 (v1)** | now | Actions → OIDC → **S3 artifact → SSM Send Command** | Zero infra, no open ports, build-in-CI spares the nano |
| **2** | you add an ASG / want health-gated deploys | Actions → OIDC → S3 → **CodeDeploy** | Rolling replace, health checks, **auto-rollback** |
| **3** | you go fully containerised | Actions → OIDC → **ECR → ECS (Fargate)** | No EC2 to manage; Terraform shines on declarative task/service |

**Polling caveat for stage 2:** true *concurrent* zero-downtime needs N>1 instances, but ADR 0001 forbids that on polling (instances race on `getUpdates`). So on polling, CodeDeploy's value is **auto-rollback + health-gated single-instance replacement**, not concurrent zero-downtime. True zero-downtime would require moving to webhook (re-opening ADR 0001) or accepting a brief gap.

## Deployment work breakdown (v1)

Grounded in the actual code: graceful shutdown already exists (`src/main.ts:60-61`) but isn't awaited; `/healthz` is currently shallow (`src/server.ts:5`); the audio cache path is **relative to CWD** (`src/main.ts:47`).

**Terraform foundation**
- S3 state bucket (versioned) + native locking; bootstrap before main stack. Module layout: `network`, `compute`, `iam-oidc`, `ssm-secrets`.

**Networking — ⚠️ cost gotcha**
- Public subnet + public IP + **egress-only** security group (outbound 443 only, zero inbound rules).
- **No NAT gateway** — a private subnet would force a ~$32/mo NAT (8× the box). Public IP + locked-down SG is cheaper *and* sufficient (SSM = no inbound anyway).

**Compute & runtime**
- Amazon Linux 2023 **arm64**; Node 22 via user-data. Deps are pure-JS (verify clean on ARM).
- Run as non-root `kbot`; systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths` for the cache).
- `WorkingDirectory=/opt/kbot/current` so the relative `./.cache/audio` path resolves.

**Secrets**
- One Secrets Manager secret (`dotoree_kbot-prod`, JSON); instance role scoped to `secretsmanager:GetSecretValue` on that ARN + `kms:Decrypt`; rendered into `/opt/kbot/.env` via `jq`.

**Build & release**
- Build in CI; ship `dist/` + `package.json` + lockfile; `npm ci --omit=dev` on the box.
- Release dirs + `current` symlink → rollback = repoint symlink + restart.

**Deploy pipeline**
- GitHub OIDC provider + deploy role (trust pinned to repo/branch); Actions → S3 → `aws ssm send-command` to swap + restart.

**App-side changes**
- Deep `/healthz` (track `lastSuccessfulPollAt` / `lastCronTickAt`, quick Supabase ping; non-2xx when stale).
- Tighten shutdown — `await` the closes + `process.exit(0)` so the poll offset flushes.
- *(Optional)* bind Fastify to `127.0.0.1`.

**Self-heal (no external observability yet)**
- `Restart=always` + `kbot-health.timer` probing the deep `/healthz`.
- `StatusCheckFailed` CloudWatch alarm (host death) — kept, ~free.
- journald retention cap (`SystemMaxUse`) so logs don't fill the disk.

**Guardrails**
- AWS Budget / billing alarm (catches accidental NAT / egress costs).
- `dnf-automatic` patching with a reboot window; EC2 auto-recovery alarm.
- Audio-cache eviction (size cap / TTL sweep) so the 8 GB EBS doesn't fill.

**Single-instance**
- Only one instance per bot token (ADR 0001). Separate dev token; don't run local `npm run dev` against prod token while deployed.

**Access**
- SSM primary (sessions + `send-command`); EC2 Instance Connect break-glass; no standing SSH.

**Backups**
- N/A beyond Terraform state (S3 versioning). Supabase is managed; audio cache is regenerable.

## References

- ADR 0001: `docs/adr/0001-bot-transport-mode-polling-vs-webhook.md`
- Bot entry point: `src/main.ts`
- Coach scheduler: `src/coach/coach.scheduler.ts`
- Health/HTTP server: `src/server.ts`
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- EC2 `t4g` instances: https://aws.amazon.com/ec2/instance-types/t4/
- Amazon Managed Prometheus: https://aws.amazon.com/prometheus/
- AWS Distro for OpenTelemetry (ADOT): https://aws-otel.github.io/
- Grafana Alloy: https://grafana.com/docs/alloy/
- Healthchecks.io (dead-man's switch): https://healthchecks.io/
