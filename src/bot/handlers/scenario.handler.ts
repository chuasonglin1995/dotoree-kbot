import { Context } from 'telegraf';
import { SessionService } from '../../session/session.service';
import { VocabService } from '../../reference/vocab.service';
import { GrammarService } from '../../reference/grammar.service';
import { findScenario } from '../../reference/scenarios';
import { VocabConstrainedGenerator } from '../../llm/vocab-generator.interface';
import { formatKoWithSpoilerEn, hintKeyboard } from '../formatting';
import { ExposuresService } from '../../memory/exposures.service';
import { extractLemmaCandidates } from '../../memory/morphology';

export class ScenarioHandler {
  constructor(
    private readonly sessions: SessionService,
    private readonly vocab: VocabService,
    private readonly grammar: GrammarService,
    private readonly generator: VocabConstrainedGenerator,
    private readonly exposures: ExposuresService,
  ) {}

  async handle(ctx: Context, scenarioId: string) {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const user = await this.sessions.findOrCreateUser(tgId);
    const scenario = findScenario(scenarioId);
    if (!scenario) { await ctx.answerCbQuery('Unknown scenario'); return; }
    await ctx.answerCbQuery(scenario.label);

    const session = await this.sessions.openSession(user.id, scenarioId);
    const vocabList = await this.vocab.forScenario(scenarioId, user.current_topik_level + 1);
    const grammarList = await this.grammar.forLevel(user.current_topik_level + 1);

    const opener = await this.generator.generate({
      scenario: scenario.id, scenarioRole: scenario.role,
      vocabList, grammarList,
      conversationHistory: [], userTopikLevel: user.current_topik_level,
      newWordsBudget: 2, intent: 'starter',
    });

    const turn = await this.sessions.appendTurn(session.id, {
      prompt_en: opener.textEn,
      bot_followup_ko: opener.textKo,
      bot_followup_en: opener.textEn,
    });

    const lemmas = extractLemmaCandidates(opener.textKo);
    await this.exposures.recordExposure(user.id, lemmas);

    await ctx.reply(formatKoWithSpoilerEn(opener.textKo, opener.textEn), {
      parse_mode: 'MarkdownV2',
      reply_markup: hintKeyboard(turn.id).reply_markup,
    });
  }
}
