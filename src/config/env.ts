export interface AppConfig {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  DEV_USER_TELEGRAM_ID: number;
  PORT: number;
}

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'DEV_USER_TELEGRAM_ID',
] as const;

export function loadConfig(raw: NodeJS.ProcessEnv): AppConfig {
  for (const key of REQUIRED) {
    if (!raw[key] || raw[key]!.trim() === '') {
      throw new Error(`Missing required env variable: ${key}`);
    }
  }
  const devId = Number(raw.DEV_USER_TELEGRAM_ID);
  if (!Number.isFinite(devId)) {
    throw new Error('DEV_USER_TELEGRAM_ID must be a number');
  }
  const port = raw.PORT ? Number(raw.PORT) : 3000;
  if (!Number.isFinite(port)) {
    throw new Error('PORT must be a number');
  }
  return {
    TELEGRAM_BOT_TOKEN: raw.TELEGRAM_BOT_TOKEN!,
    SUPABASE_URL: raw.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY!,
    OPENAI_API_KEY: raw.OPENAI_API_KEY!,
    OPENAI_MODEL: raw.OPENAI_MODEL!,
    DEV_USER_TELEGRAM_ID: devId,
    PORT: port,
  };
}
