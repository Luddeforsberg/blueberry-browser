import { HANDOFF_WORDS } from "../tools/handoffWords";
import { plausibleCode } from "../phone/phoneReplies";
import type { DesktopAsk, DesktopDropSays, DesktopFace, DesktopTray } from "../../shared/ipc";
import type { ChatApproval, MascotProfile, NeedsYouItem } from "../../shared/library";
import { fieldsOf } from "../../shared/fields";

const MAX_LINE_LENGTH = 90;
const MIN_READING_MS = 5000;
const MAX_READING_MS = 12000;
const MAX_FACES = 3;

// A job that ended while the user was elsewhere, until they've seen it.
export interface DesktopResult {
  chatId: string;
  mascotId: string;
  text: string;
  failed: boolean;
}

// A job that ended today, for the tray. Stopped ones aren't kept.
export interface DesktopEnded {
  chatId: string;
  mascotId: string;
  title: string;
  problem: string | null;
  endedAt: number;
}

// A job that's working. A routine's run has no chat. `step` and `since` are only filled in where they're shown.
export interface DesktopRunning {
  chatId: string | null;
  routineId: string | null;
  mascotId: string;
  title: string;
  step?: string | null;
  since?: number | null;
}

// What the drop or a row in the tray can open in Blueberry, kept in main so the view never names a chat.
export type DesktopTarget = { page: "chat"; chatId: string } | { page: "routine"; routineId: string };

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

// The first sentence of a reply, short enough for two lines in the drop. A line only leading in to a list isn't saying
// anything yet, so it's the first thing after it.
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

// Who, and what kind of thing it's waiting for, as a notification says it: never the question, the site or the words.
const askingWords = (who: string, { approval }: Pick<NeedsYouItem, "approval">): string =>
  approval.handoff
    ? `${who} needs you to ${HANDOFF_WORDS[approval.handoff.need]}`
    : approval.question
      ? `${who} has a question for you`
      : `${who} needs your OK`;

export interface DesktopFacts {
  // Oldest first.
  needsYou: NeedsYouItem[];
  // Newest last.
  results: DesktopResult[];
  // Oldest first.
  running: DesktopRunning[];
  // Newest last.
  finishedToday: DesktopEnded[];
  chosen: MascotProfile;
  mascot: (id: string) => MascotProfile;
  nameOf: (mascot: MascotProfile) => string;
}

const faceOf = (facts: DesktopFacts, mascotId: string, mood: DesktopFace["mood"]): DesktopFace => {
  const who = facts.mascot(mascotId);
  return { name: facts.nameOf(who), look: who.look, mood };
};

// Whether a press on the drop has anything to show besides the prompt box.
export const anythingGoing = ({ needsYou, results, running, finishedToday }: DesktopFacts): boolean =>
  needsYou.length + results.length + running.length + finishedToday.length > 0;

const count = (n: number, what: string): string | null => (n > 0 ? `${n} ${what}` : null);

// A job waiting for the user is still running, but it's said once, as asking.
const notWaiting = ({ needsYou, running }: Pick<DesktopFacts, "needsYou" | "running">): DesktopRunning[] =>
  running.filter(
    (job) =>
      !needsYou.some(
        (item) => (job.chatId !== null && item.id === job.chatId) || (job.routineId !== null && item.routineId === job.routineId),
      ),
  );

// What the drop shows. The faces are whoever has the most to say, in the order asking, finished, working, and with
// nothing going on, whoever the next job goes to. What comes out by itself is only an ask, which stays until it's
// answered, and a result that has just come in (`announcing`, by its chat), and neither says more than who and what kind
// of thing, and the reply's own first sentence. Pointed at, it says what a press does, or what's going.
export const desktopDrop = (
  facts: DesktopFacts,
  { pointed, announcing, shortcut }: { pointed: boolean; announcing: string | null; shortcut: boolean },
): { faces: DesktopFace[]; working: boolean; says: DesktopDropSays } => {
  const { needsYou, results } = facts;
  const running = notWaiting(facts);
  const newestFirst = [...results].reverse();
  const things = [
    ...needsYou.map((item) => faceOf(facts, item.mascotId, "asking")),
    ...newestFirst.map((result) => faceOf(facts, result.mascotId, result.failed ? "oops" : "delivered")),
    ...running.map((job) => faceOf(facts, job.mascotId, "fetching")),
  ];
  const faces = things.length > 0 ? things.slice(0, MAX_FACES) : [faceOf(facts, facts.chosen.id, "rest")];
  const working = running.length > 0;
  const [asking] = needsYou;
  if (asking) return { faces, working, says: { kind: "asking", words: askingWords(facts.nameOf(facts.mascot(asking.mascotId)), asking) } };
  const announced = announcing === null ? undefined : results.find(({ chatId }) => chatId === announcing);
  // The newest result is the one that comes out, so its face is already in front.
  if (announced) return { faces, working, says: { kind: "finished", text: announced.text } };
  if (!pointed) return { faces, working, says: { kind: "rest" } };
  if (things.length === 0) return { faces, working, says: { kind: "job", shortcut } };
  const [job] = running;
  if (things.length === 1 && job) return { faces, working, says: { kind: "working", title: job.title, since: job.since ?? null } };
  const counts = [count(results.length, "finished"), count(running.length, "working")].filter((each): each is string => each !== null);
  return { faces, working, says: { kind: "counts", counts } };
};

// Main gives each row a key for this one showing, so the view never names a chat or an approval.
export type TrayTarget = { kind: "ask"; chatId: string; approvalId: string } | { kind: "open"; target: DesktopTarget };

const targetOf = ({ chatId, routineId }: { chatId: string | null; routineId?: string | null }): DesktopTarget | null =>
  chatId ? { page: "chat", chatId } : routineId ? { page: "routine", routineId } : null;

// The tray: the mascots in their moods, then what needs you, what's working and what finished today, newest first.
export const desktopTray = (facts: DesktopFacts, mascots: MascotProfile[], keyFor: (target: TrayTarget) => string): DesktopTray => {
  const { needsYou, results, finishedToday, chosen } = facts;
  const running = notWaiting(facts);
  const moodOf = (id: string): DesktopFace["mood"] =>
    needsYou.some((item) => item.mascotId === id)
      ? "asking"
      : running.some((job) => job.mascotId === id)
        ? "fetching"
        : results.some((result) => result.mascotId === id)
          ? "delivered"
          : "rest";
  return {
    mascots: mascots.map((mascot) => ({
      name: facts.nameOf(mascot),
      look: mascot.look,
      mood: moodOf(mascot.id),
      chosen: mascot.id === chosen.id,
    })),
    asks: needsYou.map((item) => ({
      ...faceOf(facts, item.mascotId, "asking"),
      key: keyFor({ kind: "ask", chatId: item.id, approvalId: item.approval.id }),
      words: askingWords(facts.nameOf(facts.mascot(item.mascotId)), item),
      since: item.askedAt,
    })),
    working: running.flatMap((job) => {
      const target = targetOf(job);
      return target
        ? [
            {
              ...faceOf(facts, job.mascotId, "fetching"),
              key: keyFor({ kind: "open", target }),
              title: job.title,
              step: job.step ?? null,
              since: job.since ?? null,
            },
          ]
        : [];
    }),
    finished: [...finishedToday].reverse().map((ended) => ({
      ...faceOf(facts, ended.mascotId, ended.problem ? "oops" : "delivered"),
      key: keyFor({ kind: "open", target: { page: "chat", chatId: ended.chatId } }),
      title: ended.title,
      problem: ended.problem,
      at: ended.endedAt,
    })),
  };
};

// The ask, as the sheet shows it after Answer: the tool's exact words, never cut.
export const desktopAsk = (item: NeedsYouItem, face: DesktopFace): Omit<DesktopAsk, "key" | "said"> => {
  const { approval } = item;
  return {
    face,
    kind: approval.handoff ? "handoff" : approval.question ? "question" : "approval",
    text: approval.text,
    answers: approval.question ? (approval.answers ?? []) : [],
    handoff: approval.handoff ? { need: approval.handoff.need, site: approval.handoff.site } : null,
    job: item.job,
  };
};

// The ask that's showing, as it was when it was shown, under a key made for this one showing. Main holds it, and the
// view only ever sends a decision with that key, so a press on a sheet that has since been replaced answers nothing.
export interface ShownAsk {
  key: string;
  item: NeedsYouItem;
  decided: boolean;
}

// The same ask, with nothing about it changed since it was shown.
export const sameAsk = (shown: ChatApproval, live: ChatApproval): boolean =>
  shown.id === live.id &&
  shown.text === live.text &&
  !!shown.question === !!live.question &&
  JSON.stringify(shown.answers ?? []) === JSON.stringify(live.answers ?? []) &&
  JSON.stringify(shown.why ?? null) === JSON.stringify(live.why ?? null) &&
  JSON.stringify(shown.handoff ?? null) === JSON.stringify(live.handoff ?? null);

export type DecisionCheck =
  | { ok: true; chatId: string; approvalId: string; allow: boolean; answer?: string }
  | { ok: false; why: "gone" | "stale" | "code" | "not-here" | "invalid" };

// Whether a decision from the ask may go, and to which approval: only the one that was shown, only from a press on that
// showing (`stale` otherwise, which leaves the one showing now alone), only while it's still the one waiting and
// unchanged, and only once. A handoff isn't answered here, and an answer shaped like a code isn't sent.
export const checkDecision = (shown: ShownAsk | null, waiting: readonly NeedsYouItem[], decision: unknown): DecisionCheck => {
  if (!shown || shown.decided) return { ok: false, why: "gone" };
  const { key, allow, answer } = fieldsOf(decision);
  if (typeof key !== "string" || typeof allow !== "boolean" || (answer !== undefined && typeof answer !== "string"))
    return { ok: false, why: "invalid" };
  if (key !== shown.key) return { ok: false, why: "stale" };
  const live = waiting.find((item) => item.id === shown.item.id);
  if (!live || !sameAsk(shown.item.approval, live.approval)) return { ok: false, why: "gone" };
  const { approval } = live;
  if (approval.handoff) return { ok: false, why: "not-here" };
  if (answer !== undefined) {
    if (!approval.question || !allow || !answer.trim()) return { ok: false, why: "invalid" };
    if (plausibleCode(answer) !== null) return { ok: false, why: "code" };
  } else if (approval.question && allow) {
    return { ok: false, why: "invalid" };
  }
  return { ok: true, chatId: live.id, approvalId: approval.id, allow, ...(answer !== undefined ? { answer } : {}) };
};

// What the sheet says for a moment after an answer, as Needs you says it.
export const saidWords = (name: string, question: boolean, allow: boolean): string =>
  question
    ? allow
      ? `Answered. ${name} carries on.`
      : `Skipped. ${name} carries on without it.`
    : allow
      ? `Allowed. ${name} carries on.`
      : `Not allowed, and ${name} knows.`;

// This computer or the cloud, by the new tab's rule: there while the cloud can be used, unless the mascot only reads the
// page in front, and on Cloud to begin with for one set to work there.
export const desktopCloud = (
  mascot: Pick<MascotProfile, "tools" | "worksInCloud">,
  available: { runner: boolean; cloud: boolean },
): { fits: boolean; on: boolean } => {
  const fits = (available.runner || available.cloud) && mascot.tools.includes("visit");
  return { fits, on: fits && mascot.worksInCloud === true };
};

// Where a job from the box goes. The runner keeps going with this computer off, so it's used whenever there is one.
export const desktopWhere = (
  mascot: Pick<MascotProfile, "tools" | "worksInCloud">,
  available: { runner: boolean; cloud: boolean },
  wantsCloud: boolean,
): { runner: boolean; cloud: boolean } => {
  const inCloud = desktopCloud(mascot, available).fits && wantsCloud === true;
  return { runner: inCloud && available.runner, cloud: inCloud && !available.runner && available.cloud };
};

// Whether a time was today, on this computer's clock.
export const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();
