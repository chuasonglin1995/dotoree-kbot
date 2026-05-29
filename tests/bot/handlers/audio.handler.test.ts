import { AudioHandler } from '../../../src/bot/handlers/audio.handler';

function makeCtx(overrides: Partial<any> = {}) {
  return {
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithVoice: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AudioHandler', () => {
  it('replies "Message expired" when turn does not exist', async () => {
    const sessions: any = {
      getTurn: jest.fn().mockResolvedValue(null),
      getSession: jest.fn(),
    };
    const tts: any = { synthesize: jest.fn() };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 'missing-turn');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith('Message expired.');
    expect(ctx.replyWithVoice).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('replies "Message expired" when session lookup returns null', async () => {
    const sessions: any = {
      getTurn: jest.fn().mockResolvedValue({
        id: 't1', session_id: 's1', bot_followup_ko: '안녕',
      }),
      getSession: jest.fn().mockResolvedValue(null),
    };
    const tts: any = { synthesize: jest.fn() };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 't1');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith('Message expired.');
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('resolves voice from the turn\'s session, not the user\'s current session', async () => {
    // Turn belongs to a Restaurant session. Handler must NOT consult `currentSession`.
    const sessions: any = {
      getTurn: jest.fn().mockResolvedValue({
        id: 't42', session_id: 's-restaurant', bot_followup_ko: '안녕하세요!',
      }),
      getSession: jest.fn().mockResolvedValue({
        id: 's-restaurant', user_id: 'u1', scenario: 'restaurant',
      }),
      currentSession: jest.fn(),
    };
    const tts: any = { synthesize: jest.fn().mockResolvedValue(Buffer.from([1])) };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 't42');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(sessions.getSession).toHaveBeenCalledWith('s-restaurant');
    expect(sessions.currentSession).not.toHaveBeenCalled();
    expect(tts.synthesize).toHaveBeenCalledWith('안녕하세요!', 'nova');
    expect(ctx.replyWithVoice).toHaveBeenCalledWith({ source: Buffer.from([1]) });
  });

  it('replies "Audio unavailable" when scenario id is unknown', async () => {
    const sessions: any = {
      getTurn: jest.fn().mockResolvedValue({
        id: 't1', session_id: 's1', bot_followup_ko: '안녕',
      }),
      getSession: jest.fn().mockResolvedValue({
        id: 's1', user_id: 'u1', scenario: 'no-such-scenario',
      }),
    };
    const tts: any = { synthesize: jest.fn() };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 't1');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith('Audio unavailable, try again?');
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(ctx.replyWithVoice).not.toHaveBeenCalled();
  });

  it('replies "Audio unavailable" on TTS failure and does not crash', async () => {
    const sessions: any = {
      getTurn: jest.fn().mockResolvedValue({
        id: 't1', session_id: 's1', bot_followup_ko: '안녕',
      }),
      getSession: jest.fn().mockResolvedValue({
        id: 's1', user_id: 'u1', scenario: 'restaurant',
      }),
    };
    const tts: any = { synthesize: jest.fn().mockRejectedValue(new Error('boom')) };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 't1');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith('Audio unavailable, try again?');
    expect(ctx.replyWithVoice).not.toHaveBeenCalled();
  });

  it('answers callback and replies on DB error (getTurn throws)', async () => {
    const sessions: any = {
      getTurn: jest.fn().mockRejectedValue(new Error('DB down')),
      getSession: jest.fn(),
    };
    const tts: any = { synthesize: jest.fn() };
    const handler = new AudioHandler(sessions, tts);
    const ctx = makeCtx();

    await handler.handle(ctx as any, 't1');

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith('Audio unavailable, try again?');
    expect(ctx.replyWithVoice).not.toHaveBeenCalled();
  });
});
