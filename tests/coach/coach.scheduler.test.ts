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
