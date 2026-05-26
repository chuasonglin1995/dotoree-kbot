import { ExposuresService } from '../../src/memory/exposures.service';

function makeDb() {
  const fromCalls: string[] = [];
  const upserted: any[] = [];
  const from = jest.fn((table: string) => {
    fromCalls.push(table);
    if (table === 'vocab') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [{ id: 1, lemma_ko: '먹다' }, { id: 2, lemma_ko: '김치' }],
            error: null,
          }),
        }),
      };
    }
    return {
      upsert: jest.fn((rows: any) => {
        upserted.push(rows);
        return Promise.resolve({ error: null });
      }),
    };
  });
  return { client: { from }, fromCalls, upserted } as any;
}

describe('ExposuresService.recordExposure', () => {
  it('looks up vocab IDs and upserts exposures', async () => {
    const db = makeDb();
    const svc = new ExposuresService(db.client);
    await svc.recordExposure('user-1', ['먹다', '김치', 'unknown']);
    expect(db.fromCalls).toContain('vocab');
    expect(db.fromCalls).toContain('exposures');
    expect(db.upserted[0]).toHaveLength(2); // 'unknown' filtered out
  });

  it('no-ops on empty input', async () => {
    const db = makeDb();
    const svc = new ExposuresService(db.client);
    await svc.recordExposure('user-1', []);
    expect(db.fromCalls).toHaveLength(0);
  });
});
