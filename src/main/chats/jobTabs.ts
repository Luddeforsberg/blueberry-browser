// What happens to a job's tabs when it ends. Pure, so it's decided the same way for a tab here and a page in the cloud.

const hostOf = (url: string): string | null => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? hostname.replace(/^www\./, "").toLowerCase() : null;
  } catch {
    return null;
  }
};

// Whether the reply sends the user to this page, by naming its site or its address. Decided in code, never by the model.
export const replyPointsTo = (reply: string, url: string): boolean => {
  const host = hostOf(url);
  if (!host || !reply) return false;
  const words = reply.toLowerCase();
  // "shop.example.com" in a reply also names "example.com", but not the other way round.
  return new RegExp(`(^|[^a-z0-9.-])(www\\.)?${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9-])`).test(words);
};

// The address a page is kept under, or null for one that isn't kept. Past a handoff an address can carry a code or a
// token, so only its site and path are.
export const addressToKeep = (url: string, { handedBack, codeTyped }: { handedBack: boolean; codeTyped: boolean }): string | null => {
  if (codeTyped || !hostOf(url)) return null;
  if (!handedBack) return url;
  const { origin, pathname } = new URL(url);
  return origin + pathname;
};
