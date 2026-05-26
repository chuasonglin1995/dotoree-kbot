import { LLMClient } from './llm.client';
import {
  VocabConstrainedGenerator, VocabGenInput, VocabGenOutput,
} from './vocab-generator.interface';

export class PromptVocabGenerator implements VocabConstrainedGenerator {
  constructor(private readonly llm: LLMClient) {}

  async generate(input: VocabGenInput): Promise<VocabGenOutput> {
    const vocabBlock = input.vocabList.map((v) => `${v.lemma_ko} (${v.gloss_en})`).join(', ');
    const grammarBlock = input.grammarList.map((g) => `${g.pattern} — ${g.gloss_en}`).join('\n');
    const history = input.conversationHistory
      .map((m) => `${m.role}: ${m.textKo ?? m.textEn ?? ''}`).join('\n');

    const systemPrompt = [
      `You are ${input.scenarioRole} in a roleplay for a Korean learner.`,
      `The learner is at TOPIK level ${input.userTopikLevel}.`,
      `Speak in natural Korean appropriate to the scenario.`,
      `STRICT: limit your vocabulary to the words in VOCAB. You may use up to ${input.newWordsBudget} new word(s) outside this list if absolutely necessary.`,
      `Use grammar patterns from GRAMMAR. Keep sentences short.`,
      `Output JSON with fields: textKo, textEn, newWordsUsed (array of lemmas you used that were NOT in VOCAB).`,
      ``,
      `VOCAB: ${vocabBlock}`,
      ``,
      `GRAMMAR:\n${grammarBlock}`,
    ].join('\n');

    const userIntent = {
      starter: 'Start the conversation. One short sentence.',
      prompt: 'Continue. Ask the learner something they can respond to. One short sentence.',
      followup: 'React naturally and ask one short follow-up question.',
    }[input.intent];

    const messages: any = [{ role: 'system', content: systemPrompt }];
    if (history) {
      messages.push({ role: 'user', content: `Conversation so far:\n${history}\n\n${userIntent}` });
    } else {
      messages.push({ role: 'user', content: userIntent });
    }

    const raw = await this.llm.complete({ messages, jsonMode: true, temperature: 0.7 });
    let parsed: VocabGenOutput;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`LLM returned invalid JSON: ${raw}`);
    }
    if (typeof parsed.textKo !== 'string' || typeof parsed.textEn !== 'string') {
      throw new Error(`LLM JSON missing textKo/textEn: ${raw}`);
    }
    if (!Array.isArray(parsed.newWordsUsed)) parsed.newWordsUsed = [];
    return parsed;
  }
}
