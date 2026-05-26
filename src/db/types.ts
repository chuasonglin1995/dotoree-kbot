export interface UserRow {
  id: string;
  telegram_id: number;
  current_topik_level: number;
  created_at: string;
  last_seen_at: string | null;
}

export interface VocabRow {
  id: number;
  lemma_ko: string;
  gloss_en: string;
  pos: string;
  topik_level: number;
  freq_tier: number;
  scenarios: string[];
}

export interface GrammarRow {
  id: number;
  pattern: string;
  gloss_en: string;
  example_ko: string;
  example_en: string;
  topik_level: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  scenario: string;
  started_at: string;
  ended_at: string | null;
}

export interface TurnRow {
  id: string;
  session_id: string;
  turn_number: number;
  prompt_en: string | null;
  user_input_ko: string | null;
  bot_correction: string | null;
  bot_followup_ko: string | null;
  bot_followup_en: string | null;
  hints_used: number;
  created_at: string;
}

export interface ExposureRow {
  user_id: string;
  vocab_id: number;
  exposure_count: number;
  correct_count: number;
  incorrect_count: number;
  last_seen_at: string;
}

export interface MistakeRow {
  id: string;
  user_id: string;
  turn_id: string;
  user_text: string;
  correct_text: string;
  category: string | null;
  related_vocab_id: number | null;
  related_grammar_id: number | null;
  scheduled_review_at: string | null;
  resolved_at: string | null;
  created_at: string;
}
