# 0002 — Deployment host: EC2 `t4g.nano`

- Status: Accepted
- Date: 2026-05-30
- Deciders: songlin
- Depends on: [0001 — Bot transport mode (polling)](./0001-bot-transport-mode-polling-vs-webhook.md)

## Context

ADR 0001 committed us to long-polling, which requires a single, always-on, long-running process (poll loop + in-process `node-cron`). It deferred the host choice. We want to deploy on AWS, managed by Terraform, as cheaply as is reasonable while staying reliable.

The realistic AWS targets for one always-on container are **EC2** and **ECS Fargate**. (Lambda/FaaS is ruled out by ADR 0001.) A full comparison — cost, ops, deployment, health checking, observability, CI/CD — lives in the design doc; this ADR records only the decision and its consequences.

## Decision

**Deploy on a single EC2 `t4g.nano` (arm64, Amazon Linux 2023)**, running the bot as a hardened `systemd` service. **No Docker, no Docker Compose** (one service, external DB — nothing to orchestrate).

Supporting choices for v1:
- **Networking:** public subnet + public IP + **egress-only** security group. **No NAT gateway** (it would cost ~8× the instance).
- **Access & deploy:** **SSM** (Session Manager + Run Command); EC2 Instance Connect as break-glass; **no standing SSH**.
- **CI/CD:** GitHub **Actions → OIDC → S3 artifact → SSM Send Command**; build in CI, release dirs + `current` symlink for rollback.
- **Secrets:** one AWS Secrets Manager secret (`kbot/prod/config`, JSON of all env vars) rendered into an `EnvironmentFile`. (Chosen over SSM Parameter Store: same flat namespace + clean `terraform destroy` teardown either way, but the team preferred a purpose-built secrets vault; ~$0.40/mo for the single JSON secret.)
- **Terraform state:** S3 backend + native locking.
- **Environments:** prod only (separate bot token for local dev).
- **Observability:** deferred — `journalctl` + systemd self-heal + a deep `/healthz` + the near-free `StatusCheckFailed` alarm. Add metrics/paging later.

## Rationale

1. **Cheapest reliable AWS shape** — ~$4/mo (instance + EBS) vs ~$9/mo for an always-on Fargate task. A single low-traffic bot never stresses a nano.
2. **No architectural pressure toward Fargate** — the polling + cron model already needs a long-running process, and ADR 0001's "stop-then-start deploy is fine" stance means we don't need Fargate's orchestration polish yet. Fargate is "no host to manage," not Lambda-style scale-to-zero, so it would buy ops convenience, not an architecture fit.
3. **The cost of EC2 is OS-patching minutes** — small at this scale, and `Restart=always` + a systemd `/healthz` timer recover the failure modes that matter.

## Consequences

- **We own the OS** — patching (`dnf-automatic` + reboot window) is ours.
- **Self-heal is assembled, not native** — `Restart=always` (crashes) + a systemd timer probing a deep `/healthz` (wedges). Requires upgrading the currently-shallow `/healthz` (`src/server.ts`).
- **Deploys are stop-then-start** (already accepted in ADR 0001); the existing SIGTERM handling (`src/main.ts:60-61`) should be tightened to `await` closes + `process.exit(0)`.
- **No inbound surface** — health checks are internal (systemd / SSM), not externally pulled. Uptime *paging*, when added, will use an outbound heartbeat, not an inbound probe.
- **One instance per bot token** — local dev must use a separate token.
- **CI/CD can still be fully automated** via OIDC + SSM with no open ports; CodeDeploy/ECS are a later evolution if/when ASG or containerisation arrives.

## Revisit when

- We want true concurrent zero-downtime deploys (would also re-open ADR 0001's polling decision).
- We containerise or need horizontal scale → reconsider ECS Fargate (CI/CD stage 3 in the design doc).
- OS-patching / box-babysitting overhead starts to outweigh the ~$5/mo Fargate premium.

## References

- Design doc (full comparison + work breakdown): `docs/superpowers/specs/2026-05-29-deployment-target-design.md`
- ADR 0001: `docs/adr/0001-bot-transport-mode-polling-vs-webhook.md`
