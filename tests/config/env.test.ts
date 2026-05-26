import { loadConfig } from '../../src/config/env';

describe('loadConfig', () => {
  it('throws if a required variable is missing', () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: 'x' } as any))
      .toThrow(/SUPABASE_URL/);
  });

  it('returns a typed config when all variables are present', () => {
    const cfg = loadConfig({
      TELEGRAM_BOT_TOKEN: 'tg',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      OPENAI_API_KEY: 'sk',
      OPENAI_MODEL: 'gpt-4.1-mini',
      DEV_USER_TELEGRAM_ID: '12345',
      PORT: '3001',
    });
    expect(cfg.OPENAI_MODEL).toBe('gpt-4.1-mini');
    expect(cfg.DEV_USER_TELEGRAM_ID).toBe(12345);
    expect(cfg.PORT).toBe(3001);
  });

  it('defaults PORT to 3000', () => {
    const cfg = loadConfig({
      TELEGRAM_BOT_TOKEN: 'tg',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      OPENAI_API_KEY: 'sk',
      OPENAI_MODEL: 'gpt-4.1-mini',
      DEV_USER_TELEGRAM_ID: '12345',
    });
    expect(cfg.PORT).toBe(3000);
  });
});
