// The icon a tab shows once it has gone somewhere. A page only reports its icon when it differs from the one the
// browser already has for that page, so going back, forward or reloading reports nothing. Clearing the icon on every
// navigation therefore left those tabs with a letter. So a tab remembers the icon each of its addresses had, and on the
// same site keeps the one it's showing until the page says otherwise.

const MAX_REMEMBERED = 100;

const siteOf = (url: string): string | null => {
  try {
    // An address with no site of its own, such as about:blank, has the origin "null".
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
};

export class TabIcons {
  private readonly byAddress = new Map<string, string>();

  // What the page at this address said its icon is. Null is a page saying it has none.
  remember(url: string, icon: string | null): void {
    this.byAddress.delete(url);
    if (!icon) return;
    this.byAddress.set(url, icon);
    // The oldest goes first, as a Map keeps the order things were added in.
    if (this.byAddress.size > MAX_REMEMBERED) this.byAddress.delete(this.byAddress.keys().next().value!);
  }

  // The icon to show on arriving at `url` from `from`, showing `current`.
  after(from: string, url: string, current: string | null): string | null {
    const site = siteOf(url);
    return this.byAddress.get(url) ?? (site !== null && site === siteOf(from) ? current : null);
  }
}
