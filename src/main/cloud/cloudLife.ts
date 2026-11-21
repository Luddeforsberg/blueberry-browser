import type { BrowserContext } from "playwright-core";
import { Latest, OneAtATime, type Turn } from "../../shared/lateWork";
import { KeyRefused, type CloudBrowser, type CloudIds, type CloudSession, type MadeSession, type Released } from "./cloudProvider";

// A cloud session's life, from the provider making it to the provider confirming it ended, for as long as the app or the
// runner's job runs. Everything that starts or ends a session, or changes the key, is a step in one queue, so each reads
// what the one before it left. Connecting happens outside the queue, so an ending never waits for it: it releases the
// session by its id at once, and a connection that arrives afterwards is closed. `CloudSessions` adds who uses it.

export type CloudStatus = "idle" | "starting" | "running" | "ended";

export interface CloudLifeHooks {
  onChange?: () => void;
  // Told each time the ids change, to keep for next time.
  onIds?: (ids: CloudIds) => void;
}

const IDLE_MS = 3 * 60_000;
export const ENDED_MEANWHILE = "The cloud browser ended meanwhile.";

const message = (error: unknown, otherwise: string): string => (error instanceof Error && error.message) || otherwise;

export abstract class CloudLife {
  private readonly steps = new OneAtATime();
  // One for each session's life. An ending starts the next, so whatever was on its way for the last one finds it stale.
  private readonly lives = new Latest();
  protected life: Turn = this.lives.next();
  protected session: CloudSession | null = null;
  private connecting: Promise<CloudSession> | null = null;
  // Endings queued or running. Nothing new starts or claims it until they're done.
  private ending = 0;
  private closed = false;
  private _status: CloudStatus = "idle";
  private _problem: string | null = null;
  // The last release wasn't confirmed, so a paid session may still be running, and whether that was the key refused.
  private _unreleased = false;
  private _keyRefused = false;
  // A session nobody is using still costs, so it ends a while after the last one lets go: armed for one life only.
  private idle: { timer: ReturnType<typeof setTimeout>; life: Turn } | null = null;
  // Connections on their way closed, which Quit waits for, since closing a local browser is what ends it.
  private readonly closing = new Set<Promise<void>>();

  constructor(
    private browser: CloudBrowser | null,
    private ids: CloudIds,
    private readonly hooks: CloudLifeHooks,
    private readonly idleMs = IDLE_MS,
  ) {}

  // Whether a job or the user is using it.
  protected abstract inUse(): boolean;
  // An ending: no pages, no job, no user.
  protected abstract dropAll(): void;
  // The connection went, and its pages with it.
  protected abstract dropPages(): void;
  // Anything a new connection needs before it's used.
  protected abstract prepare(context: BrowserContext): Promise<void>;

  get status(): CloudStatus {
    return this._status;
  }

  get problem(): string | null {
    return this._problem;
  }

  get unreleased(): boolean {
    return this._unreleased;
  }

  get keyRefused(): boolean {
    return this._unreleased && this._keyRefused;
  }

  // Whether End has anything to end, here or at the provider.
  get canEnd(): boolean {
    return this.session !== null || this.connecting !== null || this.ids.sessionId !== null || this._unreleased;
  }

  get provider(): CloudBrowser["name"] | null {
    return this.browser?.name ?? null;
  }

  get contextId(): string | null {
    return this.ids.contextId;
  }

  // Whether it will end on its own once the idle time is up.
  get winding(): boolean {
    return this.idle !== null;
  }

  // Why nothing may start or claim it now, if anything.
  protected get refusal(): string | null {
    if (this.closed) return "Blueberry is quitting.";
    if (!this.browser) return "The cloud browser is off.";
    if (this.ending > 0) return "The cloud browser is ending. Try again in a moment.";
    return null;
  }

  // The one rule for winding down: anything that may be running, with nobody using it, ends once the idle time is up.
  // A timer belongs to the life it was armed in, so it never ends one that came after.
  protected settle(): void {
    const something = this.session !== null || this.connecting !== null || (this.ids.sessionId !== null && !this.keyRefused);
    if (this.inUse() || !something || this.refusal) {
      this.stopIdle();
      return;
    }
    if (this.idle?.life === this.life) return;
    this.stopIdle();
    const life = this.life;
    const timer = setTimeout(() => {
      this.idle = null;
      if (life.current && !this.inUse()) void this.end(life);
    }, this.idleMs);
    this.idle = { life, timer };
  }

  private stopIdle(): void {
    if (this.idle) clearTimeout(this.idle.timer);
    this.idle = null;
  }

  protected changed(): void {
    this.hooks.onChange?.();
  }

  protected settled(): void {
    this.settle();
    this.changed();
  }

  private setIds(ids: CloudIds): void {
    this.ids = { ...ids };
    this.hooks.onIds?.(this.ids);
  }

  protected async ensure(): Promise<CloudSession> {
    const refusal = this.refusal;
    if (refusal) throw new Error(refusal);
    if (this.session) return this.session;
    const { connecting } = await this.steps.run(() => this.startStep());
    return connecting;
  }

  // In the queue: asks the provider for the session, and keeps its id the moment there is one. The connection is made
  // after the step, so the next ending doesn't wait for it. Wrapped, so the queue doesn't wait for it either.
  private async startStep(): Promise<{ connecting: Promise<CloudSession> }> {
    if (this.session) return { connecting: Promise.resolve(this.session) };
    if (this.connecting) return { connecting: this.connecting };
    const { browser, refusal, life } = this;
    if (refusal || !browser) throw new Error(refusal ?? "The cloud browser is off.");
    this._status = "starting";
    this._problem = null;
    this.changed();
    let made: MadeSession;
    try {
      made = await browser.create(
        this.ids,
        (ids) => this.setIds(ids),
        () => this.refusal === null,
      );
    } catch (error) {
      const problem = message(error, "The cloud browser couldn't start.");
      // A session may have been made before it failed. An ending since then releases it, and otherwise nothing would.
      if (life.current) {
        this._status = "idle";
        await this.releaseSaved();
        this._problem ??= problem;
      }
      this.settled();
      throw new Error(problem);
    }
    // Ended while it was asked for: its id is saved, and the ending's step releases it.
    if (!life.current) return { connecting: Promise.reject(new Error(ENDED_MEANWHILE)) };
    const connecting = this.connect(made, life);
    this.connecting = connecting;
    this.settle();
    return { connecting };
  }

  private async connect(made: MadeSession, life: Turn): Promise<CloudSession> {
    let session: CloudSession | null = null;
    try {
      session = await made.connect();
      if (life.current) await this.prepare(session.context);
    } catch (error) {
      if (session) this.closeLater(session);
      if (!life.current) throw new Error(ENDED_MEANWHILE);
      this.connecting = null;
      this._status = "idle";
      const problem = message(error, "The cloud browser couldn't start.");
      this._problem = problem;
      // It may be running at the provider with nothing connected, and nothing else would end it.
      if (made.id) void this.steps.run(() => this.releaseSaved().then(() => this.settled()));
      this.settled();
      throw new Error(problem);
    }
    if (!life.current) {
      this.closeLater(session);
      throw new Error(ENDED_MEANWHILE);
    }
    const connected = session;
    this.session = connected;
    this.connecting = null;
    this._status = "running";
    connected.context.browser()?.on("disconnected", () => this.lost(connected));
    this.settled();
    return connected;
  }

  // Closed without waiting, and Quit waits for it.
  private closeLater(session: CloudSession): void {
    const closing = session.close().catch(() => {});
    this.closing.add(closing);
    void closing.then(() => this.closing.delete(closing));
  }

  // The connection went. A kept-alive session can still be running at the provider, and ends there once idle.
  private lost(session: CloudSession): void {
    if (this.session !== session) return;
    this.session = null;
    this._status = "idle";
    this.dropPages();
    this.settled();
  }

  // Everything goes, at once: the connection, the pages, the job's claim, the user's, and anything still on its way for
  // this life. The release for the saved id goes out at once too. The rest is a step, queued after whatever step is
  // running, which may make a session this ending has to release as well. Nothing new starts or claims it until it's
  // done. `only` is the idle timer's life, which ends nothing that came after it.
  end(only?: Turn): Promise<Released> {
    if (only && !only.current) return Promise.resolve("ended");
    return this.ended((released) => released());
  }

  // A new key, or none, as one ending: the session it may be running on ends first, then `decide` says what's next from
  // how that went, or null to keep everything. A session id kept for the new key is ended with it.
  replace(decide: (released: Released) => { browser: CloudBrowser | null; ids: CloudIds } | null): Promise<Released> {
    return this.ended(async (released) => {
      const before = await released();
      const next = decide(before);
      if (!next) return before;
      this.browser = next.browser;
      this._unreleased = false;
      this.setIds(next.ids);
      return next.ids.sessionId ? this.releaseSaved() : before;
    });
  }

  // Quit: the last ending, and the connections still closing. Nothing starts or claims it after this.
  async quit(): Promise<void> {
    this.closed = true;
    await this.end();
    await Promise.allSettled([...this.closing]);
  }

  // `step` runs in the queue, and `released` says how this ending's release went, releasing a session saved since.
  private ended(step: (released: () => Promise<Released>) => Promise<Released>): Promise<Released> {
    this.ending++;
    this.stopIdle();
    this.life = this.lives.next();
    const { session } = this;
    this.session = null;
    this.connecting = null;
    this.dropAll();
    this._status = "ended";
    // The release goes out before the connection is closed, and neither waits for the other, or for the step running.
    const id = this.ids.sessionId;
    const now = this.releaseSaved();
    if (session) this.closeLater(session);
    this.changed();
    // A step before this one may have saved a new session, which this ending releases too.
    const released = async (): Promise<Released> => {
      const first = await now;
      return this.ids.sessionId && this.ids.sessionId !== id ? this.releaseSaved() : first;
    };
    return this.steps.run(async () => {
      try {
        return await step(released);
      } finally {
        this.ending--;
        this.settled();
      }
    });
  }

  // Whatever is saved now, unless the provider has confirmed it already.
  private releaseSaved(): Promise<Released> {
    return this.ids.sessionId ? this.releaseId(this.ids.sessionId) : Promise.resolve("ended");
  }

  // The saved id is cleared only once the provider has confirmed, and only if it's still this one, so a session made
  // meanwhile keeps its own.
  private async releaseId(id: string): Promise<Released> {
    if (!this.browser) return "ended";
    try {
      await this.browser.release(id);
      if (this.ids.sessionId === id) this.setIds({ ...this.ids, sessionId: null });
      this._unreleased = false;
      this._problem = null;
      return "ended";
    } catch (error) {
      // Only that it failed, since this runs on the cloud runner too. Settings > Cloud says what to do.
      console.error("Couldn't release the cloud session.");
      this._unreleased = true;
      this._keyRefused = error instanceof KeyRefused;
      this._problem = "The cloud session may still be running, and costing, because the provider didn't confirm it ended. Try again.";
      return this._keyRefused ? "refused" : "running";
    }
  }
}
