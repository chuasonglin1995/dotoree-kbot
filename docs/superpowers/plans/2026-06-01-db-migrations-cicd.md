# DB Migrations in CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Supabase migrations to the prod database automatically as a gated step in the existing deploy workflow, so pushing code also reconciles the schema.

**Architecture:** Add two steps to the existing `build-and-deploy` job in `.github/workflows/deploy.yml`, placed after the artifact upload and before the SSM deploy trigger. They install the Supabase CLI and run `supabase link` + `supabase db push --yes`. Because they sit before the SSM step, a failed migration fails the job and the bot is never restarted (migrate-then-restart gate). Single-writer is guaranteed by the existing `concurrency: deploy-prod`.

**Tech Stack:** GitHub Actions, Supabase CLI v2 (`supabase/setup-cli@v2`), `db push` migration-history tracking.

**Spec:** `docs/superpowers/specs/2026-06-01-db-migrations-cicd-design.md`

---

## File Structure

- Modify: `.github/workflows/deploy.yml`
  - Add `SUPABASE_PROJECT_REF` to the top-level `env:` block (currently lines 15–19).
  - Insert two steps between *Upload artifact to S3* (lines 56–57) and *Trigger deploy via SSM* (line 59).

No application code changes. No new files. Validation is `actionlint` locally; the real end-to-end test is the deploy run on merge to `main`.

---

## Task 1: Add the migration steps to the deploy workflow

**Files:**
- Modify: `.github/workflows/deploy.yml` (env block ~15–19; insert before line 59)

- [ ] **Step 1: Add `SUPABASE_PROJECT_REF` to the workflow `env:` block**

The current `env:` block is:

```yaml
env:
  AWS_REGION: ap-southeast-1
  ARTIFACT_BUCKET: dotoree-kbot-artifacts
  AWS_DEPLOY_ROLE_ARN: arn:aws:iam::892532234259:role/kbot-github-deploy
  INSTANCE_NAME: kbot-prod   # the EC2 Name tag; looked up at deploy time
```

Add the project ref (not secret — it's in the public project URL) as the last line:

```yaml
env:
  AWS_REGION: ap-southeast-1
  ARTIFACT_BUCKET: dotoree-kbot-artifacts
  AWS_DEPLOY_ROLE_ARN: arn:aws:iam::892532234259:role/kbot-github-deploy
  INSTANCE_NAME: kbot-prod   # the EC2 Name tag; looked up at deploy time
  SUPABASE_PROJECT_REF: egpazgiozumbnvstkwap   # not secret; in the public project URL
```

- [ ] **Step 2: Insert the two migration steps before the SSM trigger**

Find this boundary (the end of *Upload artifact to S3* and the start of *Trigger deploy via SSM*):

```yaml
      - name: Upload artifact to S3
        run: aws s3 cp "kbot-${GITHUB_SHA::7}.tgz" "s3://${ARTIFACT_BUCKET}/"

      - name: Trigger deploy via SSM
```

Replace it with (inserting the two new steps in the middle):

```yaml
      - name: Upload artifact to S3
        run: aws s3 cp "kbot-${GITHUB_SHA::7}.tgz" "s3://${ARTIFACT_BUCKET}/"

      # Apply DB migrations BEFORE restarting the app, so the new code finds the
      # schema it expects. A failed migration fails the job and the SSM deploy
      # below never runs (artifact is uploaded but the bot is not restarted).
      - name: Install Supabase CLI
        uses: supabase/setup-cli@v2
        with:
          version: latest
          github-token: ${{ github.token }}

      - name: Apply database migrations
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          supabase link --project-ref "$SUPABASE_PROJECT_REF"
          supabase db push --yes

      - name: Trigger deploy via SSM
```

- [ ] **Step 3: Validate the workflow with actionlint**

Run: `actionlint .github/workflows/deploy.yml`
Expected: no output, exit code 0. (Any output means a syntax/expression error — fix before continuing.)

- [ ] **Step 4: Sanity-check the diff**

Run: `git diff .github/workflows/deploy.yml`
Expected: only the `SUPABASE_PROJECT_REF` env line and the two new steps added; the SSM trigger step and everything else unchanged.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: apply Supabase migrations before SSM deploy

Add a gated 'supabase db push' step to the deploy job, before the SSM
restart. Migrate-then-restart: a failed migration fails the job and the
bot is not restarted. Needs SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD
GitHub secrets.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add the GitHub Actions secrets (manual — repo owner only)

**This task cannot be done by an agent — it requires the prod DB password, which only the repo owner holds.** No file changes; it configures GitHub.

- [ ] **Step 1: Create a Supabase Personal Access Token**

In a browser: supabase.com → top-right account menu → **Access Tokens** → **Generate new token**. Name it e.g. `dotoree-kbot-ci`. Copy the value (shown once).

- [ ] **Step 2: Get the prod DB password**

supabase.com → project `dotoree-kbot` (`egpazgiozumbnvstkwap`) → **Project Settings → Database**. Use the database password there. If it's unknown, click **Reset database password** and copy the new one. (Resetting does not affect the app — the app uses the PostgREST service key, not the DB password.)

- [ ] **Step 3: Add both as repository secrets**

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:
- `SUPABASE_ACCESS_TOKEN` = the token from Step 1
- `SUPABASE_DB_PASSWORD` = the password from Step 2

- [ ] **Step 4: Confirm both secrets exist**

Run: `gh secret list` (requires `gh auth login` first)
Expected: both `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` listed. (If `gh` is not authenticated, verify visually on the GitHub Settings page instead.)

---

## Task 3: Merge to main, then verify the migration applied

**Files:** none (this exercises the live pipeline).

Do **not** start this task until Task 2's secrets exist — without them the migration step fails.

- [ ] **Step 1: Open and merge a PR from the branch to `main`**

```bash
git push -u origin infra/db-migrations-cicd
gh pr create --fill --base main   # or open the PR in the GitHub UI
```
Review, then merge. Merging to `main` triggers the `deploy` workflow.

- [ ] **Step 2: Watch the deploy run, confirm the migration step succeeded**

Run: `gh run watch` (or open the repo's **Actions** tab)
Expected: the *Apply database migrations* step succeeds; its log shows `db push` applying `20260526000000_init.sql` (or "Remote database is up to date" on a re-run). The *Trigger deploy via SSM* step runs after it.

- [ ] **Step 3: Verify on the box that the coach cron no longer errors**

Run this from a machine with AWS creds (region `ap-southeast-1`, instance tag `kbot-prod`):

```bash
REGION=ap-southeast-1
IID=$(aws ec2 describe-instances --region $REGION \
  --filters "Name=tag:Name,Values=kbot-prod" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

cat > /tmp/verify.sh <<'EOF'
echo "=== recent coach cron lines (expect NO PGRST205) ==="
journalctl -u kbot --no-pager | grep -iE "coach|PGRST205" | tail -20
echo "=== healthz body (expect cronOk:true) ==="
curl -s --max-time 5 http://127.0.0.1:3000/healthz
EOF
jq -n --rawfile s /tmp/verify.sh '{commands:[$s]}' > /tmp/vp.json
CMD_ID=$(aws ssm send-command --region $REGION --instance-ids "$IID" \
  --document-name AWS-RunShellScript --comment "verify migration" \
  --parameters file:///tmp/vp.json --query 'Command.CommandId' --output text)
aws ssm wait command-executed --region $REGION --command-id "$CMD_ID" --instance-id "$IID" || true
aws ssm get-command-invocation --region $REGION --command-id "$CMD_ID" --instance-id "$IID" \
  --query 'StandardOutputContent' --output text
```

Expected:
- The coach cron lines show a successful rebalance (or at least **no** `PGRST205: Could not find the table 'public.users'`).
- The `/healthz` JSON shows `"cronOk":true`.
- `"telegramOk":false` is **expected** here and is NOT a migration failure — it's the separate `await bot.launch()` hang, tracked in a different branch. Do not act on it in this plan.

- [ ] **Step 4: (Optional) Confirm migration history in the DB**

If you have the DB connection string locally, confirm the migration is recorded:

Run: `supabase migration list --linked` (after `supabase link --project-ref egpazgiozumbnvstkwap`)
Expected: `20260526000000` appears in the **Remote** column.

---

## Self-Review

**Spec coverage:**
- "Wire `supabase db push` into the existing deploy workflow" → Task 1.
- "Integrate into deploy.yml, gated before SSM" → Task 1 Step 2 (placement) + the gate is structural (SSM step follows).
- "Credential = access token + DB password, `link` then `push`" → Task 1 Step 2 (steps) + Task 2 (secrets).
- "`SUPABASE_PROJECT_REF` as plain env var" → Task 1 Step 1.
- "First merge applies the pending migration; no manual pre-apply" → Task 3.
- "Verification: coach cron no PGRST205, cronOk true, telegramOk still false expected" → Task 3 Step 3.
- "setup-cli@v2, --yes" → Task 1 Step 2 (verified against CLI v2.101.0).
- Out-of-scope items (bot.launch hang, health watchdog, seeding) → explicitly excluded; Task 3 Step 3 warns not to act on `telegramOk:false`.

**Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". All steps show exact YAML, commands, and expected output.

**Type/name consistency:** Secret names (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`), env var (`SUPABASE_PROJECT_REF`), project ref (`egpazgiozumbnvstkwap`), and instance tag (`kbot-prod`) are identical across Tasks 1–3 and match the spec.
