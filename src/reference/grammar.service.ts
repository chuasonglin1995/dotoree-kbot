import { SupabaseClient } from '@supabase/supabase-js';
import { GrammarRow } from '../db/types';

export class GrammarService {
  constructor(private readonly db: SupabaseClient) {}

  async forLevel(maxTopikLevel: number): Promise<GrammarRow[]> {
    const { data, error } = await this.db
      .from('grammar').select('*').lte('topik_level', maxTopikLevel);
    if (error) throw error;
    return (data ?? []) as GrammarRow[];
  }
}
