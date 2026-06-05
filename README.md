# dotoree-kbot

🌰 Small bot, big dreams. Dotoree Kbot helps you learn Korean through Telegram — because consistency beats cramming.

A Telegram bot for plateaued-intermediate Korean learners. It runs production-first
translation drills inside bounded scenarios: pick a setting (restaurant, classroom, bus
station), get prompted in English, and type the Korean. The bot gives tiered hints, soft
inline corrections, optional voice (TTS) playback, and Korean follow-ups. Over time it
builds a personal mistake corpus and vocabulary-exposure table that a background coach
loop uses to adapt difficulty up *or* down.

See [`docs/prd-v1.md`](docs/prd-v1.md) for the full product rationale.

## Features

- **Scenario-scoped drills** — bounded vocabulary universes that keep LLM generation tractable.
- **Tiered hints** — tap for key vocab → grammar pattern → full answer; every tap is logged as a struggle signal.
- **Soft inline correction** — encouraging feedback, mistakes framed as data.
- **Voice playback** — text-to-speech for Korean lines via OpenAI TTS, with an on-disk audio cache.
- **Adaptive memory** — a mistake corpus and exposure table feed a scheduled coach loop that rebalances difficulty.
- **Health checks** — `/healthz` HTTP endpoint plus a Telegram connectivity pinger.

## Tech stack

- **TypeScript** on **Node.js ≥ 22** (see `.nvmrc`)
- **Telegraf** — Telegram bot framework (long-polling transport)
- **Fastify** — HTTP server (health checks)
- **OpenAI SDK** — chat completions for generation/correction and text-to-speech (no agent framework; raw calls)
- **Supabase** (Postgres) — database, accessed via `@supabase/supabase-js`
- **node-cron** — scheduled coach loop
- **Jest** + **ts-jest** — testing
- **tsx** — dev runtime / script execution

## Prerequisites

- Node.js ≥ 22 (`nvm use` reads `.nvmrc`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An OpenAI API key
- A Supabase project — either the hosted cloud or a local stack via the [Supabase CLI](https://supabase.com/docs/guides/cli) (Docker required for local)

## Setup

```bash
git clone https://github.com/chuasonglin1995/dotoree-kbot.git
cd dotoree-kbot
nvm use            # Node 22
npm install
cp .env.example .env   # then fill in the values
```

Fill in `.env` with your Telegram bot token, OpenAI API key, and Supabase URL + secret
key (for a local stack, `supabase status` prints these after `npm run db:start`). Then
bring up the database and load reference data with `npm run db:start`, `npm run db:up`,
and `npm run seed` (see [Key commands](#key-commands)).

Start the bot with `npm run dev`. It connects to Telegram via long polling and serves a
health check at `localhost:3000/healthz`. Message your bot and send `/start`.

## Deployment

The bot deploys to a small AWS EC2 instance automatically on push to `main` via GitHub
Actions (build → S3 → SSM deploy → `systemctl restart kbot`). No SSH or manual steps.
See [`infra/README.md`](infra/README.md) for the full pipeline and operational commands.

## Key commands

```bash
npm run dev        # run in watch mode (tsx)
npm run build      # compile TypeScript → dist/
npm start          # run the compiled build
npm test           # run the Jest suite
npm run seed       # load vocab + grammar from word-bank/
npm run db:start   # start local Supabase (Docker)
npm run db:up      # apply migrations
npm run db:reset   # reset the local database
npm run db:stop    # stop local Supabase
```

## Documentation

- [Product requirements (PRD v1)](docs/prd-v1.md)
- [Roadmap](docs/roadmap.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Deployment & infrastructure](infra/README.md)
