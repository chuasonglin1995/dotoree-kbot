import { SupabaseClient } from '@supabase/supabase-js';
import { UserRow, SessionRow, TurnRow } from '../db/types';

export class SessionService {
  constructor(private readonly db: SupabaseClient) {}

  async findOrCreateUser(telegramId: number): Promise<UserRow> {
    const { data: existing } = await this.db
      .from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
    if (existing) return existing as UserRow;
    const { data, error } = await this.db
      .from('users').insert({ telegram_id: telegramId, current_topik_level: 1 })
      .select().single();
    if (error) throw error;
    return data as UserRow;
  }

  async openSession(userId: string, scenario: string): Promise<SessionRow> {
    const { data, error } = await this.db
      .from('sessions').insert({ user_id: userId, scenario }).select().single();
    if (error) throw error;
    return data as SessionRow;
  }

  async appendTurn(sessionId: string, turn: Partial<TurnRow>): Promise<TurnRow> {
    const { data: existing } = await this.db
      .from('turns').select('turn_number').eq('session_id', sessionId)
      .order('turn_number', { ascending: false }).limit(1).maybeSingle();
    const next = (existing?.turn_number ?? 0) + 1;
    const { data, error } = await this.db
      .from('turns').insert({ session_id: sessionId, ...turn, turn_number: next })
      .select().single();
    if (error) throw error;
    return data as TurnRow;
  }

  async currentSession(userId: string): Promise<SessionRow | null> {
    const { data, error } = await this.db
      .from('sessions').select('*').eq('user_id', userId).is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data ?? null) as SessionRow | null;
  }

  async lastTurn(sessionId: string): Promise<TurnRow | null> {
    const { data, error } = await this.db
      .from('turns').select('*').eq('session_id', sessionId)
      .order('turn_number', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data ?? null) as TurnRow | null;
  }

  async getTurn(turnId: string): Promise<TurnRow | null> {
    const { data, error } = await this.db
      .from('turns').select('*').eq('id', turnId).maybeSingle();
    if (error) throw error;
    return (data ?? null) as TurnRow | null;
  }

  async setHintsUsed(turnId: string, tier: number): Promise<void> {
    await this.db.from('turns').update({ hints_used: tier })
      .eq('id', turnId).lt('hints_used', tier);
  }
}
