import { SupabaseClient } from '@supabase/supabase-js';
import { VocabRow } from '../db/types';

export class VocabService {
  constructor(private readonly db: SupabaseClient) {}

  async forScenario(scenario: string, maxTopikLevel: number): Promise<VocabRow[]> {
    const { data, error } = await this.db
      .from('vocab').select('*')
      .lte('topik_level', maxTopikLevel)
      .or(`scenarios.cs.["${scenario}"],scenarios.cs.["general"],scenarios.cs.["daily_life"]`);
    if (error) throw error;
    return (data ?? []) as VocabRow[];
  }

  async byLemma(lemma_ko: string): Promise<VocabRow | null> {
    const { data, error } = await this.db
      .from('vocab').select('*').eq('lemma_ko', lemma_ko)
      .limit(1).maybeSingle();
    if (error) throw error;
    return (data ?? null) as VocabRow | null;
  }
}
