import { randomUUID } from "node:crypto";
import { KeyRefused, type CloudBrowser, type CloudIds, type CreateHooks } from "./cloudProvider";

// What is kept of a cloud session so it can be ended: its id, and the tag of each session asked for whose answer hasn't
// said its id, with the provider that made them. Kept from before a session is asked for until the provider confirms it
// ended, and released only by the provider that made them. Plain Node, like `CloudLife`, which owns one.

export class CloudHandles {
  // Ids and tags whose last release wasn't confirmed, and those the provider refused because of the key. Only the ones
  // still kept count, so a late failure never undoes a release that was confirmed.
  private readonly failed = new Set<string>();
  private readonly refused = new Set<string>();
  // Tags of sessions asked for whose answer hasn't come: a session may yet appear with one, so it isn't let go.
  private readonly inFlight = new Set<string>();
  // Releases on their way, by what they release, so the same one is never asked twice at once.
  private readonly releasing = new Map<string, Promise<void>>();

  constructor(
    private ids: CloudIds,
    // The provider now.
    private readonly browser: () => CloudBrowser | null,
    private readonly hooks: { onIds?: ((ids: CloudIds) => void) | undefined; changed: () => void },
  ) {}

  get current(): CloudIds {
    return this.ids;
  }

  get unreleased(): boolean {
    return this.kept().some((one) => this.failed.has(one));
  }

  get keyRefused(): boolean {
    return this.kept().some((one) => this.refused.has(one));
  }

  // Whether any of this provider's may still be running and could be ended.
  get endable(): boolean {
    return this.kept().some((one) => !this.refused.has(one));
  }

  // Whether another provider's id or tags are kept, which only that one can end.
  get othersKept(): boolean {
    return this.theirs() !== null;
  }

  // Releases still on their way, which Quit waits for.
  get sending(): Promise<void>[] {
    return [...this.releasing.values()];
  }

  // The ids and tags this provider can end. Another's stay saved, untouched, for that one.
  kept(): string[] {
    const browser = this.browser();
    const { sessionId, tags, madeBy } = this.ids;
    if (!browser || (madeBy !== null && madeBy !== browser.name)) return [];
    return [...(sessionId ? [sessionId] : []), ...tags];
  }

  // What another provider made, if anything.
  theirs(): Pick<CloudIds, "sessionId" | "tags" | "madeBy"> | null {
    const { sessionId, tags, madeBy } = this.ids;
    if (madeBy === null || madeBy === this.browser()?.name || (sessionId === null && tags.length === 0)) return null;
    return { sessionId, tags, madeBy };
  }

  set(ids: CloudIds): void {
    const empty = ids.sessionId === null && ids.tags.length === 0;
    this.ids = { ...ids, tags: [...ids.tags], madeBy: empty ? null : ids.madeBy };
    this.hooks.onIds?.(this.ids);
  }

  // A new provider or key, so what the last one said about its releases no longer holds.
  reset(ids: CloudIds): void {
    this.failed.clear();
    this.refused.clear();
    this.set(ids);
  }

  // Connected to, so it's certainly running, and kept.
  connected(id: string): void {
    this.failed.delete(id);
  }

  // Hooks for one ask of the provider, and what to do once it's answered. Each tag is kept before its session is asked
  // for, and each id the moment there is one. Once the id is kept, the tag isn't needed. A session made for a life that
  // has ended is released at once, and its tag kept until that's confirmed.
  asking(
    browser: CloudBrowser,
    current: () => boolean,
  ): { ids: Pick<CloudIds, "contextId" | "sessionId">; hooks: Omit<CreateHooks, "wanted">; answered: () => void } {
    const tags: string[] = [];
    let madeId: string | null = null;
    const { contextId, sessionId } = this.ids;
    const hooks: Omit<CreateHooks, "wanted"> = {
      tag: () => {
        const tag = randomUUID();
        tags.push(tag);
        this.inFlight.add(tag);
        this.set({ ...this.ids, tags: [...this.ids.tags, tag], madeBy: browser.name });
        return tag;
      },
      unused: (tag) => {
        if (!tags.includes(tag)) return;
        tags.splice(tags.indexOf(tag), 1);
        this.inFlight.delete(tag);
        this.set({ ...this.ids, tags: this.ids.tags.filter((one) => one !== tag) });
      },
      context: (id) => {
        if (!this.ids.contextId) this.set({ ...this.ids, contextId: id });
      },
      made: (id) => {
        madeId = id;
        if (current()) this.set({ ...this.ids, sessionId: id, madeBy: browser.name });
        else void this.releaseOne("id", id);
      },
    };
    const answered = () => {
      tags.forEach((tag) => this.inFlight.delete(tag));
      if (madeId !== null && this.ids.sessionId === madeId)
        this.set({ ...this.ids, tags: this.ids.tags.filter((tag) => !tags.includes(tag)) });
      else tags.forEach((tag) => void this.releaseOne("tag", tag));
      this.hooks.changed();
    };
    // Another provider's session is never reused, or replaced, here.
    return { ids: { contextId, sessionId: this.othersKept ? null : sessionId }, hooks, answered };
  }

  // Every id and tag this provider can end, but a tag whose answer is still on its way, and any in `skip`.
  releaseKept(skip: Set<string> = new Set()): Promise<void> {
    const { sessionId, tags } = this.ids;
    const kept = new Set(this.kept());
    const work = [
      ...(sessionId && kept.has(sessionId) && !skip.has(sessionId) ? [this.releaseOne("id", sessionId)] : []),
      ...tags.filter((tag) => kept.has(tag) && !skip.has(tag) && !this.inFlight.has(tag)).map((tag) => this.releaseOne("tag", tag)),
    ];
    return Promise.all(work).then(() => {});
  }

  // Asks the provider to end one session by its id, or every session with that tag, unless that's on its way already.
  // It's let go of only once the provider has confirmed, and only if it's still kept, so a session kept meanwhile keeps
  // its own.
  private releaseOne(kind: "id" | "tag", value: string): Promise<void> {
    const key = `${kind} ${value}`;
    const known = this.releasing.get(key);
    if (known) return known;
    const browser = this.browser();
    if (!browser) return Promise.resolve();
    const sent = (kind === "id" ? browser.release(value) : browser.releaseTagged(value))
      .then(
        () => {
          this.failed.delete(value);
          this.refused.delete(value);
          const { sessionId, tags } = this.ids;
          if (kind === "id" && sessionId === value) this.set({ ...this.ids, sessionId: null });
          if (kind === "tag" && tags.includes(value)) this.set({ ...this.ids, tags: tags.filter((tag) => tag !== value) });
        },
        (error: unknown) => {
          // Only that it failed, since this runs on the cloud runner too. Settings > Cloud says what to do.
          console.error("Couldn't release the cloud session.");
          this.failed.add(value);
          if (error instanceof KeyRefused) this.refused.add(value);
          else this.refused.delete(value);
        },
      )
      .finally(() => {
        this.releasing.delete(key);
        this.hooks.changed();
      });
    this.releasing.set(key, sent);
    return sent;
  }
}
