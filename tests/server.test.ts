import { createServer } from '../src/server';
import { HealthState } from '../src/health/health-state';

const thresholds = { telegramStalenessMs: 180_000, cronStalenessMs: 2_100_000 };

describe('GET /healthz', () => {
  it('returns 200 and ok:true when no HealthState is provided (backward compatible)', async () => {
    const app = createServer();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('returns 200 and ok:true when health is fresh', async () => {
    const now = Date.now();
    const h = new HealthState(now, thresholds);
    h.markTelegramOk(now);
    h.markCronTick(now);
    const app = createServer(h);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 503 and ok:false when telegram liveness is stale', async () => {
    // started well past the staleness thresholds ago and never pinged -> stale
    const h = new HealthState(Date.now() - 10_000_000, thresholds);
    const app = createServer(h);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    await app.close();
  });
});
