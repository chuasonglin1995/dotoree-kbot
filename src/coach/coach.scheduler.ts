import * as cron from 'node-cron';
import { CoachService } from './coach.service';

export function startCoachScheduler(coach: CoachService): cron.ScheduledTask {
  return cron.schedule('*/30 * * * *', async () => {
    console.log('[coach] running rebalance...');
    try {
      await coach.rebalanceAllUsers();
    } catch (e: any) {
      console.error(`[coach] failed: ${e.message}`);
    }
  });
}
