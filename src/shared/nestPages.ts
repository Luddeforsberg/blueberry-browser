// The rules for a page on a Nest's board: a link the user dropped there, or a tab they dragged there. Pure, so the
// chrome and main read a drop the same way, and main checks it again since a renderer can send anything.

// Longer than any address a person shares, and what a page might pack data into instead.
export const MAX_ADDRESS_LENGTH = 2048;
// A link's words, or a tab's title, as the card shows them.
export const MAX_PAGE_TITLE_LENGTH = 200;

export type CheckedAddress = { ok: true; url: string } | { ok: false; error: string };

// Only an http or https address, whole, of a reasonable length, with no name or password in it, which would go to the
// site whoever's it is. It comes back as the browser writes it, so the same address is always the same text.
export const checkAddress = (value: unknown): CheckedAddress => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { ok: false, error: "That isn’t a link." };
  if (text.length > MAX_ADDRESS_LENGTH) return { ok: false, error: "That link is too long to put on the board." };
  if (!URL.canParse(text)) return { ok: false, error: "That isn’t a link." };
  const address = new URL(text);
  if (address.protocol !== "http:" && address.protocol !== "https:") return { ok: false, error: "Only web pages can go on the board, with an address starting http or https." };
  if (!address.hostname) return { ok: false, error: "That isn’t a link." };
  if (address.username || address.password) return { ok: false, error: "That link has a name or password in it, so it can’t go on the board." };
  return address.href.length > MAX_ADDRESS_LENGTH ? { ok: false, error: "That link is too long to put on the board." } : { ok: true, url: address.href };
};

// One line, with no marks a page could hide words in, cut to what the card has room for.
export const cleanTitle = (value: unknown): string => {
  const line = typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "";
  return line.length > MAX_PAGE_TITLE_LENGTH ? `${line.slice(0, MAX_PAGE_TITLE_LENGTH - 1).trimEnd()}…` : line;
};

// What a drag carries: a list of addresses, one per line with comments starting "#", as text/uri-list is, or plain text
// that is one address and nothing else. The first address is the link. Null when there's nothing like one.
export const droppedAddress = ({ uriList, text }: { uriList?: string; text?: string }): string | null => {
  const listed = (uriList ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (listed) return listed;
  const plain = (text ?? "").trim();
  return plain && !/\s/.test(plain) && /^https?:\/\//i.test(plain) ? plain : null;
};

// Where a page is, as a card and a line name it: its site and path, without the query, such as
// "strawberrybrowser.com/pricing".
export const pageName = (url: string): string => {
  if (!URL.canParse(url)) return "a page";
  const { hostname, pathname } = new URL(url);
  const site = hostname.replace(/^www\./, "");
  const path = pathname === "/" ? "" : pathname.replace(/\/$/, "");
  const name = `${site}${path}`;
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
};
