import 'dotenv/config';
import { loadConfig } from './config/env';
import { createServer } from './server';

async function main() {
  const config = loadConfig(process.env);
  const app = createServer();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`Fastify listening on :${config.PORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
