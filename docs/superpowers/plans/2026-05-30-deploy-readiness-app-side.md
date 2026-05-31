# Deploy-Readiness (App-Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bot deploy-ready by adding a deep `/healthz` liveness check and a clean, awaited shutdown — the two app-side prerequisites for the EC2 + systemd deployment (ADR 0002).

**Architecture:** A small in-memory `HealthState` holds active liveness timestamps. A periodic `getMe()` pinger marks Telegram reachability (volume-independent), the coach cron marks each tick, and `/healthz` reports 200/503 from a staleness check with a startup grace. Shutdown is extracted into an awaited, idempotent handler that flushes the poll offset before exiting. Everything is injected `now`-based so it's unit-testable without fake timers.

**Tech Stack:** TypeScript (CommonJS), Telegraf 4, Fastify 5, node-cron 4, Jest + ts-jest.

---

## File Structure

- `src/health/health-state.ts` (new) — pure in-memory liveness store + snapshot/staleness logic.
- `src/health/telegram-pinger.ts` (new) — periodic `getMe()` ping that marks Telegram liveness.
- `src/shutdown.ts` (new) — awaited, idempotent shutdown handler factory.
- `src/coach/coach.scheduler.ts` (modify) — record a cron tick on every run; extract a testable `runCoachTick`.
- `src/server.ts` (modify) — `/healthz` returns a deep snapshot with 200/503; backward-compatible when no `HealthState` is passed.
- `src/main.ts` (modify) — compose the above; replace the inline SIGINT/SIGTERM handlers.
- Tests mirror under `tests/health/`, `tests/coach/`, `tests/`.

Rationale for the split: `HealthState` is pure (the TDD core); the pinger, scheduler hook, and endpoint are thin adapters around it; shutdown is independent wiring. Each file has one responsibility and is held in context easily.

---

### Task 1: HealthState (pure liveness store)

**Files:**
- Create: `src/health/health-state.ts`
- Test: `tests/health/health-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/health/health-state.test.ts
import { HealthState } from '../../src/health/health-state';

const T0 = 1_000_000;
const thresholds = { telegramStalenessMs: 180_000, cronStalenessMs: 2_100_000 };

describe('HealthState', () => {
  it('is healthy at startup within the grace window (measured from startedAt)', () => {
    const h = new HealthState(T0, thresholds);
    const snap = h.snapshot(T0 + 1000);
    expect(snap.ok).toBe(true);
    expect(snap.telegramOk).toBe(true);
    expect(snap.cronOk).toBe(true);
    expect(snap.lastTelegramOkAtMs).toBeNull();
    expect(snap.lastCronTickAtMs).toBeNull();
  });

  it('reports telegram unhealthy once the ping is stale past its threshold', () => {
    const h = new HealthState(T0, thresholds);
    h.markTelegramOk(T0);
    const snap = h.snapshot(T0 + 180_001);
    expect(snap.telegramOk).toBe(false);
    expect(snap.ok).toBe(false);
  });

  it('reports cron unhealthy once the tick is stale past its threshold', () => {
    const h = new HealthState(T0, thresholds);
    h.markCronTick(T0);
    const snap = h.snapshot(T0 + 2_100_001);
    expect(snap.cronOk).toBe(false);
    expect(snap.ok).toBe(false);
  });

  it('recovers to healthy after a fresh telegram mark', () => {
    const h = new HealthState(T0, thresholds);
    h.markTelegramOk(T0 + 5_000_000);
    h.markCronTick(T0 + 5_000_000);
    const snap = h.snapshot(T0 + 5_000_100);
    expect(snap.ok).toBe(true);
    expect(snap.lastTelegramOkAtMs).toBe(T0 + 5_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/health/health-state.test.ts`
Expected: FAIL — `Cannot find module '../../src/health/health-state'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/health/health-state.ts
export interface HealthThresholds {
  telegramStalenessMs: number;
  cronStalenessMs: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  telegramStalenessMs: 3 * 60_000, // 3 min — pinger runs every 60s
  cronStalenessMs: 35 * 60_000, // 35 min — coach cron runs every 30 min
};

export interface HealthSnapshot {
  ok: boolean;
  telegramOk: boolean;
  cronOk: boolean;
  startedAtMs: number;
  lastTelegramOkAtMs: number | null;
  lastCronTickAtMs: number | null;
  nowMs: number;
}

export class HealthState {
  private lastTelegramOkAtMs: number | null = null;
  private lastCronTickAtMs: number | null = null;

  constructor(
    private readonly startedAtMs: number,
    private readonly thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  ) {}

  markTelegramOk(nowMs: number): void {
    this.lastTelegramOkAtMs = nowMs;
  }

  markCronTick(nowMs: number): void {
    this.lastCronTickAtMs = nowMs;
  }

  snapshot(nowMs: number): HealthSnapshot {
    const telegramRef = this.lastTelegramOkAtMs ?? this.startedAtMs;
    const cronRef = this.lastCronTickAtMs ?? this.startedAtMs;
    const telegramOk = nowMs - telegramRef < this.thresholds.telegramStalenessMs;
    const cronOk = nowMs - cronRef < this.thresholds.cronStalenessMs;
    return {
      ok: telegramOk && cronOk,
      telegramOk,
      cronOk,
      startedAtMs: this.startedAtMs,
      lastTelegramOkAtMs: this.lastTelegramOkAtMs,
      lastCronTickAtMs: this.lastCronTickAtMs,
      nowMs,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/health/health-state.test.ts`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/health/health-state.ts tests/health/health-state.test.ts
git commit -m "feat(health): add HealthState liveness store with staleness + startup grace"
```

---

### Task 2: Telegram liveness pinger

**Files:**
- Create: `src/health/telegram-pinger.ts`
- Test: `tests/health/telegram-pinger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/health/telegram-pinger.test.ts
import { pingTelegramOnce } from '../../src/health/telegram-pinger';
import { HealthState } from '../../src/health/health-state';

const T0 = 2_000_000;

describe('pingTelegramOnce', () => {
  it('marks telegram ok when getMe resolves', async () => {
    const h = new HealthState(T0);
    const telegram = { getMe: jest.fn().mockResolvedValue({ id: 1 }) };
    const ok = await pingTelegramOnce(telegram, h, T0 + 100);
    expect(ok).toBe(true);
    expect(telegram.getMe).toHaveBeenCalledTimes(1);
    expect(h.snapshot(T0 + 100).lastTelegramOkAtMs).toBe(T0 + 100);
  });

  it('returns false, does not mark, and warns when getMe rejects', async () => {
    const h = new HealthState(T0);
    const telegram = { getMe: jest.fn().mockRejectedValue(new Error('network')) };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await pingTelegramOnce(telegram, h, T0 + 100);
    expect(ok).toBe(false);
    expect(h.snapshot(T0 + 100).lastTelegramOkAtMs).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('network'));
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/health/telegram-pinger.test.ts`
Expected: FAIL — `Cannot find module '../../src/health/telegram-pinger'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/health/telegram-pinger.ts
import { HealthState } from './health-state';

export interface TelegramLike {
  getMe(): Promise<unknown>;
}

export async function pingTelegramOnce(
  telegram: TelegramLike,
  health: HealthState,
  nowMs: number,
): Promise<boolean> {
  try {
    await telegram.getMe();
    health.markTelegramOk(nowMs);
    return true;
  } catch (e: any) {
    // Liveness is inferred from staleness of the last success, so a failure
    // needs no state change — but log it so journalctl explains any later
    // 503 / systemd restart (journalctl is the only log surface in v1).
    console.warn(`[health] telegram getMe failed: ${e.message}`);
    return false;
  }
}

export function startTelegramPinger(
  telegram: TelegramLike,
  health: HealthState,
  intervalMs = 60_000,
): { stop(): void } {
  const tick = () => void pingTelegramOnce(telegram, health, Date.now());
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick(); // fire one immediately so liveness is established at boot
  return { stop: () => clearInterval(timer) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/health/telegram-pinger.test.ts`
Expected: PASS — 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/health/telegram-pinger.ts tests/health/telegram-pinger.test.ts
git commit -m "feat(health): add periodic getMe pinger for Telegram liveness"
```

---

### Task 3: Record cron ticks in the coach scheduler

**Files:**
- Modify: `src/coach/coach.scheduler.ts`
- Test: `tests/coach/coach.scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/coach.scheduler.test.ts
import { runCoachTick } from '../../src/coach/coach.scheduler';
import { HealthState } from '../../src/health/health-state';

const T0 = 3_000_000;

describe('runCoachTick', () => {
  it('marks a cron tick and runs the rebalance', async () => {
    const h = new HealthState(T0);
    const coach = { rebalanceAllUsers: jest.fn().mockResolvedValue(undefined) } as any;
    await runCoachTick(coach, h, T0 + 50);
    expect(coach.rebalanceAllUsers).toHaveBeenCalledTimes(1);
    expect(h.snapshot(T0 + 50).lastCronTickAtMs).toBe(T0 + 50);
  });

  it('still records the tick when the rebalance throws', async () => {
    const h = new HealthState(T0);
    const coach = { rebalanceAllUsers: jest.fn().mockRejectedValue(new Error('boom')) } as any;
    await runCoachTick(coach, h, T0 + 50);
    expect(h.snapshot(T0 + 50).lastCronTickAtMs).toBe(T0 + 50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/coach/coach.scheduler.test.ts`
Expected: FAIL — `runCoachTick` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/coach/coach.scheduler.ts` with:

```typescript
import * as cron from 'node-cron';
import { CoachService } from './coach.service';
import { HealthState } from '../health/health-state';

export async function runCoachTick(
  coach: CoachService,
  health: HealthState,
  nowMs: number,
): Promise<void> {
  health.markCronTick(nowMs); // record liveness first — proves the cron fired
  console.log('[coach] running rebalance...');
  try {
    await coach.rebalanceAllUsers();
  } catch (e: any) {
    console.error(`[coach] failed: ${e.message}`);
  }
}

export function startCoachScheduler(
  coach: CoachService,
  health: HealthState,
): cron.ScheduledTask {
  return cron.schedule('*/30 * * * *', () => runCoachTick(coach, health, Date.now()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/coach/coach.scheduler.test.ts`
Expected: PASS — 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/coach/coach.scheduler.ts tests/coach/coach.scheduler.test.ts
git commit -m "feat(coach): record cron tick on each scheduler run for liveness"
```

---

### Task 4: Deep `/healthz` endpoint

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server.test.ts
import { createServer } from '../src/server';
import { HealthState } from '../src/health/health-state';

const T0 = 4_000_000;
const thresholds = { telegramStalenessMs: 180_000, cronStalenessMs: 2_100_000 };

describe('GET /healthz', () => {
  it('returns 200 and ok:true when no HealthState is provided (backward compatible)', async () => {
    const app = createServer();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('returns 200 and ok:true when health is fresh', async () => {
    const h = new HealthState(T0, thresholds);
    h.markTelegramOk(T0);
    h.markCronTick(T0);
    const app = createServer(h);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 503 and ok:false when telegram liveness is stale', async () => {
    // started long ago and never pinged -> past grace -> stale
    const h = new HealthState(T0 - 10_000_000, thresholds);
    const app = createServer(h);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server.test.ts`
Expected: FAIL — `createServer` does not accept an argument / returns 200 for the stale case.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/server.ts` with:

```typescript
import Fastify, { FastifyInstance } from 'fastify';
import { HealthState } from './health/health-state';

export function createServer(health?: HealthState): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get('/healthz', async (_req, reply) => {
    if (!health) {
      return { ok: true, ts: new Date().toISOString() };
    }
    const snap = health.snapshot(Date.now());
    reply.code(snap.ok ? 200 : 503);
    return { ...snap, ts: new Date().toISOString() };
  });
  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server.test.ts`
Expected: PASS — 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat(server): deep /healthz returning 200/503 from HealthState"
```

---

### Task 5: Awaited, idempotent shutdown handler

**Files:**
- Create: `src/shutdown.ts`
- Test: `tests/shutdown.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shutdown.test.ts
import { createShutdownHandler } from '../src/shutdown';

function makeDeps() {
  return {
    bot: { stop: jest.fn() },
    coachTask: { stop: jest.fn() },
    app: { close: jest.fn().mockResolvedValue(undefined) },
    exit: jest.fn(),
  };
}

describe('createShutdownHandler', () => {
  it('stops bot, coach, and server then exits 0', async () => {
    const deps = makeDeps();
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    expect(deps.bot.stop).toHaveBeenCalledWith('SIGTERM');
    expect(deps.coachTask.stop).toHaveBeenCalledTimes(1);
    expect(deps.app.close).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent — a second signal does not stop twice', async () => {
    const deps = makeDeps();
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    await handler('SIGINT');
    expect(deps.bot.stop).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('still exits 0 if a close throws', async () => {
    const deps = makeDeps();
    deps.app.close = jest.fn().mockRejectedValue(new Error('close failed'));
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/shutdown.test.ts`
Expected: FAIL — `Cannot find module '../src/shutdown'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/shutdown.ts
export interface ShutdownDeps {
  bot: { stop(reason: string): void | Promise<void> };
  coachTask: { stop(): void };
  app: { close(): Promise<void> };
  exit?: (code: number) => void;
}

export function createShutdownHandler(
  deps: ShutdownDeps,
): (signal: string) => Promise<void> {
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;
  return async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, stopping...`);
    try {
      await deps.bot.stop(signal);
      deps.coachTask.stop();
      await deps.app.close();
    } catch (e: any) {
      console.error(`[shutdown] error during stop: ${e.message}`);
    } finally {
      exit(0);
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/shutdown.test.ts`
Expected: PASS — 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/shutdown.ts tests/shutdown.test.ts
git commit -m "feat: awaited idempotent shutdown handler that flushes before exit"
```

---

### Task 6: Wire everything into `main.ts`

**Files:**
- Modify: `src/main.ts`

This is composition-root wiring with no new unit test (the units are covered above); it's verified by build + a local smoke run in Task 7.

- [ ] **Step 1: Add imports**

Add these import lines alongside the existing imports near the top of `src/main.ts`:

```typescript
import { HealthState } from './health/health-state';
import { startTelegramPinger } from './health/telegram-pinger';
import { createShutdownHandler } from './shutdown';
```

- [ ] **Step 2: Create HealthState and pass it to the scheduler**

In `src/main.ts`, replace this line:

```typescript
  const coachTask = startCoachScheduler(coach);
```

with:

```typescript
  const health = new HealthState(Date.now());
  const coachTask = startCoachScheduler(coach, health);
```

- [ ] **Step 3: Pass HealthState to the server**

In `src/main.ts`, replace this line:

```typescript
  const app = createServer();
```

with:

```typescript
  const app = createServer(health);
```

- [ ] **Step 4: Start the pinger after launch and replace the shutdown handlers**

In `src/main.ts`, replace this block:

```typescript
  await bot.launch();
  console.log('Telegraf bot launched (polling).');

  process.once('SIGINT', () => { bot.stop('SIGINT'); coachTask.stop(); app.close(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); coachTask.stop(); app.close(); });
```

with:

```typescript
  await bot.launch();
  console.log('Telegraf bot launched (polling).');

  const pinger = startTelegramPinger(bot.telegram, health);

  const shutdown = createShutdownHandler({
    bot,
    coachTask: { stop: () => { pinger.stop(); coachTask.stop(); } },
    app,
  });
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 5: Verify the whole suite and the build pass**

Run: `npx jest && npm run build`
Expected: all tests PASS; `tsc` completes with no errors and emits `dist/main.js`.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire HealthState, telegram pinger, and graceful shutdown into main"
```

---

### Task 7: Local smoke verification

**Files:** none (manual verification).

- [ ] **Step 1: Build and start the bot locally**

Ensure a local `.env` exists with a valid (dev) `TELEGRAM_BOT_TOKEN` and the other required vars, then:

Run: `npm run build && node dist/main.js`
Expected: logs `Fastify listening on :3000` and `Telegraf bot launched (polling).` with no crash.

- [ ] **Step 2: Hit the deep health endpoint**

In a second terminal, run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/healthz`
Expected: `200` once the first `getMe` ping has run (immediately at boot). Then `curl -s http://localhost:3000/healthz | jq` shows `ok: true`, a non-null `lastTelegramOkAtMs`, and a `startedAtMs`.

- [ ] **Step 3: Verify graceful shutdown**

In the bot terminal, press `Ctrl-C`.
Expected: logs `[shutdown] received SIGINT, stopping...`, the process exits within a second or two with code 0 (no hang, no stack trace).

- [ ] **Step 4: No commit**

This task only verifies behavior; nothing to commit.

---

## Self-Review

**Spec coverage** (against the design doc's app-side items):
- "Deep `/healthz` (track lastSuccessfulPollAt / lastCronTickAt, return non-2xx when stale)" → Tasks 1, 2, 3, 4. (Telegram reachability via `getMe` is a stronger signal than `lastSuccessfulPollAt` for a low-volume bot — documented in the plan intro; Supabase ping intentionally deferred, see note below.)
- "Tighten shutdown — await closes + process.exit(0)" → Tasks 5, 6.
- "(Optional) bind Fastify to 127.0.0.1" → intentionally **not** included (egress-only SG already blocks inbound; optional hardening, out of scope for this prerequisite plan).

**Deliberate scope cut:** the design doc mentions a Supabase ping in `/healthz`. Omitted here to avoid coupling liveness to a network round-trip on every probe (a slow Supabase shouldn't trigger systemd restarts of a healthy bot). DB reachability belongs in the deferred observability pass, not the restart-triggering liveness check. Noted so it isn't mistaken for a gap.

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `HealthState` (`markTelegramOk`, `markCronTick`, `snapshot`), `HealthSnapshot` fields (`lastTelegramOkAtMs`, `lastCronTickAtMs`, `startedAtMs`, `ok`, `telegramOk`, `cronOk`), `pingTelegramOnce`/`startTelegramPinger`, `runCoachTick`/`startCoachScheduler(coach, health)`, `createServer(health?)`, `createShutdownHandler(deps)` — all names match across tasks and the `main.ts` wiring.

---

## Post-execution amendments

The plan was executed via subagent-driven development; these refinements were made during execution (each reviewed and committed):

- **Task 2:** `pingTelegramOnce` renders non-`Error` rejections safely (`e instanceof Error ? e.message : String(e)`) and logs every failure to stderr (so `journalctl` explains any 503/restart); added a test for the non-`Error` path.
- **Task 4:** the endpoint reads real `Date.now()`, so the tests were anchored to real time (`const now = Date.now()` / `Date.now() - 10_000_000`) rather than the fixed `T0` constant in the original draft, which would have read as stale against the production clock. Also captured a single `nowMs` so the response's `nowMs` and `ts` are the same instant.
- **Task 5:** hardened from a single try/catch to **best-effort** — each of `bot.stop` / `coachTask.stop` / `app.close` is attempted independently (via an `attempt(label, fn)` helper) so one failure can't skip the poll-offset flush or server close; error logging uses `console.error(..., e)`. Added a test for the bot-stop-throws path.
- **Task 6b (new — build output fix):** discovered during Task 6 that `npm start` (`node dist/main.js`) didn't match `tsc` output (`dist/src/main.js`, with `tests`/`seeds`/`scripts` also compiled in) because `tsconfig.json` uses `rootDir: "."`. Added `tsconfig.build.json` (`rootDir: src`, `include: src/**`, `types: ["node"]`) and pointed `build` at it, so the production build emits `dist/main.js` cleanly. `tsconfig.json` left untouched so ts-jest keeps type-checking tests.
- **Task 3:** coach scheduler error logging aligned to the same safe `console.error(..., e)` style for consistency.

**Final state:** 64 tests passing (19 suites); `npm run build` clean, emits `dist/main.js`. Final holistic review: ready to merge, no must-fix items. Task 7 (local smoke run of the live polling bot) is left for the human to run, since it polls the real bot token (ADR 0001 single-instance) and hits live Telegram/OpenAI/Supabase.

## Next plan (separate document)

After this lands, the infrastructure plan (`2026-05-30-deploy-infra-aws-terraform.md`) covers: Terraform S3 state bootstrap → networking (public subnet, egress-only SG, no NAT) → EC2 + systemd units (incl. the `kbot-health.timer` that probes this `/healthz`) → Secrets Manager config secret → GitHub OIDC + SSM deploy pipeline → guardrails. It depends on this plan being merged (the health endpoint and clean shutdown must exist first).
