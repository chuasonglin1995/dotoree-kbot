import { Telegraf, Context } from 'telegraf';
import { AppConfig } from '../config/env';
import { StartHandler } from './handlers/start.handler';
import { ScenarioHandler } from './handlers/scenario.handler';
import { MessageHandler } from './handlers/message.handler';
import { HintHandler } from './handlers/hint.handler';

export interface BotDeps {
  start: StartHandler;
  scenario: ScenarioHandler;
  message: MessageHandler;
  hint: HintHandler;
}

export function createBot(config: AppConfig, deps: BotDeps): Telegraf {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (id && config.WHITELISTED_TELEGRAM_IDS.includes(id)) return next();
  });

  bot.start((ctx) => deps.start.handle(ctx));
  bot.action(/^scenario:(.+)$/, (ctx) =>
    deps.scenario.handle(ctx as Context, (ctx as any).match[1]));
  bot.action(/^hint:([123]):(.+)$/, (ctx) => {
    const m = (ctx as any).match;
    return deps.hint.handle(ctx as Context, Number(m[1]) as 1 | 2 | 3, m[2]);
  });
  bot.on('text', (ctx) => deps.message.handle(ctx, ctx.message.text));

  return bot;
}
