import { loadConfig } from '../../src/config/env';

const baseEnv = {
  TELEGRAM_BOT_TOKEN: 'tg',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SECRET_KEY: 'svc',
  OPENAI_API_KEY: 'sk',
  OPENAI_MODEL: 'gpt-4.1-mini',
  WHITELISTED_TELEGRAM_IDS: '12345',
};

describe('loadConfig', () => {
  it('throws if a required variable is missing', () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: 'x' } as any))
      .toThrow(/SUPABASE_URL/);
  });

  it('returns a typed config when all variables are present', () => {
    const cfg = loadConfig({ ...baseEnv, PORT: '3001' });
    expect(cfg.OPENAI_MODEL).toBe('gpt-4.1-mini');
    expect(cfg.WHITELISTED_TELEGRAM_IDS).toEqual([12345]);
    expect(cfg.PORT).toBe(3001);
  });

  it('parses a comma-separated list of telegram ids', () => {
    const cfg = loadConfig({ ...baseEnv, WHITELISTED_TELEGRAM_IDS: '123, 456 ,789' });
    expect(cfg.WHITELISTED_TELEGRAM_IDS).toEqual([123, 456, 789]);
  });

  it('throws if a telegram id is not a number', () => {
    expect(() => loadConfig({ ...baseEnv, WHITELISTED_TELEGRAM_IDS: '123,abc' }))
      .toThrow(/non-number/);
  });

  it('defaults PORT to 3000', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.PORT).toBe(3000);
  });

  it('defaults OPENAI_TTS_MODEL to gpt-4o-mini-tts', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.OPENAI_TTS_MODEL).toBe('gpt-4o-mini-tts');
  });

  it('uses OPENAI_TTS_MODEL from env when provided', () => {
    const cfg = loadConfig({ ...baseEnv, OPENAI_TTS_MODEL: 'tts-1-hd' });
    expect(cfg.OPENAI_TTS_MODEL).toBe('tts-1-hd');
  });
});
