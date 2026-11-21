import { randomUUID } from "node:crypto";
import { KeyRefused, type CloudBrowser, type CloudIds, type CreateHooks, type Handle } from "./cloudProvider";

// What is kept of the cloud's sessions so each can be ended: a handle for every session that may be running, from before
// it's asked for until there's proof it isn't. Proof is the provider confirming it ended or refusing outright to make it.
// A list that doesn't show it never is, since its create may land afterwards, and a release that failed never is. The
// deadline only says when a handle may be forgotten: once it's further past than any session lasts, so a clock that's
// wrong by less than that loses nothing. It never stops a try, since ending a session that has gone does no harm. A
// handle is released only through the provider and project that made it: with the key it was made with, and then with
// the key now if that's for the same project, so a new key never drops one or waits for one, and neither does another
// project's Context. Plain Node, like `CloudLife`, which owns one.

const NOT_KEPT = "The cloud settings couldn't be saved, so no cloud session was started.";
// So the file stays small. Every handle in it is kept, so the limit is on asking for more.
const MAX_KEPT = 100;
// How far past its deadline a handle is kept: Browserbase's longest session, six hours, which covers any clock that's
// that much ahead.
const FORGET_AFTER_MS = 6 * 60 * 60_000;
const TOO_MANY =
  "Too many cloud sessions from before haven't confirmed they ended, so no new one was started. Press End in Settings > Cloud to end them first.";

export interface HandlesHooks {
  // Told each time the ids change, to keep for next time. False if they couldn't be kept.
  onIds?: ((ids: CloudIds) => boolean) | undefined;
  // The browser for the key a handle was made with, by its `keyId`, or null where that key isn't kept or can't be opened.
  browserFor?: ((handle: Handle) => CloudBrowser | null) | undefined;
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

  // This provider's Context.
  get contextId(): string | null {
    const origin = this.browser()?.origin;
    return origin ? (this.ids.contexts[origin] ?? null) : null;
  }

  // The handles something here can end, past their deadline or not. The rest stay saved, untouched, for a key that can.
  mine(): Handle[] {
    return this.ids.handles.filter((handle) => this.endersOf(handle).length > 0);
  }

  // What can end a handle, in order: its own key's browser, then the browser now if it's for the same provider and
  // project, since a project's sessions can be ended with any of its keys.
  private endersOf(handle: Handle): CloudBrowser[] {
    const now = this.browser();
    const same = now && now.origin === handle.by ? now : null;
    const own = handle.keyId !== null && handle.keyId !== now?.keyId ? (this.hooks.browserFor?.(handle) ?? null) : null;
    return [own?.origin === handle.by ? own : null, same].filter((one): one is CloudBrowser => one !== null);
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

  // Releases still on their way, which Quit waits for.
  get sending(): Promise<void>[] {
    return [...this.releasing.values()];
  }

  // The session to use again: the newest with an id from this provider and project, unless it's being released.
  private get reusable(): string | null {
    const origin = this.browser()?.origin;
    const known = this.ids.handles.filter(({ id, tag, by }) => by === origin && id !== null && !this.releasing.has(tag));
    return known[known.length - 1]?.id ?? null;
  }

  // Whether the browser now could use this one again, rather than its having to be ended.
  usable(handle: Handle): boolean {
    return handle.by === this.browser()?.origin;
  }

  // Gives the handles `pick` picks the key `keyId` names, so they end with it.
  giveKey(pick: (handle: Handle) => boolean, keyId: string): boolean {
    if (!this.ids.handles.some(pick)) return true;
    return this.set({ ...this.ids, handles: this.ids.handles.map((handle) => (pick(handle) ? { ...handle, keyId } : handle)) });
  }

  // Adds what the files hold that this doesn't, as a launch would read it: each handle not kept already, and the Context
  // of a project with none here.
  take({ contexts, handles }: CloudIds): boolean {
    const [tags, ids] = [new Set(this.ids.handles.map(({ tag }) => tag)), new Set(this.ids.handles.map(({ id }) => id))];
    const added = handles.filter(({ tag, id }) => !tags.has(tag) && (id === null || !ids.has(id)));
    return this.set({ contexts: { ...contexts, ...this.ids.contexts }, handles: [...this.ids.handles, ...added] });
  }

  // Forgets the handles `pick` picks, on the user's word alone, since nothing else may drop one without proof.
  letGoOf(pick: (handle: Handle) => boolean): boolean {
    return this.set({ ...this.ids, handles: this.ids.handles.filter((handle) => !pick(handle) || this.releasing.has(handle.tag)) });
  }

  // A new provider or key, so what the last one said about its releases no longer holds. Every handle and Context stays.
  reset(): void {
    this.failed.clear();
    this.refused.clear();
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

  // Without the handles further past their deadline than any session lasts.
  private pruned(ids: CloudIds): CloudIds {
    const now = Date.now();
    return { ...ids, handles: ids.handles.filter(({ until }) => until + FORGET_AFTER_MS > now) };
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
        const before = this.pruned(this.ids);
        if (before.handles.length >= MAX_KEPT) throw new Error(TOO_MANY);
        const handle: Handle = { tag: randomUUID(), id: null, by: browser.origin, keyId: browser.keyId ?? null, until };
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
        const { contexts } = this.ids;
        if (current() && !contexts[browser.origin]) this.set({ ...this.ids, contexts: { ...contexts, [browser.origin]: id } });
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
    return { ids: { contextId: this.ids.contexts[browser.origin] ?? null, sessionId: this.reusable }, hooks, answered };
  }

  // Every handle this provider can end that `only` picks, but one whose create is still on its way with no id yet, and
  // any in `skip`.
  releaseKept(skip: Set<string> = new Set(), only: (handle: Handle) => boolean = () => true): Promise<void> {
    const due = this.mine().filter((one) => only(one) && !skip.has(one.tag) && (one.id !== null || !this.inFlight.has(one.tag)));
    return Promise.all(due.map(({ tag }) => this.releaseOne(tag))).then(() => {});
  }

  // Asks the provider to end one session, by its id if it has one and by its tag if not, unless that's on its way
  // already: with its own key, and with the key now if the provider no longer takes that one. The handle goes only on
  // proof, and only if it's still kept.
  private releaseOne(tag: string): Promise<void> {
    const known = this.releasing.get(tag);
    if (known) return known;
    const handle = this.ids.handles.find((one) => one.tag === tag);
    const [first, ...rest] = handle ? this.endersOf(handle) : [];
    if (!handle || !first) return Promise.resolve();
    const { id } = handle;
    const ask = (browser: CloudBrowser) =>
      id ? browser.release(id).then(() => true) : browser.releaseTagged(tag).then((found) => found === "ended");
    const asked = rest.reduce<Promise<boolean>>(
      (tried, next) =>
        tried.catch((error: unknown) => {
          if (error instanceof KeyRefused) return ask(next);
          throw error;
        }),
      ask(first),
    );
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
