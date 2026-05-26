import { PromptVocabGenerator } from '../../src/llm/prompt-vocab-generator';
import { LLMClient } from '../../src/llm/llm.client';
import { VocabRow, GrammarRow } from '../../src/db/types';

class FakeLLM implements LLMClient {
  public lastMessages: any = null;
  constructor(private readonly fixedJson: string) {}
  async complete({ messages }: any) { this.lastMessages = messages; return this.fixedJson; }
}

const vocab: VocabRow[] = [
  { id: 1, lemma_ko: '메뉴', gloss_en: 'menu', pos: 'noun',
    topik_level: 1, freq_tier: 3, scenarios: ['restaurant'] },
];
const grammar: GrammarRow[] = [
  { id: 1, pattern: '-아/어요', gloss_en: 'polite present',
    example_ko: '먹어요', example_en: 'I eat', topik_level: 1 },
];

describe('PromptVocabGenerator', () => {
  it('parses JSON output', async () => {
    const llm = new FakeLLM(JSON.stringify({
      textKo: '메뉴 보세요.', textEn: 'Please look at the menu.', newWordsUsed: [],
    }));
    const gen = new PromptVocabGenerator(llm);
    const out = await gen.generate({
      scenario: 'restaurant', scenarioRole: 'server',
      vocabList: vocab, grammarList: grammar,
      conversationHistory: [], userTopikLevel: 1, newWordsBudget: 1, intent: 'starter',
    });
    expect(out.textKo).toBe('메뉴 보세요.');
    expect(out.textEn).toBe('Please look at the menu.');
    expect(llm.lastMessages[0].role).toBe('system');
  });

  it('throws if LLM returns invalid JSON', async () => {
    const llm = new FakeLLM('not json');
    const gen = new PromptVocabGenerator(llm);
    await expect(gen.generate({
      scenario: 'restaurant', scenarioRole: 'server',
      vocabList: vocab, grammarList: grammar,
      conversationHistory: [], userTopikLevel: 1, newWordsBudget: 1, intent: 'starter',
    })).rejects.toThrow(/JSON/);
  });
});
