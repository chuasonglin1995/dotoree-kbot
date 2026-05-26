import 'dotenv/config';
import { loadConfig } from './config/env';
import { createServer } from './server';
import { createSupabase } from './db/supabase';
import { SessionService } from './session/session.service';
import { VocabService } from './reference/vocab.service';
import { GrammarService } from './reference/grammar.service';
import { OpenAILLMClient } from './llm/openai.client';
import { PromptVocabGenerator } from './llm/prompt-vocab-generator';
import { CorrectionService } from './correction/correction.service';
import { ExposuresService } from './memory/exposures.service';
import { MistakesService } from './memory/mistakes.service';
import { CoachService } from './coach/coach.service';
import { startCoachScheduler } from './coach/coach.scheduler';
import { StartHandler } from './bot/handlers/start.handler';
import { ScenarioHandler } from './bot/handlers/scenario.handler';
import { MessageHandler } from './bot/handlers/message.handler';
import { HintHandler } from './bot/handlers/hint.handler';
import { createBot } from './bot/bot';

async function main() {
  const config = loadConfig(process.env);
  const db = createSupabase(config);

  const llm = new OpenAILLMClient(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  const generator = new PromptVocabGenerator(llm);

  const sessions = new SessionService(db);
  const vocab = new VocabService(db);
  const grammar = new GrammarService(db);
  const correction = new CorrectionService(llm);
  const exposures = new ExposuresService(db);
  const mistakes = new MistakesService(db);
  const coach = new CoachService(db);
  const coachTask = startCoachScheduler(coach);

  const start = new StartHandler(sessions);
  const scenario = new ScenarioHandler(sessions, vocab, grammar, generator, exposures);
  const message = new MessageHandler(sessions, vocab, grammar, correction, generator, exposures, mistakes);
  const hint = new HintHandler(llm, sessions);

  const bot = createBot(config, { start, scenario, message, hint });

  const app = createServer();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`Fastify listening on :${config.PORT}`);

  await bot.launch();
  console.log('Telegraf bot launched (polling).');

  process.once('SIGINT', () => { bot.stop('SIGINT'); coachTask.stop(); app.close(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); coachTask.stop(); app.close(); });
}

main().catch((err) => { console.error(err); process.exit(1); });
