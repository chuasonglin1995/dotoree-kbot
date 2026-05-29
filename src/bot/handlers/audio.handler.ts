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
    // Telegraf: answerCbQuery must be called exactly once per callback.
    // Each early-return path answers, and the happy path answers before
    // the heavy TTS work so the user sees the spinner dismiss promptly.

    const turn = await this.sessions.getTurn(turnId);
    if (!turn) {
      await ctx.answerCbQuery('Message expired');
      return;
    }

    // Resolve voice by the turn's own session, NOT currentSession(user).
    // An old turn must always play in its original scenario's voice, even
    // after the user switches to a new scenario.
    const session = await this.sessions.getSession(turn.session_id);
    if (!session) {
      await ctx.answerCbQuery('Message expired');
      return;
    }

    const scenario = findScenario(session.scenario);
    const text = turn.bot_followup_ko;
    if (!scenario || !text) {
      await ctx.answerCbQuery();
      await ctx.reply('Audio unavailable, try again?');
      return;
    }

    await ctx.answerCbQuery();
    try {
      const buffer = await this.tts.synthesize(text, scenario.voice);
      await ctx.replyWithVoice({ source: buffer });
    } catch (err) {
      console.error('[AudioHandler] tts failed:', err);
      await ctx.reply('Audio unavailable, try again?');
    }
  }
}
