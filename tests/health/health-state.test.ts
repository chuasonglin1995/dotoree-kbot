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
