import { createShutdownHandler } from '../src/shutdown';

function makeDeps() {
  return {
    bot: { stop: jest.fn() },
    coachTask: { stop: jest.fn() },
    app: { close: jest.fn().mockResolvedValue(undefined) },
    exit: jest.fn(),
  };
}

describe('createShutdownHandler', () => {
  it('stops bot, coach, and server then exits 0', async () => {
    const deps = makeDeps();
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    expect(deps.bot.stop).toHaveBeenCalledWith('SIGTERM');
    expect(deps.coachTask.stop).toHaveBeenCalledTimes(1);
    expect(deps.app.close).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent — a second signal does not stop twice', async () => {
    const deps = makeDeps();
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    await handler('SIGINT');
    expect(deps.bot.stop).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('still exits 0 if a close throws', async () => {
    const deps = makeDeps();
    deps.app.close = jest.fn().mockRejectedValue(new Error('close failed'));
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('attempts coach.stop and app.close even when bot.stop throws (best-effort)', async () => {
    const deps = makeDeps();
    deps.bot.stop = jest.fn(() => { throw new Error('bot boom'); });
    const handler = createShutdownHandler(deps);
    await handler('SIGTERM');
    expect(deps.coachTask.stop).toHaveBeenCalledTimes(1);
    expect(deps.app.close).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
