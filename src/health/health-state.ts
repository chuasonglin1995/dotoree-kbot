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
