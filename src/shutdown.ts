export interface ShutdownDeps {
  bot: { stop(reason: string): void | Promise<void> };
  coachTask: { stop(): void };
  app: { close(): Promise<void> };
  exit?: (code: number) => void;
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
    try {
      await deps.bot.stop(signal);
      deps.coachTask.stop();
      await deps.app.close();
    } catch (e: any) {
      console.error(`[shutdown] error during stop: ${e.message}`);
    } finally {
      exit(0);
    }
  };
}
