import { MistakesService } from '../../src/memory/mistakes.service';

function makeDb() {
  const inserted: any[] = [];
  const from = jest.fn((table: string) => ({
    insert: jest.fn((rows: any) => {
      inserted.push({ table, rows });
      return Promise.resolve({ error: null });
    }),
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  }));
  return { client: { from }, inserted } as any;
}

describe('MistakesService.recordAll', () => {
  it('inserts one row per mistake with scheduled review tomorrow', async () => {
    const db = makeDb();
    const svc = new MistakesService(db.client);
    await svc.recordAll('user-1', 'turn-1', [
      { userText: '김치 먹어요', correctText: '김치를 먹어요', category: 'particle' },
    ]);
    expect(db.inserted[0].table).toBe('mistakes');
    expect(db.inserted[0].rows[0]).toMatchObject({
      user_id: 'user-1', turn_id: 'turn-1', category: 'particle',
    });
    expect(db.inserted[0].rows[0].scheduled_review_at).toBeTruthy();
  });

  it('no-ops on empty mistakes', async () => {
    const db = makeDb();
    const svc = new MistakesService(db.client);
    await svc.recordAll('user-1', 'turn-1', []);
    expect(db.inserted).toHaveLength(0);
  });
});
