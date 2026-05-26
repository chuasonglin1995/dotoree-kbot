import { SupabaseClient } from '@supabase/supabase-js';

export class ExposuresService {
  constructor(private readonly db: SupabaseClient) {}

  async recordExposure(userId: string, lemmas: string[]): Promise<void> {
    if (lemmas.length === 0) return;
    const unique = Array.from(new Set(lemmas));
    const { data: vocabRows, error } = await this.db
      .from('vocab').select('id, lemma_ko').in('lemma_ko', unique);
    if (error) throw error;
    if (!vocabRows || vocabRows.length === 0) return;

    const vocabIds = vocabRows.map((v: any) => v.id);
    const { data: existing, error: exErr } = await this.db
      .from('exposures').select('vocab_id, exposure_count')
      .eq('user_id', userId).in('vocab_id', vocabIds);
    if (exErr) throw exErr;
    const existingMap = new Map<number, number>(
      (existing ?? []).map((e: any) => [e.vocab_id, e.exposure_count]),
    );

    const now = new Date().toISOString();
    const upserts = vocabRows.map((v: any) => ({
      user_id: userId,
      vocab_id: v.id,
      exposure_count: (existingMap.get(v.id) ?? 0) + 1,
      last_seen_at: now,
    }));
    const { error: upErr } = await this.db
      .from('exposures').upsert(upserts, { onConflict: 'user_id,vocab_id' });
    if (upErr) throw upErr;
  }

  async countKnown(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('exposures').select('vocab_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
  }
}
