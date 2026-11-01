import { HANDOFF_WORDS } from "./browserTools";
import type { DesktopBerryState } from "../shared/ipc";
import type { MascotProfile, NeedsYouItem } from "../shared/library";

const MAX_LINE_LENGTH = 90;
const MIN_READING_MS = 5000;
const MAX_READING_MS = 12000;

// A job that ended while the user was elsewhere, until they've seen it.
export interface DesktopResult {
  chatId: string;
  mascotId: string;
  text: string;
  failed: boolean;
}

// What the bird can be pressed for, kept in main so the view never names a chat or an approval.
export type DesktopTarget = { page: "needs-you"; approvalId: string } | { page: "chat"; chatId: string } | null;

// A line in a reply, as plain words: no markup, links as their words, and a bare address as just its site.
const plainWords = (line: string): string =>
  line
    .replace(/^\s*(?:[-*+>]|\d+[.)])\s+/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/(?:www\.)?([^\s/)]+)[^\s)]*/g, "$1")
    // Only as markup, so a name like snake_case keeps its underscore.
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_](?=\S)(.+?)(?<=\S)[*_](?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

// The first sentence of a reply, short enough for two lines beside a bird. A line only leading in to a list isn't
// saying anything yet, so it's the first thing after it.
export const firstLine = (reply: string, max = MAX_LINE_LENGTH): string => {
  const lines = reply
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .filter((line) => !/^\s*(#|\||---|===)/.test(line))
    .map(plainWords)
    .filter((line) => line.length > 0);
  const plain = lines.find((line) => !line.endsWith(":")) ?? lines[0];
  if (!plain) return "";
  // A sentence ends where the next one starts, so "e.g. this" and "2.50" don't end it.
  const sentence = plain.match(/^.*?[.!?…](?=\s+[^a-z\s]|$)/)?.[0] ?? plain;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
};

// Long enough to read, however little it says.
export const readingTime = (line: string): number => Math.min(Math.max(3000 + line.length * 70, MIN_READING_MS), MAX_READING_MS);

// Who, and what kind of thing it's waiting for, as a notification says it. The buttons are only in Blueberry.
const askingWords = (who: string, { approval }: NeedsYouItem): string =>
  approval.handoff
    ? `${who} needs you to ${HANDOFF_WORDS[approval.handoff.need]}`
    : approval.question
      ? `${who} has a question for you`
      : `${who} needs your OK`;

const andMore = (text: string, others: number, what: string): string => {
  if (others === 0) return text;
  const more = ` And ${others} more ${what}.`;
  return `${firstLine(text, MAX_LINE_LENGTH - more.length)}${more}`;
};

export interface DesktopFacts {
  needsYou: NeedsYouItem[];
  // Newest last.
  results: DesktopResult[];
  // What's working, oldest first. A routine has no chat.
  running: Array<{ chatId: string | null; mascotId: string; title: string }>;
  chosen: MascotProfile;
  mascot: (id: string) => MascotProfile;
  nameOf: (mascot: MascotProfile) => string;
}

// What the bird shows, and whose bird it is. There's one on the desktop, so it's whoever has the most to say:
// someone asking, then someone finished, then someone working, and otherwise whoever the next job goes to.
export const desktopFace = ({ needsYou, results, running, chosen, mascot, nameOf }: DesktopFacts): Pick<DesktopBerryState, "mood" | "name" | "look" | "line" | "sign"> & { target: DesktopTarget; announce: string | null } => {
  const face = (who: MascotProfile) => ({ name: nameOf(who), look: who.look });
  const [first] = needsYou;
  if (first) {
    const who = mascot(first.mascotId);
    return {
      ...face(who),
      mood: "asking",
      sign: "waiting",
      line: andMore(`${askingWords(nameOf(who), first)}.`, needsYou.length - 1, needsYou.length === 2 ? "is waiting" : "are waiting"),
      target: { page: "needs-you", approvalId: first.approval.id },
      announce: `asking:${first.approval.id}`,
    };
  }
  const [working] = running;
  const latest = results.at(-1);
  if (latest) {
    return {
      ...face(mascot(latest.mascotId)),
      mood: latest.failed ? "oops" : "delivered",
      sign: working ? "working" : null,
      line: andMore(latest.text, results.length - 1, "finished"),
      target: { page: "chat", chatId: latest.chatId },
      announce: `result:${latest.chatId}:${latest.text}`,
    };
  }
  if (working) {
    return {
      ...face(mascot(working.mascotId)),
      mood: "fetching",
      sign: "working",
      line: `Working on “${working.title}”`,
      target: working.chatId ? { page: "chat", chatId: working.chatId } : null,
      announce: null,
    };
  }
  return { ...face(chosen), mood: "rest", sign: null, line: null, target: null, announce: null };
};
