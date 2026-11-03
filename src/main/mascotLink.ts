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

// Any page can hand the system links over and over. A repeat of the id that was just opened is dropped, and keeps being
// dropped while it keeps coming, and the window comes forward at most once in a while. Whatever the ids, a few accepted
// close together means a flood, so every link is ignored for a while after.
export const REPEAT_MS = 3000;
export const FORWARD_MS = 2000;
export const FLOOD_LINKS = 3;
export const FLOOD_MS = 10_000;
export const QUIET_MS = 30_000;

export const linkThrottle = (now: () => number = () => Date.now()) => {
  let last: { id: string; at: number } | null = null;
  let forwardAt = -Infinity;
  let quietUntil = -Infinity;
  let accepted: number[] = [];
  return (id: string): { open: boolean; forward: boolean } => {
    const at = now();
    if (at < quietUntil) return { open: false, forward: false };
    const repeat = last?.id === id && at - last.at < REPEAT_MS;
    last = { id, at };
    if (repeat) return { open: false, forward: false };
    accepted = [...accepted.filter((then) => at - then < FLOOD_MS), at];
    if (accepted.length >= FLOOD_LINKS) {
      quietUntil = at + QUIET_MS;
      accepted = [];
    }
    const forward = at - forwardAt >= FORWARD_MS;
    if (forward) forwardAt = at;
    return { open: true, forward };
  };
};
