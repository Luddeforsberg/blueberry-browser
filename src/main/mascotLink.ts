import { isUuid } from "../shared/publishing";

// Links any website can hand to the system, which opens Blueberry with them. The one form we read is
// `blueberry://mascot/<uuid>`, and all it does is show that Gallery entry, where adding still takes a press. Anything else,
// including a trailing slash, a query or a fragment, is ignored.
export const LINK_SCHEME = "blueberry";
const PREFIX = `${LINK_SCHEME}://mascot/`;
const LENGTH = PREFIX.length + 36;

export const mascotFromLink = (link: unknown): string | null => {
  if (typeof link !== "string" || link.length !== LENGTH || !link.startsWith(PREFIX)) return null;
  const id = link.slice(PREFIX.length);
  return isUuid(id) ? id.toLowerCase() : null;
};

// Windows and Linux start a second copy with the link among its arguments, next to Chromium's own switches.
export const mascotFromArgs = (argv: readonly unknown[]): string | null => {
  for (const arg of argv) {
    const id = mascotFromLink(arg);
    if (id) return id;
  }
  return null;
};
