import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from '../src/config/env';
import { createSupabase } from '../src/db/supabase';
import { VocabRow, GrammarRow } from '../src/db/types';

async function seedVocab(client: SupabaseClient) {
  const file = path.resolve(__dirname, '../word-bank/vocab-v0.json');
  const rows: VocabRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length} vocab rows...`);
  const { error } = await client.from('vocab').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log('Vocab seed complete.');
}

async function seedGrammar(client: SupabaseClient) {
  const file = path.resolve(__dirname, '../word-bank/grammar-v0.json');
  const rows: GrammarRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length} grammar rows...`);
  const { error } = await client.from('grammar').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log('Grammar seed complete.');
}

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
