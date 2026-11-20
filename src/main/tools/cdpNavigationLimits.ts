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
  async withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    const limit = (url: string) => allows(url);
    const refused = new Set<string>();
    this.navigationLimits.add(limit);
    this.refusalListeners.add(refused);
    await this.setFetching();
    try {
      const result = await act();
      return { result, refused: [...refused] };
    } finally {
      this.navigationLimits.delete(limit);
      this.refusalListeners.delete(refused);
      await this.setFetching();
    }
  }

  private setFetching(): Promise<unknown> {
    const on = this.navigationLimits.size > 0;
    this.fetching = this.fetching
      .then(() =>
        on
          ? this.session.send("Fetch.enable", { patterns: [{ urlPattern: "*", resourceType: "Document", requestStage: "Request" }] })
          : this.session.send("Fetch.disable"),
      )
      .catch(() => {});
    return this.fetching;
  }
}
