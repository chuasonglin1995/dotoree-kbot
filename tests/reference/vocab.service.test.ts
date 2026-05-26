import { VocabService } from '../../src/reference/vocab.service';
import { VocabRow } from '../../src/db/types';

function makeFakeClient(rows: VocabRow[]) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lte: jest.fn().mockReturnValue({
          contains: jest.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('VocabService.forScenario', () => {
  it('queries vocab filtered by scenario and topik level', async () => {
    const rows: VocabRow[] = [
      { id: 1, lemma_ko: '먹다', gloss_en: 'to eat', pos: 'verb',
        topik_level: 1, freq_tier: 1, scenarios: ['restaurant'] },
    ];
    const fake = makeFakeClient(rows);
    const svc = new VocabService(fake);
    const result = await svc.forScenario('restaurant', 1);
    expect(fake.from).toHaveBeenCalledWith('vocab');
    expect(result).toEqual(rows);
  });
});
