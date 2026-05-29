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
