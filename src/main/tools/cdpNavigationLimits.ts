import type { CDPSession } from "playwright-core";

// Where a page reached over CDP may go while a limit is on, held with the `Fetch` domain, and what was refused.

export class CdpNavigationLimits {
  private readonly navigationLimits = new Set<(url: string) => boolean>();
  readonly refusalListeners = new Set<Set<string>>();
  private fetching: Promise<unknown> = Promise.resolve();

  constructor(private readonly session: CDPSession) {}

  refusesNavigation(url: string): boolean {
    return [...this.navigationLimits].some((allows) => !allows(url));
  }

  // For a navigation this tab caused somewhere it can't intercept itself, such as a popup it opened. True if a limit on
  // now refuses it, which every call holding a limit hears about.
  refuse(url: string): boolean {
    if (!this.refusesNavigation(url)) return false;
    this.refusalListeners.forEach((listener) => listener.add(url));
    return true;
  }

  // Only while a limit is on does every new document wait to be checked, so a page with no limit loads as fast as any.
  // A guard is only as good as Chromium taking it, so `act` runs only once it has, and this rejects without acting if
  // it didn't.
  async withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    const limit = (url: string) => allows(url);
    const refused = new Set<string>();
    this.navigationLimits.add(limit);
    this.refusalListeners.add(refused);
    try {
      await this.setFetching();
      const result = await act();
      return { result, refused: [...refused] };
    } finally {
      this.navigationLimits.delete(limit);
      this.refusalListeners.delete(refused);
      // Left on, each new document only waits for the listener, which lets it through with no limit to hold it.
      await this.setFetching().catch(() => {});
    }
  }

  // One change at a time, in order. The next goes ahead however this one went, and the caller hears how it went.
  private setFetching(): Promise<unknown> {
    const on = this.navigationLimits.size > 0;
    const change = this.fetching.then(() =>
      on
        ? this.session.send("Fetch.enable", { patterns: [{ urlPattern: "*", resourceType: "Document", requestStage: "Request" }] })
        : this.session.send("Fetch.disable"),
    );
    this.fetching = change.catch(() => {});
    return change;
  }
}
