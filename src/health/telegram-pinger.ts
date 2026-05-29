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
