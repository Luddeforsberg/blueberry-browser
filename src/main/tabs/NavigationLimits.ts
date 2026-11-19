import type { Tab } from "./Tab";

// Where the page may take its tab while a limited mascot is acting in it, and which addresses it tried.
export class NavigationLimits {
  // Addresses this tab may not go to while a limited mascot is acting in it, and any it tried.
  private readonly navigationLimits = new Set<(url: string) => boolean>();
  // One set for each limited call running now, so overlapping calls each hear about every refusal.
  readonly refusalListeners = new Set<Set<string>>();

  constructor(
    private readonly tab: Tab,
    // The tab whose page opened this one, which can send it anywhere again by name.
    private readonly opener: Tab | null,
  ) {}

  refusesNavigation(url: string): boolean {
    // `window.open` with the same name sends a popup somewhere new without asking us, so its opener's limits hold here.
    return [...this.navigationLimits].some((allows) => !allows(url)) || !!this.opener?.refusesNavigation(url);
  }

  // For as long as `act` runs, the page can't take this tab anywhere `allows` says no to. The user's own use of the tab
  // is left alone outside these moments. Says which addresses it stopped.
  async withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    // One of its own for each call, because calls can overlap and one ending mustn't lift the other's limit.
    const limit = (url: string) => allows(url);
    const refused = new Set<string>();
    this.navigationLimits.add(limit);
    this.refusalListeners.add(refused);
    try {
      const result = await act();
      return { result, refused: [...refused] };
    } finally {
      this.navigationLimits.delete(limit);
      this.refusalListeners.delete(refused);
    }
  }

  // Opened by a page a limited mascot is acting in, so its first load can't go where the opener couldn't.
  limitFirstLoadLike(opener: NavigationLimits): void {
    const limits = [...opener.navigationLimits].map((allows) => (url: string) => allows(url));
    if (limits.length === 0) return;
    limits.forEach((limit) => this.navigationLimits.add(limit));
    this.tab.webContents.once("did-stop-loading", () => limits.forEach((limit) => this.navigationLimits.delete(limit)));
  }
}
