import { createHash } from "crypto";
import type { RawInput } from "./nestContext";

// What a card remembers of each input it sent with: a fingerprint of what crossed the line, never a copy of it. A hash of
// the source's thread, table, rows or note as it went, a file's bytes, or a page's address, since a page's text is read
// fresh as the card sends and is never fetched again to compare. Its name isn't part of it, since only what it says counts.

// Said for a line whose source had nothing to give when the card sent, so its first answer since counts as a change.
export const SENT_NOTHING = "none";
// Said for a line that For-each runs sent with different things through, so the card's rows don't all agree with it.
export const SENT_MIXED = "mixed";

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("base64url").slice(0, 32);

// What a line gives now, as a fingerprint, or null when it has nothing to give: its source hasn't answered, is answering
// again, or the rows picked on it have gone, which the line already says.
export const fingerprint = (
  input: RawInput | null | "stale",
  file: Uint8Array | null = null,
): string | null => {
  if (file) return `file ${hash(file)}`;
  if (input === null || input === "stale") return null;
  if (input.part === "thread")
    return `thread ${hash(JSON.stringify(input.exchanges.map(({ asked, answer }) => [asked, answer])))}`;
  if (input.part === "page") return `page ${hash(input.url)}`;
  if (input.part === "note") return `note ${hash(input.text)}`;
  if (input.part === "versions")
    return `versions ${hash(JSON.stringify(input.versions.map(({ letter, note, exchanges }) => [letter, note, exchanges.map(({ asked, answer }) => [asked, answer])])))}`;
  if (input.part === "row")
    return `row ${hash(JSON.stringify([input.header, input.row]))}`;
  return `${input.part} ${hash(JSON.stringify([input.table.header, input.table.rows]))}`;
};

// What a For-each card's line was sent with, from what each of its runs last sent through it: what they all agree on,
// mixed when they don't, so one row sent with something older still shows, or null when no run has sent yet.
export const agreed = (runs: readonly (string | undefined)[]): string | null => {
  const sent = runs.filter((each): each is string => each !== undefined);
  if (sent.length === 0) return null;
  return sent.every((each) => each === sent[0]) ? sent[0] : SENT_MIXED;
};

// The lines into a card whose source has changed since the card sent with them. Not a line it never sent with, which
// is new and says so already, and not one with nothing to give now, which Update couldn't send.
export const changedLines = (
  lines: readonly { lineId: string; sent: string | null; now: string | null }[],
): string[] =>
  lines
    .filter(({ sent, now }) => sent !== null && now !== null && sent !== now)
    .map(({ lineId }) => lineId);
