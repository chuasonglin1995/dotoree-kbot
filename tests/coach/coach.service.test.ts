import { CoachService } from '../../src/coach/coach.service';

describe('CoachService.decide', () => {
  it('returns +1 when user is crushing it', () => {
    const decision = CoachService.decide({
      currentLevel: 1,
      recentTurns: Array.from({ length: 10 }, () => ({ hintsUsed: 0, hadMistake: false })),
    });
    expect(decision).toBe(2);
  });

  it('returns -1 when user is struggling', () => {
    const decision = CoachService.decide({
      currentLevel: 3,
      recentTurns: Array.from({ length: 10 }, () => ({ hintsUsed: 3, hadMistake: true })),
    });
    expect(decision).toBe(2);
  });

  it('returns current level when neither threshold met', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      hintsUsed: 1, hadMistake: i % 3 === 0,
    }));
    expect(CoachService.decide({ currentLevel: 2, recentTurns: turns })).toBe(2);
  });

  it('clamps to [1, 6]', () => {
    const allGreat = Array.from({ length: 10 }, () => ({ hintsUsed: 0, hadMistake: false }));
    expect(CoachService.decide({ currentLevel: 6, recentTurns: allGreat })).toBe(6);
    const allBad = Array.from({ length: 10 }, () => ({ hintsUsed: 3, hadMistake: true }));
    expect(CoachService.decide({ currentLevel: 1, recentTurns: allBad })).toBe(1);
  });

  it('no change when fewer than 5 turns', () => {
    expect(CoachService.decide({ currentLevel: 2, recentTurns: [] })).toBe(2);
  });
});
