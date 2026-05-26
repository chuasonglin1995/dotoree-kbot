import { Context } from 'telegraf';
import { LLMClient } from '../../llm/llm.client';
import { SessionService } from '../../session/session.service';
import { escapeMdV2 } from '../formatting';

export class HintHandler {
  constructor(
    private readonly llm: LLMClient,
    private readonly sessions: SessionService,
  ) {}

  async handle(ctx: Context, tier: 1 | 2 | 3, turnId: string) {
    await ctx.answerCbQuery(`Hint ${tier}`);
    await this.sessions.setHintsUsed(turnId, tier);

    const turn = await this.sessions.getTurn(turnId);
    if (!turn) return;

    const focus = {
      1: 'List 3-5 key Korean vocabulary words the learner should use, with brief glosses. Keep short.',
      2: 'Describe the grammar pattern(s) the learner should use, with one short example.',
      3: 'Give the full natural Korean answer to the prompt. Then a one-line gentle note.',
    }[tier];

    const out = await this.llm.complete({
      messages: [
        { role: 'system', content: 'You are a kind Korean tutor giving a hint.' },
        { role: 'user', content: `Prompt: ${turn.bot_followup_en}\n${focus}` },
      ],
      temperature: 0.3,
    });
    await ctx.reply(`💡 ${escapeMdV2(out)}`, { parse_mode: 'MarkdownV2' });
  }
}
