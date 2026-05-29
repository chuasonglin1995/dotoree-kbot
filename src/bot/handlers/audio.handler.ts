import { Context } from 'telegraf';
import { SessionService } from '../../session/session.service';
import { TtsService } from '../../audio/tts.service';
import { findScenario } from '../../reference/scenarios';

export class AudioHandler {
  constructor(
    private readonly sessions: SessionService,
    private readonly tts: TtsService,
  ) {}

  async handle(ctx: Context, turnId: string): Promise<void> {
    // Dismiss the Telegram callback spinner immediately, before any work
    // that could throw. Errors below surface as chat replies instead of
    // toast messages. Matches the existing HintHandler/ScenarioHandler pattern.
    await ctx.answerCbQuery();

    try {
      const turn = await this.sessions.getTurn(turnId);
      if (!turn) {
        await ctx.reply('Message expired.');
        return;
      }

      // Resolve voice by the turn's own session, NOT currentSession(user).
      // An old turn must always play in its original scenario's voice, even
      // after the user switches to a new scenario.
      const session = await this.sessions.getSession(turn.session_id);
      if (!session) {
        await ctx.reply('Message expired.');
        return;
      }

      const scenario = findScenario(session.scenario);
      const text = turn.bot_followup_ko;
      if (!scenario || !text) {
        await ctx.reply('Audio unavailable, try again?');
        return;
      }

      const buffer = await this.tts.synthesize(text, scenario.voice);
      await ctx.replyWithVoice({ source: buffer });
    } catch (err) {
      console.error('[AudioHandler] failed:', err);
      await ctx.reply('Audio unavailable, try again?');
    }
  }
}
