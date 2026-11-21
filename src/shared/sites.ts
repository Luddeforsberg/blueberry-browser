// What a site is, everywhere: the host of an http or https address, without "www." in front. Mascot limits, approvals,
// memory and every name a person reads go by this, so none of them can disagree about which site an address is on.
// Parsing gives data, with null where there's no site. Words for a person are `siteName`'s, and only for showing. The
// whole site a host belongs to is siteDomains.ts's, apart from this so the chrome and the phone page don't load its list.

export const stripWww = (host: string): string => host.replace(/^www\./, "");

export const isWebAddress = (url: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

// The host as the browser reads it: lower case, an international name in punycode, an IPv6 address in brackets, no
// port, and a trailing dot kept, so "example.com." is a site of its own. Null for a blank tab, a file, an internal page
// or anything that isn't an address, and for "www." alone, so an empty name never stands for a site.
export const siteOf = (url: string): string | null => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? stripWww(hostname) || null : null;
  } catch {
    return null;
  }
};

// Said where an address has no site of its own.
export const NO_SITE = "a page";

// A site's name for a person to read, in a sentence or under a title. Never for deciding anything.
export const siteName = (url: string): string => siteOf(url) ?? NO_SITE;
