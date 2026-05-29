# 0001 — Bot transport mode: polling vs webhook

- Status: Accepted
- Date: 2026-05-29
- Deciders: songlin

## Context

The bot currently runs Telegraf in **long-polling** mode (`bot.launch()` in `src/main.ts`). As we move toward a real deployment, we need to decide whether to stay on polling or switch to webhook mode. The choice shapes everything downstream — what kind of host we can use (long-running container vs serverless function), whether we need a public HTTPS endpoint, and how we deploy new versions.

Relevant facts about the bot today:

- **A handful of users** — the author plus a few test users. Still very low message volume.
- **Already needs a long-running process** for the `node-cron` coach scheduler (`src/coach/coach.scheduler.ts`, runs every 30 minutes).
- **Already needs persistent local disk** for the audio cache (`./.cache/audio`).
- **Stateless per request:** each user message can be handled independently — no in-memory session state between messages.

These existing constraints already point toward "long-running container somewhere." The transport choice should be evaluated in that light.

## Options considered

### Option A — Long polling (current state)

The bot calls Telegram's `getUpdates` endpoint with a 30-second hold-open. Telegram returns updates as they arrive. The bot acknowledges via the `offset` parameter and immediately calls again. Loop forever.

### Option B — Webhook

The bot registers a public HTTPS URL via `setWebhook`. Telegram POSTs each update to that URL as it arrives. The bot responds with `200 OK`. No outbound poll loop.

### Comparison

| Dimension | Long polling | Webhook |
|---|---|---|
| Direction | Bot → Telegram (outbound) | Telegram → Bot (inbound) |
| Process model | Long-running | Event-driven (can be ephemeral / serverless) |
| Public URL needed | No | Yes — HTTPS with valid cert |
| Setup work | `bot.launch()` — done | Register URL via `setWebhook`, run TLS endpoint, manage cert |
| Idle cost | Constant outbound calls (~2/min) | Zero |
| Crash recovery | At-least-once via offset ack | At-least-once via Telegram retry on non-2xx |
| Scale to many instances | One instance only (instances steal each other's updates) | Many instances behind a load balancer |
| Lambda / FaaS friendly | No | Yes |
| Local dev | Works anywhere (laptop, NAT, behind firewall) | Needs tunnel (ngrok / Cloudflare Tunnel) or a separate dev code path |

### Pros and cons specific to *this* project

**Long polling — pros**
- Zero infra to expose. No DNS, no TLS cert, no reverse proxy, no static IP.
- Same code in dev and prod. No tunnel needed for local testing.
- Naturally compatible with the constraints we already have (long-running process for cron, local disk for audio cache).
- Telegram queues updates if the bot is briefly offline — nothing is lost during deploys.

**Long polling — cons**
- **Must run a long-running process.** Rules out pure FaaS / Lambda.
- **Cannot run two instances at once** with the same bot token. The two would race on `getUpdates` and split / duplicate handling. This means **no classic blue-green deployment** — deploys must be stop-then-start.
- Wasted requests when idle (~2,880 empty polls/day). Cost is negligible at this scale.

**Webhook — pros**
- Zero idle cost.
- Trivial horizontal scale (load balancer + N stateless workers).
- Lower latency per message (no poll round-trip).
- Enables classic blue-green deployment (load balancer cuts over between versions).

**Webhook — cons**
- Requires a **public HTTPS endpoint** with a valid TLS cert. Means DNS, cert management, and an inbound surface area to defend (validate Telegram's secret-token header).
- **Local dev is harder.** Telegram can't reach your laptop without a tunnel (ngrok, Cloudflare Tunnel), or you maintain a polling-for-dev / webhook-for-prod split.
- `setWebhook` is global state per bot token — staging vs prod requires either two tokens or careful URL switching.
- **Cold-start tax on FaaS.** Every "first message after idle" pays 1–3s of cold-start latency, which is user-visible for an interactive bot.

## Decision

**Stay on long-polling for v1 deployment.**

The bot will continue to use `bot.launch()` with default polling. Deployment target will be a single long-running container (host chosen in a later ADR — see [References](#references)).

## Rationale

Three things drove this:

1. **The project already requires a long-running process.** The `node-cron` coach scheduler runs every 30 minutes inside the bot process. Even if we switched to webhook for messages, we'd still need an always-on container (or an entirely separate EventBridge-style scheduler for the cron, plus S3 for the audio cache). Switching to webhook only pays off if we're committing to a full serverless rewrite — which is out of scope for v1.

2. **Polling's main downside doesn't bite at our scale.** "No zero-downtime deploys" matters at multi-user scale. We have the author plus a few test users. A 10-second silence during a deploy is invisible in practice — Telegram queues messages and replays them when the bot restarts.

3. **Polling is dramatically simpler.** No public endpoint, no TLS cert, no DNS, no tunnel for local dev, no `setWebhook` ceremony, no secret-token validation. For a project that values shipping the *learning loop* over infrastructure craft, this is the right trade.

The decision is a deliberate "ship the simpler thing now, revisit when assumptions change" — not an endorsement of polling as the long-term answer.

## Consequences

**Architecture / code**
- `src/main.ts` keeps `bot.launch()` with no webhook configuration.
- No `/webhook` route on the Fastify server. Fastify stays for `/healthz` and any future public endpoints.
- No `setWebhook` / `deleteWebhook` ceremony in deployment scripts.

**Deployment**
- Deployment target must be a **long-running container**, not a FaaS function. (Lambda is off the table without a major refactor.)
- **Deploys are stop-then-start, not blue-green.** Expect ~5–30 seconds of "bot is silent" during each deploy. Messages sent during that window are queued by Telegram and processed when the new version comes up.
- **Only one instance of the bot can run at a time** against the prod token. Means:
  - Stop your local `npm run dev` before deploying, or your laptop will steal updates from prod.
  - Use a different bot token for staging / dev environments to avoid this entirely.

**Operations**
- No TLS cert to manage. No public endpoint to defend.
- Local development works anywhere with outbound internet, including behind NAT or on coffee-shop Wi-Fi.
- If the bot crashes overnight, Telegram queues updates for up to 24 hours — no message loss as long as we restart within that window.

## Revisit when

Re-open this ADR when **any** of the following becomes true:

- **User count grows beyond ~5 active users**, and the stop-then-start deploy gap starts to feel painful.
- We need **true zero-downtime deploys** (e.g., for product-launch reasons).
- We decide to move to a **fully serverless architecture** (would also require moving `node-cron` to a scheduled trigger and the audio cache to object storage).
- We need to run **multiple bot instances concurrently** for horizontal scale, geo-distribution, or A/B testing.
- **Telegram changes long-polling semantics** in a way that materially affects us (currently very stable, but worth naming).
- The `node-cron` scheduler is removed or moved out-of-process — one of the main reasons to stay long-running disappears.

## References

- PRD: `docs/prd-v1.md` (section 8, "Technical architecture")
- Bot entry point: `src/main.ts:57` (`bot.launch()` call)
- Coach scheduler: `src/coach/coach.scheduler.ts` (the in-process cron that anchors us to long-running)
- Telegram Bot API — getUpdates: https://core.telegram.org/bots/api#getupdates
- Telegram Bot API — setWebhook: https://core.telegram.org/bots/api#setwebhook
- Future ADR (to be written): deployment target / host choice
