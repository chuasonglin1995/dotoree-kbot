import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/env';

export function createSupabase(config: AppConfig): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
