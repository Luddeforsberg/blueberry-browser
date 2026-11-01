import { HANDOFF_WORDS } from "./browserTools";
import type { DesktopBerryState } from "../shared/ipc";
import type { MascotProfile, NeedsYouItem } from "../shared/library";

const MAX_LINE_LENGTH = 90;

// A job that ended while the user was elsewhere, until they've seen it.
export interface DesktopResult {
  chatId: string;
  mascotId: string;
  text: string;
  failed: boolean;
}

// What the bird can be pressed for, kept in main so the view never names a chat or an approval.
export type DesktopTarget = { page: "needs-you"; approvalId: string } | { page: "chat"; chatId: string } | null;

// The first sentence of a reply as plain words, short enough to stand beside a bird.
export const firstLine = (reply: string, max = MAX_LINE_LENGTH): string => {
  const plain = reply
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .filter((line) => !/^\s*(#|\||---)/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*+>]|\d+\.)\s+/, "").replace(/[*_`~]/g, "").trim())
    .find((line) => line.length > 0);
  if (!plain) return "";
  const sentence = plain.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? plain;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
};

// Who, and what kind of thing it's waiting for, as a notification says it. The buttons are only in Blueberry.
const askingWords = (who: string, { approval }: NeedsYouItem): string =>
  approval.handoff
    ? `${who} needs you to ${HANDOFF_WORDS[approval.handoff.need]}`
    : approval.question
      ? `${who} has a question for you`
      : `${who} needs your OK`;

const andMore = (text: string, others: number, what: string): string => (others > 0 ? `${text} And ${others} more ${what}.` : text);

export interface DesktopFacts {
  needsYou: NeedsYouItem[];
  // Newest last.
  results: DesktopResult[];
  // What's working, oldest first. A routine has no chat.
  running: Array<{ mascotId: string; title: string }>;
  chosen: MascotProfile;
  mascot: (id: string) => MascotProfile;
  nameOf: (mascot: MascotProfile) => string;
}

// What the bird shows, and whose bird it is. There's one on the desktop, so it's whoever has the most to say:
// someone asking, then someone finished, then someone working, and otherwise whoever the next job goes to.
export const desktopFace = ({ needsYou, results, running, chosen, mascot, nameOf }: DesktopFacts): Pick<DesktopBerryState, "mood" | "name" | "look" | "line"> & { target: DesktopTarget } => {
  const face = (who: MascotProfile) => ({ name: nameOf(who), look: who.look });
  const [first] = needsYou;
  if (first) {
    const who = mascot(first.mascotId);
    return {
      ...face(who),
      mood: "asking",
      line: { text: andMore(`${askingWords(nameOf(who), first)}.`, needsYou.length - 1, needsYou.length === 2 ? "is waiting" : "are waiting"), lasting: true },
      target: { page: "needs-you", approvalId: first.approval.id },
    };
  }
  const latest = results.at(-1);
  if (latest) {
    return {
      ...face(mascot(latest.mascotId)),
      mood: latest.failed ? "oops" : "delivered",
      line: { text: andMore(latest.text, results.length - 1, "finished"), lasting: false },
      target: { page: "chat", chatId: latest.chatId },
    };
  }
  const [working] = running;
  if (working) {
    return {
      ...face(mascot(working.mascotId)),
      mood: "fetching",
      line: { text: `Working on “${working.title}”`, lasting: false },
      target: null,
    };
  }
  return { ...face(chosen), mood: "rest", line: null, target: null };
};
