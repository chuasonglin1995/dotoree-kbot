export interface AppConfig {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  WHITELISTED_TELEGRAM_IDS: number[];
  PORT: number;
}

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'WHITELISTED_TELEGRAM_IDS',
] as const;

export function loadConfig(raw: NodeJS.ProcessEnv): AppConfig {
  for (const key of REQUIRED) {
    if (!raw[key] || raw[key]!.trim() === '') {
      throw new Error(`Missing required env variable: ${key}`);
    }
  }
  const ids = raw.WHITELISTED_TELEGRAM_IDS!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) {
        throw new Error(`WHITELISTED_TELEGRAM_IDS contains a non-number: "${s}"`);
      }
      return n;
    });
  if (ids.length === 0) {
    throw new Error('WHITELISTED_TELEGRAM_IDS must contain at least one id');
  }
  const port = raw.PORT ? Number(raw.PORT) : 3000;
  if (!Number.isFinite(port)) {
    throw new Error('PORT must be a number');
  }
  return {
    TELEGRAM_BOT_TOKEN: raw.TELEGRAM_BOT_TOKEN!,
    SUPABASE_URL: raw.SUPABASE_URL!,
    SUPABASE_SECRET_KEY: raw.SUPABASE_SECRET_KEY!,
    OPENAI_API_KEY: raw.OPENAI_API_KEY!,
    OPENAI_MODEL: raw.OPENAI_MODEL!,
    WHITELISTED_TELEGRAM_IDS: ids,
    PORT: port,
  };
}
