import 'dotenv/config';
import { loadConfig } from '../src/config/env';
import { createSupabase } from '../src/db/supabase';
import { OpenAILLMClient } from '../src/llm/openai.client';
import { PromptVocabGenerator } from '../src/llm/prompt-vocab-generator';
import { extractLemmaCandidates } from '../src/memory/morphology';
import { VocabRow, GrammarRow } from '../src/db/types';
import { findScenario } from '../src/reference/scenarios';

async function main() {
  const config = loadConfig(process.env);
  const db = createSupabase(config);

  const { data: vocab } = await db.from('vocab').select('*')
    .lte('topik_level', 2).contains('scenarios', ['restaurant']);
  const { data: grammar } = await db.from('grammar').select('*').lte('topik_level', 2);
  if (!vocab || !grammar) throw new Error('vocab/grammar query returned null');

  const scenario = findScenario('restaurant')!;
  const llm = new OpenAILLMClient(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  const gen = new PromptVocabGenerator(llm);

  const vocabLemmas = new Set((vocab as VocabRow[]).map((v) => v.lemma_ko));
  const history: any[] = [];

  console.log(`\nRestaurant vocab: ${vocab.length} words / Grammar: ${grammar.length} patterns\n`);

  for (let turn = 1; turn <= 5; turn++) {
    const out = await gen.generate({
      scenario: scenario.id, scenarioRole: scenario.role,
      vocabList: vocab as VocabRow[], grammarList: grammar as GrammarRow[],
      conversationHistory: history, userTopikLevel: 2, newWordsBudget: 2,
      intent: turn === 1 ? 'starter' : 'prompt',
    });
    const tokens = extractLemmaCandidates(out.textKo);
    const oov = tokens.filter((t) => !vocabLemmas.has(t) && t.trim().length > 0);
    const inVocabRate = 1 - oov.length / Math.max(tokens.length, 1);

    console.log(`Turn ${turn} (bot):`);
    console.log(`  KO: ${out.textKo}`);
    console.log(`  EN: ${out.textEn}`);
    console.log(`  In-vocab rate: ${(inVocabRate * 100).toFixed(0)}%`);
    console.log(`  OOV tokens: ${oov.join(', ') || '(none)'}\n`);

    history.push({ role: 'bot', textKo: out.textKo, textEn: out.textEn });
    history.push({ role: 'user', textKo: '네, 알겠습니다.', textEn: 'OK, got it.' });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
