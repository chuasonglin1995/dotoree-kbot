# Database migrations in CI/CD — design

**Date:** 2026-06-01
**Branch:** `infra/db-migrations-cicd`
**Status:** Approved (design)

## Problem

Prod is a Supabase Cloud project (`egpazgiozumbnvstkwap`). The schema migration
`supabase/migrations/20260526000000_init.sql` (creates `users, vocab, grammar,
sessions, turns, exposures, mistakes` + indexes) was **never applied** to prod.

Symptoms observed on the running EC2 box:

- Coach cron fails every run with `PGRST205: Could not find the table
  'public.users' in the schema cache`.
- Any DB-backed feature will fail; the bot is up but not functional.

There is currently no mechanism to apply migrations to prod at all. The app's
`SUPABASE_SECRET_KEY` is the PostgREST **service-role API key** — it can read/write
tables through the REST API but **cannot run DDL** and is not a Postgres login, so
it cannot apply migrations.

## Goal

Apply Supabase migrations to the prod database automatically as part of the deploy
pipeline, using the Supabase CLI's migration-history tracking so only pending
migrations run.

### In scope
- Wire `supabase db push` into the existing deploy workflow.
- Get the current pending migration (`20260526000000_init.sql`) applied to prod via
  that mechanism.

### Out of scope (tracked separately, other branches)
- The `await bot.launch()` hang in `src/main.ts` that leaves the Telegram health
  pinger unstarted (`lastTelegramOkAtMs: null` → permanent `/healthz` 503).
- The non-functional `kbot-health.service` watchdog.
- Seeding reference data (`vocab` / `grammar`). Schema only for now.

## Approach

### Decision: integrate into the existing `deploy.yml`, not a separate workflow

A standalone `migrate` workflow triggered on push to `main` would run **in
parallel** with the app deploy — no ordering, no gate. The app could restart
before or despite a failed migration.

Adding the migration as **steps inside the existing `build-and-deploy` job, right
before the SSM trigger**, gives an ordering gate for free: if `db push` fails, the
job stops and the SSM deploy step never runs, so the old bot keeps running on the
old schema. Migrate-then-restart, atomic from the operator's point of view.

### Decision: credential = access token + DB password (`link` then `push`)

`supabase db push` connects to Postgres directly (pooler on 6543), which needs the
**database password** — a credential not currently stored anywhere. Chosen shape:

- `SUPABASE_ACCESS_TOKEN` — Personal Access Token (supabase.com → Account → Access
  Tokens). Authenticates the CLI to the Supabase API for `link`.
- `SUPABASE_DB_PASSWORD` — Project Settings → Database → DB password. Used by
  `db push` to connect to Postgres.
- `SUPABASE_PROJECT_REF` = `egpazgiozumbnvstkwap` — not secret (it's in the public
  project URL); a plain workflow `env:` var.

Both secrets are added to GitHub → repo → Settings → Secrets and variables →
Actions, by the repo owner (only they hold the DB password).

This is the workflow the official Supabase migrations guide recommends ("a CI/CD
pipeline that runs `supabase db push` on merge to your main branch"). The
single-writer caveat it warns about ("only one `db push` at a time") is satisfied
by the existing `concurrency: deploy-prod` group.

## The change

In `.github/workflows/deploy.yml`:

1. Add to the top-level `env:` block:

   ```yaml
   SUPABASE_PROJECT_REF: egpazgiozumbnvstkwap
   ```

2. Insert two steps after *Upload artifact to S3* and before *Trigger deploy via
   SSM*:

   ```yaml
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
   ```

The CLI reads migration files from the repo's `supabase/migrations/` (present after
`actions/checkout`). `--yes` auto-answers the push confirmation in
non-interactive CI (verified against CLI v2.101.0). `SUPABASE_DB_PASSWORD` is read
from the environment by both `link` and `push`, so neither prompts.

## Behavior & semantics

- **Ordering:** migration runs only after `npm test` + `npm run build` pass — don't
  touch prod if the code doesn't build.
- **Gate:** a failed migration fails the job; the SSM restart step is skipped; the
  old bot stays up on the old schema.
- **Idempotent:** `db push` records applied migrations in
  `supabase_migrations.schema_migrations` and applies only pending ones, so
  re-runs / redeploys are safe no-ops.
- **Single-writer:** guaranteed by the existing `concurrency: group: deploy-prod`.

## Rollout

The **first merge of this branch to `main`** runs the new step and applies the
pending `20260526000000_init.sql`. No separate manual `db push` is needed; CI is the
single path, which also proves the pipeline end-to-end. Prod stays broken only until
that merge (same as any fix).

## Verification

After the deploy run completes, via the existing SSM diagnostic
(`aws ssm send-command` → `journalctl -u kbot`):

- Coach cron succeeds — no more `PGRST205`.
- `/healthz` body shows `cronOk: true`.
- `telegramOk` will **still be false** until the separate `bot.launch` fix — this is
  expected and must not be mistaken for a migration failure.

Optionally confirm schema directly: the migration's tables exist in the prod DB
(`supabase_migrations.schema_migrations` contains `20260526000000`).

## Risks & mitigations

- **DB password in GitHub secrets** — accepted tradeoff; it's the credential placement
  the Supabase CI workflow requires. Scoped to one repo's Actions secrets.
- **Destructive future migration auto-applied** — `db push` runs whatever is in
  `supabase/migrations/`. Mitigation: review migration files in PRs before merge to
  `main`; `--dry-run` can be used locally to preview.
- **CLI prompt blocks CI** — mitigated by `--yes` (verified present in v2.101.0).
