import { LLMClient } from '../llm/llm.client';

export interface CorrectionInput {
  userText: string;
  expectedMeaningEn: string;
  scenario: string;
  userTopikLevel: number;
}

export interface StructuredMistake {
  userText: string;
  correctText: string;
  category: 'vocab' | 'particle' | 'tense' | 'word_order' | 'spelling' | 'other';
  relatedVocabLemma?: string;
  relatedGrammarPattern?: string;
}

export interface CorrectionOutput {
  tone: string;
  correction: string;
  mistakes: StructuredMistake[];
}

export class CorrectionService {
  constructor(private readonly llm: LLMClient) {}

  async correct(input: CorrectionInput): Promise<CorrectionOutput> {
    const system = [
      `You are a Korean tutor helping a learner in a ${input.scenario} scenario.`,
      `The learner is at TOPIK level ${input.userTopikLevel}.`,
      `Tone: warm, encouraging, never harsh. Frame mistakes as opportunities.`,
      `The learner tried to express: "${input.expectedMeaningEn}"`,
      ``,
      `Reply in JSON with: tone (1 short encouraging Korean sentence), correction (the natural Korean sentence), mistakes (array).`,
      `Each mistake: { userText, correctText, category, relatedVocabLemma?, relatedGrammarPattern? }`,
      `Categories: vocab, particle, tense, word_order, spelling, other.`,
      `If the answer is correct, mistakes is an empty array.`,
    ].join('\n');

    const raw = await this.llm.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Learner wrote: "${input.userText}"` },
      ],
      jsonMode: true, temperature: 0.3,
    });

    let parsed: CorrectionOutput;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error(`Correction LLM returned invalid JSON: ${raw}`); }
    parsed.mistakes ??= [];
    return parsed;
  }
}
