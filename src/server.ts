import Fastify, { FastifyInstance } from 'fastify';
import { HealthState } from './health/health-state';

export function createServer(health?: HealthState): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get('/healthz', async (_req, reply) => {
    if (!health) {
      return { ok: true, ts: new Date().toISOString() };
    }
    const nowMs = Date.now();
    const snap = health.snapshot(nowMs);
    reply.code(snap.ok ? 200 : 503);
    return { ...snap, ts: new Date(nowMs).toISOString() };
  });
  return app;
}
