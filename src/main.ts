import 'dotenv/config';
import { loadConfig } from './config/env';
import { createServer } from './server';
import { createSupabase } from './db/supabase';
import { SessionService } from './session/session.service';
import { StartHandler } from './bot/handlers/start.handler';
import { createBot } from './bot/bot';

async function main() {
  const config = loadConfig(process.env);
  const db = createSupabase(config);

  // Services
  const sessions = new SessionService(db);

  // Handlers
  const start = new StartHandler(sessions);

  // Bot
  const bot = createBot(config, { start });

  // HTTP
  const app = createServer();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`Fastify listening on :${config.PORT}`);

  // Telegram polling
  await bot.launch();
  console.log('Telegraf bot launched (polling).');

  process.once('SIGINT', () => { bot.stop('SIGINT'); app.close(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); app.close(); });
}

main().catch((err) => { console.error(err); process.exit(1); });
