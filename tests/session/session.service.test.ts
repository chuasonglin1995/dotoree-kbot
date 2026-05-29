import { SessionService } from '../../src/session/session.service';

function makeDb(rows: any) {
  const calls: any[] = [];
  const from = jest.fn((table: string) => ({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: rows[table] ?? null, error: null }),
      }),
    }),
    insert: jest.fn((payload: any) => {
      calls.push({ table, insert: payload });
      return {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'new-id', ...payload }, error: null,
          }),
        }),
      };
    }),
    update: jest.fn(),
  }));
  return { client: { from }, calls } as any;
}

describe('SessionService.findOrCreateUser', () => {
  it('returns existing user', async () => {
    const db = makeDb({ users: { id: 'u1', telegram_id: 123, current_topik_level: 2 } });
    const svc = new SessionService(db.client);
    const u = await svc.findOrCreateUser(123);
    expect(u.id).toBe('u1');
  });

  it('creates user if absent', async () => {
    const db = makeDb({});
    const svc = new SessionService(db.client);
    const u = await svc.findOrCreateUser(999);
    expect(u.id).toBe('new-id');
    expect(db.calls[0].insert).toEqual({ telegram_id: 999, current_topik_level: 1 });
  });
});

describe('SessionService.getSession', () => {
  it('returns session by id regardless of ended_at', async () => {
    const db = makeDb({ sessions: { id: 's1', user_id: 'u1', scenario: 'restaurant' } });
    const svc = new SessionService(db.client);
    const s = await svc.getSession('s1');
    expect(s).toEqual({ id: 's1', user_id: 'u1', scenario: 'restaurant' });
  });

  it('returns null when session does not exist', async () => {
    const db = makeDb({});
    const svc = new SessionService(db.client);
    const s = await svc.getSession('missing');
    expect(s).toBeNull();
  });
});
