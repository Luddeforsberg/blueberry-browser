import { getDomain, getDomainWithoutSuffix } from "tldts";
import { stripWww } from "./sites";

// The whole site a host belongs to, by the Public Suffix List with its private part, so shop.example.co.uk is
// example.co.uk and someone's app on herokuapp.com or github.io is a site of its own. A host that's an IP, a single
// name or a public suffix itself has none, and stays as it is.
export const registrableSite = (host: string): string => {
  const plain = stripWww(host.toLowerCase());
  return getDomain(plain, { allowPrivateDomains: true }) ?? plain;
};

// A site by the name people would write, such as "reddit" for old.reddit.com or "bbc" for bbc.co.uk.
export const siteWord = (host: string): string | null => getDomainWithoutSuffix(host, { allowPrivateDomains: true });
