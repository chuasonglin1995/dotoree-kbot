import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { VocabRow } from '../src/db/types';

export async function seedVocab(client: SupabaseClient) {
  const file = path.resolve(__dirname, '../word-bank/vocab-v0.json');
  const rows: VocabRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length} vocab rows...`);
  const { error } = await client.from('vocab').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log('Vocab seed complete.');
}
