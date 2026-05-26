import 'dotenv/config';
import { loadConfig } from '../src/config/env';
import { createSupabase } from '../src/db/supabase';
import { seedVocab } from './seed-vocab';
import { seedGrammar } from './seed-grammar';

async function main() {
  const config = loadConfig(process.env);
  const client = createSupabase(config);
  await seedVocab(client);
  await seedGrammar(client);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
