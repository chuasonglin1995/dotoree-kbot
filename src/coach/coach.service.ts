import { SupabaseClient } from '@supabase/supabase-js';

export interface RecentTurn { hintsUsed: number; hadMistake: boolean; }
export interface CoachDecisionInput { currentLevel: number; recentTurns: RecentTurn[]; }

export class CoachService {
  constructor(private readonly db: SupabaseClient) {}

  static decide(input: CoachDecisionInput): number {
    const N = input.recentTurns.length;
    if (N < 5) return input.currentLevel;
    const cleanRate = input.recentTurns.filter((t) => !t.hadMistake).length / N;
    const hint3Count = input.recentTurns.filter((t) => t.hintsUsed >= 3).length;
    const mistakeRate = input.recentTurns.filter((t) => t.hadMistake).length / N;

    if (cleanRate >= 0.75 && hint3Count <= 1) {
      return Math.min(6, input.currentLevel + 1);
    }
    if (mistakeRate >= 0.5 || hint3Count >= 3) {
      return Math.max(1, input.currentLevel - 1);
    }
    return input.currentLevel;
  }

  async rebalanceAllUsers(): Promise<void> {
    const { data: users, error } = await this.db
      .from('users').select('id, current_topik_level');
    if (error) throw error;

    for (const u of users ?? []) {
      const userId = (u as any).id;
      const { data: turns } = await this.db
        .from('turns').select('id, hints_used')
        .order('created_at', { ascending: false }).limit(10);
      if (!turns) continue;

      const { data: mistakeRows } = await this.db
        .from('mistakes').select('turn_id').eq('user_id', userId);
      const mistakeTurnIds = new Set((mistakeRows ?? []).map((m: any) => m.turn_id));

      const recentTurns: RecentTurn[] = turns.map((t: any) => ({
        hintsUsed: t.hints_used ?? 0,
        hadMistake: mistakeTurnIds.has(t.id),
      }));

      const newLevel = CoachService.decide({
        currentLevel: (u as any).current_topik_level, recentTurns,
      });
      if (newLevel !== (u as any).current_topik_level) {
        await this.db.from('users')
          .update({ current_topik_level: newLevel }).eq('id', userId);
        console.log(`Coach: user ${userId} ${(u as any).current_topik_level} → ${newLevel}`);
      }
    }
  }
}
