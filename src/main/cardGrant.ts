// Allow for this card's runs: what the user allowed once on one run of a For-each card, which the card's other runs may
// then do without asking. It's pure and plain Node, so the matching can be tested without a page or a model.
//
// The key is exactly what the approval card named, and nothing broader, and only two kinds of action ever get one:
// - click, a single click sent as real input: the page's origin, the element's role and its name as the card showed
//   them, and where it goes for a link or a form's button. Clicking “Save draft” never covers clicking “Send”, another
//   site or another kind of element.
// - open_tab and go_to: the tool and the whole address, since the address is what goes out to the site.
// Nothing else ever gets a key: no double-click, no typing, no other tool, no secret field, nothing in a frame, no
// element without a name or with a clipped one, so those always ask.

export interface GrantKey {
  key: string;
  // What it covers, for the choice on the approval card: "Allow clicking the button “Save draft” on example.com for this
  // card’s runs".
  words: string;
}

// What the tools know about the element an action is on, as `describe` read it.
export interface GrantElement {
  role: string;
  name: string;
  target: string | null;
  secret?: boolean;
  frameUrl: string | null;
  frameOrigin?: string;
}

const MAX_NAME_LENGTH = 200;

const webOrigin = (url: string): { origin: string; host: string } | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return { origin: parsed.origin, host: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
};

const named = (element: GrantElement): string | null => {
  const name = element.name.replace(/\s+/g, " ").trim();
  // The page script clips a long name with "…", and two names clipped alike would share a key.
  if (!name || name === "unnamed" || name.length > MAX_NAME_LENGTH || name.endsWith("…")) return null;
  if (element.secret || element.frameUrl || element.frameOrigin) return null;
  return name;
};

export const clickGrant = (pageUrl: string, element: GrantElement | null): GrantKey | null => {
  const page = webOrigin(pageUrl);
  const name = element && named(element);
  if (!page || !element || !name) return null;
  return {
    key: JSON.stringify(["click", page.origin, element.role, name, element.target ?? ""]),
    words: `clicking the ${element.role} “${name}” on ${page.host}`,
  };
};

export const addressGrant = (tool: "open_tab" | "go_to", url: string): GrantKey | null => {
  if (!webOrigin(url)) return null;
  const href = new URL(url).href;
  return { key: JSON.stringify([tool, href]), words: `${tool === "open_tab" ? "opening" : "going to"} ${href}` };
};

// The grants of each For-each card, by its id. Memory only, so quitting ends every one, and nothing about them is ever
// saved, sent to a renderer or to another app.
export class CardGrants {
  private readonly byCard = new Map<string, Set<string>>();

  covers(cardId: string, key: string): boolean {
    return this.byCard.get(cardId)?.has(key) ?? false;
  }

  add(cardId: string, key: string): void {
    const keys = this.byCard.get(cardId) ?? new Set<string>();
    keys.add(key);
    this.byCard.set(cardId, keys);
  }

  // The card finished, was stopped or was deleted.
  end(cardId: string): void {
    this.byCard.delete(cardId);
  }

  has(cardId: string): boolean {
    return (this.byCard.get(cardId)?.size ?? 0) > 0;
  }
}
