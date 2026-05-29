import { Context } from 'telegraf';
import { SessionService } from '../../session/session.service';
import { VocabService } from '../../reference/vocab.service';
import { GrammarService } from '../../reference/grammar.service';
import { findScenario } from '../../reference/scenarios';
import { CorrectionService } from '../../correction/correction.service';
import { VocabConstrainedGenerator } from '../../llm/vocab-generator.interface';
import { formatKoWithSpoilerEn, escapeMdV2, turnKeyboard } from '../formatting';
import { ExposuresService } from '../../memory/exposures.service';
import { MistakesService } from '../../memory/mistakes.service';
import { extractLemmaCandidates } from '../../memory/morphology';

export class MessageHandler {
  constructor(
    private readonly sessions: SessionService,
    private readonly vocab: VocabService,
    private readonly grammar: GrammarService,
    private readonly correction: CorrectionService,
    private readonly generator: VocabConstrainedGenerator,
    private readonly exposures: ExposuresService,
    private readonly mistakes: MistakesService,
  ) {}

  async handle(ctx: Context, text: string) {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const user = await this.sessions.findOrCreateUser(tgId);
    const session = await this.sessions.currentSession(user.id);
    if (!session) { await ctx.reply('Pick a scenario first — /start'); return; }
    const scenario = findScenario(session.scenario);
    if (!scenario) return;

    const lastBot = await this.sessions.lastTurn(session.id);

    // 1. Correct
    const correction = await this.correction.correct({
      userText: text,
      expectedMeaningEn: lastBot?.bot_followup_en ?? 'continue the conversation',
      scenario: scenario.id,
      userTopikLevel: user.current_topik_level,
    });

    // 2. Generate follow-up
    const vocabList = await this.vocab.forScenario(scenario.id, user.current_topik_level + 1);
    const grammarList = await this.grammar.forLevel(user.current_topik_level + 1);
    const followup = await this.generator.generate({
      scenario: scenario.id, scenarioRole: scenario.role,
      vocabList, grammarList,
      conversationHistory: [
        { role: 'bot', textKo: lastBot?.bot_followup_ko ?? '' },
        { role: 'user', textKo: text },
      ],
      userTopikLevel: user.current_topik_level,
      newWordsBudget: 2, intent: 'followup',
    });

    // 3. Write turn
    const turn = await this.sessions.appendTurn(session.id, {
      prompt_en: lastBot?.bot_followup_en ?? null,
      user_input_ko: text,
      bot_correction: correction.correction,
      bot_followup_ko: followup.textKo,
      bot_followup_en: followup.textEn,
    });

    const lemmas = [...extractLemmaCandidates(text), ...extractLemmaCandidates(followup.textKo)];
    await this.exposures.recordExposure(user.id, lemmas);
    if (correction.mistakes.length > 0) {
      await this.mistakes.recordAll(user.id, turn.id, correction.mistakes);
    }

    // 4. Reply
    const correctionBlock = correction.mistakes.length === 0
      ? `✨ ${escapeMdV2(correction.tone)}`
      : `${escapeMdV2(correction.tone)}\n\n_Correction:_ ${escapeMdV2(correction.correction)}`;
    const followupBlock = formatKoWithSpoilerEn(followup.textKo, followup.textEn);

    await ctx.reply(`${correctionBlock}\n\n${followupBlock}`, {
      parse_mode: 'MarkdownV2',
      reply_markup: turnKeyboard(turn.id).reply_markup,
    });
  }
}
