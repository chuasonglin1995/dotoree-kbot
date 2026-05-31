export interface ShutdownDeps {
  bot: { stop(reason: string): void | Promise<void> };
  coachTask: { stop(): void };
  app: { close(): Promise<void> };
  exit?: (code: number) => void;
}

async function attempt(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[shutdown] error stopping ${label}:`, e);
  }
}

export function createShutdownHandler(
  deps: ShutdownDeps,
): (signal: string) => Promise<void> {
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;
  return async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, stopping...`);
    // Best-effort: attempt all three independently so one failure can't
    // prevent the others (e.g. a bot.stop error must not skip the poll-offset
    // flush or the server close).
    await attempt('bot', () => deps.bot.stop(signal));
    await attempt('coach scheduler', () => deps.coachTask.stop());
    await attempt('server', () => deps.app.close());
    exit(0);
  };
}
