import { stripEndings, extractLemmaCandidates } from '../../src/memory/morphology';

describe('stripEndings', () => {
  it('returns input unchanged when no ending matches', () => {
    expect(stripEndings('메뉴')).toBe('메뉴');
  });

  it('strips informal polite present', () => {
    expect(stripEndings('먹어요')).toBe('먹다');
    expect(stripEndings('가요')).toBe('가다');
  });

  it('strips past-tense forms', () => {
    expect(stripEndings('먹었어요')).toBe('먹다');
    expect(stripEndings('갔어요')).toBe('가다');
  });

  it('strips formal polite forms', () => {
    expect(stripEndings('먹습니다')).toBe('먹다');
  });
});

describe('extractLemmaCandidates', () => {
  it('splits on whitespace and punctuation, strips particles', () => {
    const tokens = extractLemmaCandidates('저는 김치를 먹었어요.');
    expect(tokens).toEqual(expect.arrayContaining(['저', '김치', '먹다']));
  });
});
