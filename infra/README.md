# Deployment

The bot runs on one small AWS server (EC2). You ship new code by **pushing to `main`** —
GitHub Actions builds it and deploys it for you. No SSH, no manual steps.

## How CI/CD works

```
  you: git push to main
        │
        ▼
  ┌─────────────────────────────┐
  │       GitHub Actions         │
  │  1. npm ci + test + build    │   build the app
  │  2. zip it → kbot-<sha>.tgz  │
  │  3. upload zip → S3          │   put the build in a bucket
  │  4. tell the server to deploy│   (via AWS SSM, no SSH)
  └─────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────┐
  │   EC2 server: deploy.sh      │
  │  1. download zip from S3     │
  │  2. read secrets             │   from AWS Secrets Manager → .env
  │  3. swap to new version      │   (symlink)
  │  4. restart the bot          │   systemctl restart kbot
  └─────────────────────────────┘
        │
        ▼
     bot is live (new version)
```

**In words:** push to `main` → GitHub builds + uploads the code + triggers a deploy →
the server downloads it, loads the secrets, and restarts the bot. The whole thing is
automatic; you just push.

**Auth:** GitHub proves who it is with a short-lived token (OIDC) — no AWS keys are stored
anywhere. The server reaches AWS with its own built-in role.

## Everyday commands

```bash
# deploy: just push
git push origin main          # watch it in the repo's "Actions" tab

# get into the server (no SSH key needed)
IID=$(tf -chdir=infra/prod output -raw instance_id)
aws ssm start-session --region ap-southeast-1 --target "$IID"
#   on the box:  systemctl status kbot   |   journalctl -u kbot -n 50   |   curl localhost:3000/healthz

# update a secret, then redeploy to pick it up
#   edit it in: AWS Console → Secrets Manager → dotoree_kbot-prod
```

## Setup & details

First-time setup, the full resource list, rollback, costs, and teardown are in the
[infra plan](../docs/superpowers/plans/2026-05-30-deploy-infra-aws-terraform.md).
Why it's built this way: [ADR 0002](../docs/adr/0002-deployment-host-ec2.md).
