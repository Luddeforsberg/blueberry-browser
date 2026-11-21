import { NOWHERE, siteAllowed } from "../../shared/mascots";
import { isWebAddress, siteOf } from "../../shared/sites";
import type { AskReason, AskWhy } from "../../shared/asking";
import type { PageTarget } from "./pageTarget";

// Whether going to an address or sending something out asks first in the default mode, and why. The tools' own
// `whyRisky` use these.

// Search text is short. A long one could be private text on its way out through a search box.
export const MAX_SAFE_TYPED_LENGTH = 100;

// Words in an address are names and slugs. Anything else is more likely a token, a hash or text encoded on its way
// out: a long word, an escape or an "@", six digits in a row, or a word that looks like hex or base64.
const MAX_PLAIN_WORD = 24;
const MIXED_WORD = /^(?=(?:.*\p{N}){3})(?=(?:.*\p{L}){3}).{12,}$/u;
const HEX_WORD = /^(?=.*\d)(?=.*[a-f])[\da-f]{4,}$/i;
const BASE64_WORD = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[\dA-Za-z]{8,}$/;

// Whether a path or host name could be carrying something out to the site. Only a plain one counts as not.
const looksLikeData = (piece: string): boolean =>
  piece.length > MAX_SAFE_TYPED_LENGTH ||
  /[%@=]|\d{6}/.test(piece) ||
  (piece.match(/[\p{L}\p{N}]+/gu) ?? []).some(
    (word) => word.length > MAX_PLAIN_WORD || MIXED_WORD.test(word) || HEX_WORD.test(word) || BASE64_WORD.test(word),
  );

export const because = (reason: AskReason, mark?: string): AskWhy => (mark ? { reason, mark } : { reason });

// An address as it was written: its name and password with the "@", its host, its path, and its query and fragment. Only
// so a card can mark the piece a reason is about. A backslash ends the host, as the browser reads one.
const WRITTEN_ADDRESS = /^[a-z][a-z\d+.-]*:\/\/([^/\\?#]*@)?([^/\\?#]*)([^?#]*)(.*)$/i;
const writtenHost = (host: string, address: URL): string | undefined =>
  URL.canParse(`https://${host}`) && new URL(`https://${host}`).hostname === address.hostname ? host : undefined;

// Whether a search that goes out to a search service is an ordinary one, by the same measures as an address: short, and
// with nothing in it that looks like data.
export const plainSearch = (query: string): boolean =>
  query.trim().length > 0 && query.length <= MAX_SAFE_TYPED_LENGTH && !looksLikeData(query);

// Sites the user's own words name, such as "bücher.de", or the site of an address they pasted, which may be local. Only
// whole names count, marks and all, so "bücher.de" never names "cher.de", and each is the host the browser would go to.
const ADDRESS = /https?:\/\/[^\s"'<>]+/giu;
const SITE_NAME = /(?<![\p{L}\p{M}\p{N}.-])(?:[\p{L}\p{M}\p{N}-]+\.)+\p{L}[\p{L}\p{M}]+(?![\p{L}\p{M}\p{N}-])/gu;
export const namedSites = (said: string): string[] => {
  const text = said.normalize("NFC");
  return [...text.matchAll(ADDRESS), ...text.replace(ADDRESS, " ").matchAll(SITE_NAME)].flatMap(([named]) => {
    const address = named.includes("://") ? named : `https://${named}`;
    return siteOf(address) ?? [];
  });
};

// The search pages where a short query is an ordinary search, by exact host and path. Anything wider lets data out:
// script.google.com and docs.google.com/forms run what anyone publishes, and most big sites have an open redirect.
const SEARCH_PAGES = new Map([
  ["www.youtube.com", "/results"],
  ["m.youtube.com", "/results"],
  ["www.google.com", "/search"],
  ["www.bing.com", "/search"],
  ["duckduckgo.com", "/"],
  ["github.com", "/search"],
  ["www.reddit.com", "/search"],
  ["www.amazon.com", "/s"],
]);
const isSearchPage = ({ hostname, pathname }: URL): boolean => {
  if (hostname.endsWith(".wikipedia.org")) return pathname === "/w/index.php";
  return (SEARCH_PAGES.get(hostname) ?? SEARCH_PAGES.get(`www.${hostname}`)) === pathname;
};

// A subdomain of a site the job has only been to, and wasn't sent to.
const isNewSubdomain = (url: string, chosen: readonly string[], visited: readonly string[]): boolean => {
  const host = siteOf(url);
  return (
    !siteAllowed(url, chosen.length > 0 ? chosen : [NOWHERE]) &&
    (host === null || !visited.includes(host)) &&
    siteAllowed(url, visited.length > 0 ? visited : [NOWHERE])
  );
};

// In the default mode, going somewhere asks unless it's plainly safe: an address the user gave, a short search on a
// well-known search page, or a plain address on a site this job is on or has reason to be on. A reason to be on a
// site never covers data: a query, a path or host name that looks like it carries some, or a new subdomain of a site
// it has only been to, which whoever runs that site's names can read. Says which, with the piece of the address it's about.
export const whyCardFor =
  ({ asked, chosen, been }: { asked: string; chosen: readonly string[]; been: ReadonlySet<string> }) =>
  async (url: string, from: PageTarget | null): Promise<AskWhy | null> => {
    if (!isWebAddress(url)) return null;
    const address = new URL(url);
    const [, credentials, writtenAs = "", path, details] = WRITTEN_ADDRESS.exec(url) ?? [];
    // A name and password in an address go to the site when it asks for them, whoever's site it is.
    if (address.username !== "" || address.password !== "") return because("credentials", credentials);
    if (asked.includes(url)) return null;
    if (address.search !== "" || address.hash !== "") {
      const carries = address.search.length + address.hash.length > MAX_SAFE_TYPED_LENGTH || !isSearchPage(address);
      return carries ? because("carries-data", details) : null;
    }
    const fromSite = from ? siteOf(from.url) : null;
    const visited = fromSite ? [...been, fromSite] : [...been];
    const shownHost = writtenHost(writtenAs, address);
    if (looksLikeData(address.hostname)) return because("looks-like-data", shownHost);
    if (looksLikeData(address.pathname)) return because("looks-like-data", path);
    if (isNewSubdomain(url, chosen, visited)) return because("new-subdomain", shownHost);
    const sites = [...chosen, ...visited];
    return siteAllowed(url, sites.length > 0 ? sites : [NOWHERE]) ? null : because("new-site", shownHost);
  };
