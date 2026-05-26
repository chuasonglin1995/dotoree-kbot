import { VocabRow, GrammarRow } from '../db/types';

export interface VocabGenInput {
  scenario: string;
  scenarioRole: string;
  vocabList: VocabRow[];
  grammarList: GrammarRow[];
  conversationHistory: Array<{ role: 'bot' | 'user'; textKo?: string; textEn?: string }>;
  userTopikLevel: number;
  newWordsBudget: number;
  intent: 'starter' | 'prompt' | 'followup';
}

export interface VocabGenOutput {
  textKo: string;
  textEn: string;
  newWordsUsed: string[];
}

export interface VocabConstrainedGenerator {
  generate(input: VocabGenInput): Promise<VocabGenOutput>;
}
