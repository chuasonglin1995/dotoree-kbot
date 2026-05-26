import { Telegraf } from 'telegraf';
import { AppConfig } from '../config/env';
import { StartHandler } from './handlers/start.handler';

export interface BotDeps {
  start: StartHandler;
}

export function createBot(config: AppConfig, deps: BotDeps): Telegraf {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
  bot.start((ctx) => deps.start.handle(ctx));
  return bot;
}
