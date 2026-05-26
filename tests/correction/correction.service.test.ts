import { CorrectionService } from '../../src/correction/correction.service';
import { LLMClient } from '../../src/llm/llm.client';

class FakeLLM implements LLMClient {
  constructor(private readonly out: string) {}
  async complete() { return this.out; }
}

describe('CorrectionService', () => {
  it('parses structured correction JSON', async () => {
    const llm = new FakeLLM(JSON.stringify({
      tone: '잘했어요!',
      correction: '저는 김치를 먹어요.',
      mistakes: [{
        userText: '김치 먹어요',
        correctText: '김치를 먹어요',
        category: 'particle',
        relatedGrammarPattern: '을/를',
      }],
    }));
    const svc = new CorrectionService(llm);
    const out = await svc.correct({
      userText: '저는 김치 먹어요.', expectedMeaningEn: 'I eat kimchi.',
      scenario: 'restaurant', userTopikLevel: 1,
    });
    expect(out.correction).toBe('저는 김치를 먹어요.');
    expect(out.mistakes[0].category).toBe('particle');
  });

  it('handles a perfect answer with empty mistakes', async () => {
    const llm = new FakeLLM(JSON.stringify({
      tone: '완벽해요!', correction: '저는 김치를 먹어요.', mistakes: [],
    }));
    const svc = new CorrectionService(llm);
    const out = await svc.correct({
      userText: '저는 김치를 먹어요.', expectedMeaningEn: 'I eat kimchi.',
      scenario: 'restaurant', userTopikLevel: 1,
    });
    expect(out.mistakes).toEqual([]);
  });
});
