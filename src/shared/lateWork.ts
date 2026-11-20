// Work that finishes later than it starts, and whether its result may still be used. Main, the runner, the renderers and
// the phone page all use these, so nothing here touches Electron, the DOM or Node.

// One request in a series where only the newest counts. `current` is false once a newer one has started, or the owner it
// was started under has ended. `id` can go to another process and come back with its answer, as a menu's id does.
export interface Turn {
  readonly id: number;
  readonly current: boolean;
}

// Latest wins, for each key: `next` starts a turn and makes every earlier one for that key stale, and `end` makes them
// all stale without starting another, as when the account signs out or the recording is thrown away. With no key type,
// `next()` and `end()` take nothing. Work checks `current` after each wait and applies nothing once it's false.
export class Latest<K = void> {
  private count = 0;
  private readonly newest = new Map<K, number>();

  next(key: K): Turn {
    const id = ++this.count;
    const { newest } = this;
    newest.set(key, id);
    return {
      id,
      get current() {
        return newest.get(key) === id;
      },
    };
  }

  end(key: K): void {
    this.newest.delete(key);
  }
}

// One at a time for each key: work run while another for the same key is out starts once that one has settled, whether
// it worked or not, and with nothing out it starts at once. Each run should read what it works on when it starts, since
// the one before it may have changed it. With no key type, `run(work)` takes no key.
export class OneAtATime<K = void> {
  private readonly last = new Map<K, Promise<void>>();

  busy(key: K): boolean {
    return this.last.has(key);
  }

  run<T>(work: () => Promise<T>, key: K): Promise<T> {
    const before = this.last.get(key);
    // Held before the work starts, so work that runs another for the same key before it first waits queues it behind.
    let release = (): void => {};
    const after = new Promise<void>((resolve) => (release = resolve));
    this.last.set(key, after);
    const result = before ? before.then(work) : new Promise<T>((resolve) => resolve(work()));
    const settled = (): void => {
      if (this.last.get(key) === after) this.last.delete(key);
      release();
    };
    void result.then(settled, settled);
    return result;
  }
}

// A claim on work held somewhere else, which lasts only while that place keeps answering. `renew` is for an answer, never
// for a send, and takes when the answered call was sent, since the other side can't have heard it any earlier. So a
// worker that can't be heard stops counting as the owner once `ms` has passed, and stops acting before the other side
// gives the work to someone else. It starts from `from`, when the call that took the work was sent.
export class Lease {
  private heardAt: number;

  constructor(
    private readonly ms: number,
    private readonly now: () => number = Date.now,
    from: number = now(),
  ) {
    this.heardAt = from;
  }

  renew(sentAt: number = this.now()): void {
    this.heardAt = Math.max(this.heardAt, sentAt);
  }

  get live(): boolean {
    return this.now() - this.heardAt < this.ms;
  }
}
