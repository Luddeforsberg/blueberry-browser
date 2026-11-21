// The runner's look for sessions left from jobs that are over, on a timer of its own, so a long job or an approval wait
// never holds it up. One look at a time, since each waits for the last, and only while linked, since only the server
// can say which jobs are over. A look on its way when the runner is told to stop is waited for, so a session it's about
// to end isn't left running.

// How often it looks, how soon it looks again after a look failed, and how often it asks whether it's linked yet.
const SWEEP_MS = 5 * 60_000;
const RETRY_MS = 30_000;
const UNLINKED_MS = 30_000;

export interface SweepHooks {
  sweep: () => Promise<void>;
  linked: () => boolean;
  stop: AbortSignal;
  sleep: (ms: number) => Promise<unknown>;
}

export class Sweeps {
  private current: Promise<unknown> | null = null;

  constructor(private readonly hooks: SweepHooks) {}

  // The look on its way, if any, settled either way.
  get inFlight(): Promise<unknown> {
    return this.current ?? Promise.resolve();
  }

  async run(): Promise<void> {
    const { sweep, linked, stop, sleep } = this.hooks;
    let failing = false;
    while (!stop.aborted) {
      if (!linked()) {
        await sleep(UNLINKED_MS);
        continue;
      }
      this.current = sweep().then(
        () => true,
        () => false,
      );
      const swept = await this.current;
      this.current = null;
      if (!swept && !failing) console.error("Couldn't end the cloud sessions left from jobs that are over. Trying again.");
      failing = !swept;
      await sleep(swept ? SWEEP_MS : RETRY_MS);
    }
  }
}
