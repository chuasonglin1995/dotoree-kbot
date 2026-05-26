import { SupabaseClient } from '@supabase/supabase-js';
import { StructuredMistake } from '../correction/correction.service';
import { MistakeRow } from '../db/types';

export class MistakesService {
  constructor(private readonly db: SupabaseClient) {}

  async recordAll(userId: string, turnId: string, mistakes: StructuredMistake[]): Promise<void> {
    if (mistakes.length === 0) return;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const enriched = await Promise.all(mistakes.map(async (m) => {
      let related_vocab_id: number | null = null;
      let related_grammar_id: number | null = null;
      if (m.relatedVocabLemma) {
        const { data } = await this.db
          .from('vocab').select('id').eq('lemma_ko', m.relatedVocabLemma).maybeSingle();
        related_vocab_id = (data as any)?.id ?? null;
      }
      if (m.relatedGrammarPattern) {
        const { data } = await this.db
          .from('grammar').select('id').eq('pattern', m.relatedGrammarPattern).maybeSingle();
        related_grammar_id = (data as any)?.id ?? null;
      }
      return {
        user_id: userId, turn_id: turnId,
        user_text: m.userText, correct_text: m.correctText,
        category: m.category,
        related_vocab_id, related_grammar_id,
        scheduled_review_at: tomorrow,
      };
    }));

    const { error } = await this.db.from('mistakes').insert(enriched);
    if (error) throw error;
  }

  async dueReview(userId: string, limit = 5): Promise<MistakeRow[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from('mistakes').select('*').eq('user_id', userId)
      .is('resolved_at', null).lte('scheduled_review_at', now)
      .order('scheduled_review_at', { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []) as MistakeRow[];
  }
}
