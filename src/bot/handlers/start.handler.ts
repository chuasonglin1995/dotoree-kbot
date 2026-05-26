import { Context, Markup } from 'telegraf';
import { SessionService } from '../../session/session.service';
import { SCENARIOS } from '../../reference/scenarios';

export class StartHandler {
  constructor(private readonly sessions: SessionService) {}

  async handle(ctx: Context) {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    await this.sessions.findOrCreateUser(tgId);

    const buttons = SCENARIOS.map((s) =>
      Markup.button.callback(s.label, `scenario:${s.id}`));

    await ctx.reply(
      '안녕하세요! Pick a scenario to start practicing.',
      Markup.inlineKeyboard(buttons, { columns: 1 }),
    );
  }
}
