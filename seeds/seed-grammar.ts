import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { GrammarRow } from '../src/db/types';

export async function seedGrammar(client: SupabaseClient) {
  const file = path.resolve(__dirname, '../word-bank/grammar-v0.json');
  const rows: GrammarRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length} grammar rows...`);
  const { error } = await client.from('grammar').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log('Grammar seed complete.');
}
