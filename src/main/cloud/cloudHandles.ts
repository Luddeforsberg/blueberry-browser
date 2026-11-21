import { randomUUID } from "node:crypto";
import { KeyRefused, type CloudBrowser, type CloudIds, type CreateHooks, type Handle } from "./cloudProvider";

// What is kept of the cloud's sessions so each can be ended: a handle for every session that may be running, from before
// it's asked for until there's proof it isn't. Proof is the provider confirming it ended or refusing outright to make it.
// A list that doesn't show it never is, since its create may land afterwards. The deadline only says when a handle may
// be forgotten: past it, after one more try at ending it, or at once for another provider's, which nothing here can
// try. It never stops a try, since ending a session that has gone does no harm. A handle is released only through the
// provider and project that made it, and a new key never drops one. Plain Node, like `CloudLife`, which owns one.

const NOT_KEPT = "The cloud settings couldn't be saved, so no cloud session was started.";
// So the file stays small. Every handle in it is kept, so the limit is on asking for more.
const MAX_KEPT = 100;
const TOO_MANY =
  "Too many cloud sessions from before haven't confirmed they ended, so no new one was started. Press End in Settings > Cloud to end them first.";

export interface HandlesHooks {
  // Told each time the ids change, to keep for next time. False if they couldn't be kept.
  onIds?: ((ids: CloudIds) => boolean) | undefined;
  changed: () => void;
}

export class CloudHandles {
  // Tags whose last release wasn't confirmed, and those the provider refused because of the key. Only the ones still
  // kept count, so a late failure never undoes a release that was confirmed.
  private readonly failed = new Set<string>();
  private readonly refused = new Set<string>();
  // Tags of sessions asked for whose answer hasn't come. One may yet appear, so it isn't looked for until then.
  private readonly inFlight = new Set<string>();
  // Releases on their way, by tag, so the same one is never asked twice at once.
  private readonly releasing = new Map<string, Promise<void>>();
  private ids: CloudIds;

  constructor(
    ids: CloudIds,
    // The provider now.
    private readonly browser: () => CloudBrowser | null,
    private readonly hooks: HandlesHooks,
  ) {
    this.ids = this.pruned(ids);
  }

  get current(): CloudIds {
    return this.ids;
  }

  // The handles this provider can end, past their deadline or not. Another's stay saved, untouched, for that one.
  mine(): Handle[] {
    const origin = this.browser()?.origin;
    return origin ? this.ids.handles.filter(({ by }) => by === origin) : [];
  }

  kept(): string[] {
    return this.mine().map(({ tag }) => tag);
  }

  get unreleased(): boolean {
    return this.mine().some(({ tag }) => this.failed.has(tag));
  }

  get keyRefused(): boolean {
    return this.mine().some(({ tag }) => this.refused.has(tag));
  }

  // Whether any of this provider's may still be running and could be ended.
  get endable(): boolean {
    return this.mine().some(({ tag }) => !this.refused.has(tag));
  }

  // Whether a session from `origin` may still be running, which only a browser from there can end.
  keptBy(origin: string): boolean {
    const now = Date.now();
    return this.ids.handles.some(({ by, until }) => by === origin && until > now);
  }

  // Releases still on their way, which Quit waits for.
  get sending(): Promise<void>[] {
    return [...this.releasing.values()];
  }

  // The session to use again: this provider's newest with an id, unless it's being released.
  private get reusable(): string | null {
    const known = this.mine().filter(({ id, tag }) => id !== null && !this.releasing.has(tag));
    return known[known.length - 1]?.id ?? null;
  }

  // False if it couldn't be saved.
  keepContext(contextId: string | null): boolean {
    return this.set({ ...this.ids, contextId });
  }

  // A new provider or key, so what the last one said about its releases no longer holds. Every handle stays.
  reset(contextId: string | null): void {
    this.failed.clear();
    this.refused.clear();
    this.set({ ...this.ids, contextId });
  }

  // Connected to, so it's certainly running, and kept.
  connected(id: string): void {
    const handle = this.ids.handles.find((one) => one.id === id);
    if (handle) this.failed.delete(handle.tag);
  }

  private set(ids: CloudIds): boolean {
    this.ids = this.pruned(ids);
    return this.hooks.onIds?.(this.ids) ?? true;
  }

  // Without another provider's handles that are past their deadline, which only that provider could have tried to end.
  private pruned(ids: CloudIds): CloudIds {
    const origin = this.browser()?.origin;
    const now = Date.now();
    return { ...ids, handles: ids.handles.filter(({ by, until }) => by === origin || until > now) };
  }

  private without(tag: string): void {
    const { handles } = this.ids;
    if (handles.some((one) => one.tag === tag)) this.set({ ...this.ids, handles: handles.filter((one) => one.tag !== tag) });
  }

  // Hooks for one ask of the provider, and what to do once it's answered. Each session's handle is kept before it's
  // asked for, and its id added the moment there is one. Only what records a paid session acts for a life that has
  // ended: a session made for one is released at once, and a Context goes to nothing rather than into a new key's.
  asking(
    browser: CloudBrowser,
    current: () => boolean,
  ): { ids: { contextId: string | null; sessionId: string | null }; hooks: Omit<CreateHooks, "wanted">; answered: () => void } {
    const tags: string[] = [];
    const hooks: Omit<CreateHooks, "wanted"> = {
      tag: (until) => {
        const before = this.ids;
        if (before.handles.length >= MAX_KEPT) throw new Error(TOO_MANY);
        const handle: Handle = { tag: randomUUID(), id: null, by: browser.origin, until };
        if (!this.set({ ...before, handles: [...before.handles, handle] })) {
          this.set(before);
          throw new Error(NOT_KEPT);
        }
        tags.push(handle.tag);
        this.inFlight.add(handle.tag);
        return handle.tag;
      },
      unused: (tag) => {
        if (!tags.includes(tag)) return;
        this.inFlight.delete(tag);
        this.without(tag);
      },
      context: (id) => {
        if (current() && !this.ids.contextId) this.set({ ...this.ids, contextId: id });
      },
      // With the provider's own deadline, once it has said it.
      made: (tag, id, until) => {
        if (!tags.includes(tag)) return;
        this.set({
          ...this.ids,
          handles: this.ids.handles.map((one) => (one.tag === tag ? { ...one, id, until: until ?? one.until } : one)),
        });
        if (!current()) void this.releaseOne(tag);
      },
    };
    const answered = () => {
      tags.forEach((tag) => this.inFlight.delete(tag));
      // One whose answer didn't say its id may still have been made, and is looked for by its tag.
      const unnamed = this.ids.handles.filter(({ tag, id }) => tags.includes(tag) && id === null);
      unnamed.forEach(({ tag }) => void this.releaseOne(tag));
      this.hooks.changed();
    };
    return { ids: { contextId: this.ids.contextId, sessionId: this.reusable }, hooks, answered };
  }

  // Every handle this provider can end that `only` picks, but one whose create is still on its way with no id yet, and
  // any in `skip`.
  releaseKept(skip: Set<string> = new Set(), only: (handle: Handle) => boolean = () => true): Promise<void> {
    const due = this.mine().filter((one) => only(one) && !skip.has(one.tag) && (one.id !== null || !this.inFlight.has(one.tag)));
    return Promise.all(due.map(({ tag }) => this.releaseOne(tag))).then(() => {});
  }

  // Asks the provider to end one session, by its id if it has one and by its tag if not, unless that's on its way
  // already. The handle goes only on proof, and only if it's still kept.
  private releaseOne(tag: string): Promise<void> {
    const known = this.releasing.get(tag);
    if (known) return known;
    const browser = this.browser();
    const handle = this.ids.handles.find((one) => one.tag === tag);
    if (!browser || !handle || handle.by !== browser.origin) return Promise.resolve();
    const { id, until } = handle;
    const asked = id
      ? browser.release(id).then(() => true)
      : browser.releaseTagged(tag).then((found) => found === "ended" || until <= Date.now());
    const sent = asked
      .then(
        (proven) => {
          this.failed.delete(tag);
          this.refused.delete(tag);
          if (proven) this.without(tag);
        },
        (error: unknown) => {
          // Only that it failed, since this runs on the cloud runner too. Settings > Cloud says what to do.
          console.error("Couldn't release the cloud session.");
          this.failed.add(tag);
          if (error instanceof KeyRefused) this.refused.add(tag);
          else this.refused.delete(tag);
          // Past its deadline it has ended anyway.
          if (until <= Date.now()) this.without(tag);
        },
      )
      .finally(() => {
        this.releasing.delete(tag);
        this.hooks.changed();
      });
    this.releasing.set(tag, sent);
    return sent;
  }
}
