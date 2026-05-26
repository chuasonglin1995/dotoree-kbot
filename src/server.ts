import Fastify, { FastifyInstance } from 'fastify';

export function createServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));
  return app;
}
