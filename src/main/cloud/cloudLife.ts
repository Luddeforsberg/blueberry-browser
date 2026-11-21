import type { BrowserContext } from "playwright-core";
import { Latest, OneAtATime, type Turn } from "../../shared/lateWork";
import { CloudHandles } from "./cloudHandles";
import type { CloudBrowser, CloudIds, CloudSession, Handle, MadeSession, Released } from "./cloudProvider";

// A cloud session's life, from the provider making it to the provider confirming it ended, for as long as the app or the
// runner's job runs. Everything that starts or ends a session, or changes the key, is a step in one queue, so each reads
// what the one before it left. Neither asking for a session nor connecting to it holds the queue once an ending comes:
// the ending releases what is kept of it at once, by its id or the tag it was asked for with, and whatever arrives for
// it afterwards is released or closed. What is kept of it is `CloudHandles`', and `CloudSessions` adds who uses it.

export type CloudStatus = "idle" | "starting" | "running" | "ended";

export interface CloudLifeHooks {
  onChange?: () => void;
  // Told each time the ids change, to keep for next time. False if they couldn't be kept.
  onIds?: (ids: CloudIds) => boolean;
  // The browser for the key a handle was made with, where that isn't the key now.
  browserFor?: (handle: Handle) => CloudBrowser | null;
}

const IDLE_MS = 3 * 60_000;
export const ENDED_MEANWHILE = "The cloud browser ended meanwhile.";
const OFF = "The cloud browser is off.";
const COULDNT_START = "The cloud browser couldn't start.";
const UNRELEASED = "The cloud session may still be running, and costing, because the provider didn't confirm it ended. Try again.";

const message = (error: unknown, otherwise: string): string => (error instanceof Error && error.message) || otherwise;

// How asking the provider for a session went.
type Asked = { made: MadeSession } | { error: unknown };

// Settles when a life ends, so a step waiting on the provider for that life can stop waiting.
const lifeEnd = () => {
  let end = () => {};
  const ended = new Promise<"ended">((resolve) => (end = () => resolve("ended")));
  return { ended, end };
};

export abstract class CloudLife {
  private readonly steps = new OneAtATime();
  // One for each session's life. An ending starts the next, so whatever was on its way for the last one finds it stale.
  private readonly lives = new Latest();
  protected life: Turn = this.lives.next();
  private ends = lifeEnd();
  // Aborts as its life ends, so a browser still starting for it is stopped.
  private stops = new AbortController();
  protected session: CloudSession | null = null;
  private connecting: Promise<CloudSession> | null = null;
  // Endings queued or running. Nothing new starts or claims it until they're done.
  private ending = 0;
  private closed = false;
  private _status: CloudStatus = "idle";
  // Why it last couldn't start.
  private _problem: string | null = null;
  // A session nobody is using still costs, so it ends a while after the last one lets go: armed for one life only.
  private idle: { timer: ReturnType<typeof setTimeout>; life: Turn } | null = null;
  // Asks of the provider and connections still on their way, and connections closing, which Quit waits for, since
  // closing a local browser is what ends it.
  private readonly asking = new Set<Promise<unknown>>();
  private readonly starting = new Set<Promise<unknown>>();
  private readonly closing = new Set<Promise<unknown>>();
  // Connections made and not yet in use, as while they're prepared. An ending closes them at once.
  private readonly opened = new Set<CloudSession>();
  // Who the provider is now. A new key or none is a new one, so work confirmed for the last one can tell.
  private _account: object = {};
  private readonly handles: CloudHandles;

  constructor(
    private browser: CloudBrowser | null,
    ids: CloudIds,
    private readonly hooks: CloudLifeHooks,
    private readonly idleMs = IDLE_MS,
  ) {
    this.handles = new CloudHandles(ids, () => this.browser, {
      onIds: hooks.onIds,
      browserFor: hooks.browserFor,
      changed: () => this.changed(),
    });
  }

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
    return this.unreleased ? UNRELEASED : this._problem;
  }

  get unreleased(): boolean {
    return this.handles.unreleased;
  }

  get keyRefused(): boolean {
    return this.handles.keyRefused;
  }

  // Whether End has anything to end, here or at the provider.
  get canEnd(): boolean {
    return this.session !== null || this.connecting !== null || this.handles.kept().length > 0;
  }

  get provider(): CloudBrowser["name"] | null {
    return this.browser?.name ?? null;
  }

  get contextId(): string | null {
    return this.handles.contextId;
  }

  get account(): object {
    return this._account;
  }

  // Which sessions the provider now can end, if there is one.
  get origin(): string | null {
    return this.browser?.origin ?? null;
  }

  // Whether it will end on its own once the idle time is up.
  get winding(): boolean {
    return this.idle !== null;
  }

  // Why nothing may start or claim it now, if anything.
  protected get refusal(): string | null {
    if (this.closed) return "Blueberry is quitting.";
    if (!this.browser) return OFF;
    if (this.ending > 0) return "The cloud browser is ending. Try again in a moment.";
    return null;
  }

  // The one rule for winding down: anything that may be running, with nobody using it, ends once the idle time is up,
  // with no key now too, since each handle has its own. A timer belongs to the life it was armed in, so it never ends one
  // that came after.
  protected settle(): void {
    const something = this.session !== null || this.connecting !== null || this.handles.endable;
    if (this.inUse() || !something || this.closed || this.ending > 0) {
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

  // Sessions left from last time with only a tag, no id, or that the key now can't use again, are looked for and ended
  // as soon as it starts. One it could use is ended by the idle rule, unless something uses it first.
  protected recover(): void {
    const unused = (handle: Handle) => handle.id === null || !this.handles.usable(handle);
    if (this.handles.mine().some(unused)) void this.steps.run(() => this.releaseKept(unused));
  }

  // What's kept: every handle and Context, as the file should have them.
  get ids(): CloudIds {
    return this.handles.current;
  }

  // Adds what the files hold that isn't kept here, as when they're read again. False if that couldn't be kept.
  take(ids: CloudIds): boolean {
    const kept = this.handles.take(ids);
    this.settled();
    return kept;
  }

  // Gives the handles `pick` picks the key `keyId` names, as for those of a project whose own key can't be opened, once
  // a key for that project is saved. False if that couldn't be kept.
  giveKey(pick: (handle: Handle) => boolean, keyId: string): boolean {
    return this.handles.giveKey(pick, keyId);
  }

  // Forgets the handles `pick` picks, on the user's word alone. False if that couldn't be kept.
  letGoOf(pick: (handle: Handle) => boolean): boolean {
    const kept = this.handles.letGoOf(pick);
    this.settled();
    return kept;
  }

  protected async ensure(): Promise<CloudSession> {
    const refusal = this.refusal;
    if (refusal) throw new Error(refusal);
    if (this.session) return this.session;
    const { connecting } = await this.steps.run(() => this.startStep());
    return connecting;
  }

  // In the queue: asks the provider for the session. The connection is made after the step, so the next ending doesn't
  // wait for it, and an ending stops this step waiting on the provider too. Wrapped, so the queue doesn't wait for it.
  private async startStep(): Promise<{ connecting: Promise<CloudSession> }> {
    if (this.session) return { connecting: Promise.resolve(this.session) };
    if (this.connecting) return { connecting: this.connecting };
    const { browser, refusal, life, ends, stops } = this;
    if (refusal || !browser) throw new Error(refusal ?? OFF);
    this._status = "starting";
    this._problem = null;
    this.changed();
    const asked = await Promise.race([this.ask(browser, life), ends.ended]);
    if (asked === "ended" || !life.current) return { connecting: Promise.reject(new Error(ENDED_MEANWHILE)) };
    if ("error" in asked) {
      this._status = "idle";
      // A session may have been made before it failed, and nothing else would end it.
      await this.handles.releaseKept();
      this._problem = message(asked.error, COULDNT_START);
      this.settled();
      throw new Error(this._problem);
    }
    const connecting = this.connect(asked.made, life, stops.signal);
    this.connecting = connecting;
    this.settle();
    return { connecting };
  }

  // Asks the provider for a session, keeping what it says of it as it says it, in `CloudHandles`.
  private ask(browser: CloudBrowser, life: Turn): Promise<Asked> {
    const { ids, hooks, answered } = this.handles.asking(browser, () => life.current);
    const done = browser
      .create(ids, { ...hooks, wanted: () => life.current && this.refusal === null })
      .then(
        (made): Asked => ({ made }),
        (error: unknown): Asked => ({ error }),
      )
      .then((result) => {
        answered();
        return result;
      });
    this.track(this.asking, done);
    return done;
  }

  private track(set: Set<Promise<unknown>>, work: Promise<unknown>): void {
    const settled = work.catch(() => {});
    set.add(settled);
    void settled.then(() => set.delete(settled));
  }

  private async connect(made: MadeSession, life: Turn, stop: AbortSignal): Promise<CloudSession> {
    const connecting = made.connect(stop);
    this.track(this.starting, connecting);
    let session: CloudSession | null = null;
    try {
      session = await connecting;
      this.opened.add(session);
      if (life.current) await this.prepare(session.context);
    } catch (error) {
      if (session) this.abandon(session);
      if (!life.current) throw new Error(ENDED_MEANWHILE);
      this.connecting = null;
      this._status = "idle";
      this._problem = message(error, COULDNT_START);
      // It may be running at the provider with nothing connected, and nothing else would end it.
      if (made.id) void this.steps.run(() => this.releaseKept());
      this.settled();
      throw new Error(this._problem);
    }
    if (!life.current) {
      this.abandon(session);
      throw new Error(ENDED_MEANWHILE);
    }
    this.opened.delete(session);
    const connected = session;
    this.session = connected;
    this.connecting = null;
    this._status = "running";
    if (made.id) this.handles.connected(made.id);
    connected.context.browser()?.on("disconnected", () => this.lost(connected));
    this.settled();
    return connected;
  }

  // Closed without waiting, and Quit waits for it.
  private closeLater(session: CloudSession): void {
    this.track(this.closing, session.close());
  }

  // A connection that won't be used, closed once, by whichever of its ending or its own failure comes first.
  private abandon(session: CloudSession): void {
    if (this.opened.delete(session)) this.closeLater(session);
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
  // this life. Releases for what is kept go out at once too. The rest is a step, queued after whatever step is running,
  // which may have kept something more, released then. Nothing new starts or claims it until it's done. `only` is the
  // idle timer's life, which ends nothing that came after it.
  end(only?: Turn): Promise<Released> {
    if (only && !only.current) return Promise.resolve("ended");
    return this.ended(async () => this.outcome());
  }

  // A new key, or none, as one ending: the session it may be running on ends first, then `decide` says what's next from
  // how that went, or null to keep everything. Every handle stays, for whichever provider and project can end it.
  replace(decide: (released: Released) => { browser: CloudBrowser | null } | null): Promise<Released> {
    return this.ended(async () => {
      const before = this.outcome();
      const next = decide(before);
      if (!next) return before;
      this.browser = next.browser;
      this._account = {};
      // A new key may be another project, whose own Context it then uses.
      this.handles.reset();
      await this.handles.releaseKept();
      return this.outcome();
    });
  }

  // Quit: the last ending, then whatever was still on its way, which is released or closed as it arrives.
  async quit(): Promise<Released> {
    this.closed = true;
    await this.end();
    await Promise.allSettled([...this.asking, ...this.starting]);
    await Promise.allSettled(this.handles.sending);
    await Promise.allSettled([...this.closing]);
    return this.outcome();
  }

  private outcome(): Released {
    if (this.handles.kept().length === 0) return "ended";
    return this.keyRefused ? "refused" : "running";
  }

  private ended(step: () => Promise<Released>): Promise<Released> {
    this.ending++;
    this.stopIdle();
    this.ends.end();
    this.ends = lifeEnd();
    this.stops.abort();
    this.stops = new AbortController();
    [...this.opened].forEach((one) => this.abandon(one));
    this.life = this.lives.next();
    const { session } = this;
    this.session = null;
    this.connecting = null;
    this.dropAll();
    this._status = "ended";
    // The releases go out before the connection is closed, and neither waits for the other, or for the step running.
    const sent = new Set(this.handles.kept());
    const now = this.handles.releaseKept();
    if (session) this.closeLater(session);
    this.changed();
    return this.steps.run(async () => {
      try {
        await now;
        // Anything a step before this one kept since.
        await this.handles.releaseKept(sent);
        return await step();
      } finally {
        this.ending--;
        this.settled();
      }
    });
  }

  // A step: releases what's kept, or only what `only` picks, then winds down as the rule says.
  private releaseKept(only?: (handle: Handle) => boolean): Promise<void> {
    return this.handles.releaseKept(new Set(), only).then(() => this.settled());
  }
}
