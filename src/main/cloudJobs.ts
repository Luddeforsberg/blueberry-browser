import type { ReplyMessage } from "./agent";
import type { ActionApproval } from "../shared/ipc";
import type { ChatApproval, ChatStep, MascotProfile } from "../shared/library";
import { BERRY, BERRY_ID, normaliseSite, parseMascotDraft } from "../shared/mascots";
import { fitHistory } from "../shared/phone";

// What goes into a cloud job's row and what comes back out, for the app and the runner alike. Plain data, no Electron.
// Everything read from a row is checked again here, whoever wrote it, and a mascot's limits can only come out the same
// or narrower.

const MAX_STEPS = 500;
const MAX_STEP_TEXT = 300;

export type CloudJobStatus = "queued" | "running" | "waiting" | "done" | "failed" | "stopped";
export const FINISHED: readonly CloudJobStatus[] = ["done", "failed", "stopped"];

// The bird a job runs as, at the moment it was sent. Its look stays on the computer.
export interface MascotSnapshot {
  id: string;
  name: string;
  instructions: string;
  sites: string[];
  tools: string[];
  fromGallery: boolean;
}

export const mascotSnapshot = ({ id, name, instructions, sites, tools, galleryId }: MascotProfile): MascotSnapshot => ({
  id,
  name,
  instructions,
  sites: [...sites],
  tools: [...tools],
  fromGallery: !!galleryId,
});

// A row is written with the user's session, so it can only say what the user could have sent: a stolen session could
// already make any bird and answer its approvals. What this stops is a row that's odd or edited. Berry's id is the only
// one with no limits, and only with none in the row, which is how the app always sends Berry. A routine of Berry's
// limited to some sites comes as Berry with those sites, which can only narrow it. Anyone else must pass the same checks
// as a mascot made in the app, or the job doesn't run at all.
export const mascotFromSnapshot = (input: unknown): MascotProfile | null => {
  const snapshot = (input ?? {}) as Record<string, unknown>;
  if (snapshot.id === BERRY_ID) {
    const { sites, tools } = snapshot;
    if (!Array.isArray(sites) || !Array.isArray(tools) || !BERRY.tools.every((tool) => tools.includes(tool))) return null;
    if (sites.length === 0) return BERRY;
    const clean = sites.map((site) => (typeof site === "string" ? normaliseSite(site) : null));
    return sites.length <= 20 && clean.every((site) => site !== null) ? { ...BERRY, sites: [...new Set(clean as string[])] } : null;
  }
  if (typeof snapshot.id !== "string" || !/^[\w-]{1,100}$/.test(snapshot.id)) return null;
  const parsed = parseMascotDraft({ ...snapshot, look: BERRY.look });
  if ("error" in parsed) return null;
  return { ...parsed.draft, id: snapshot.id, deletedAt: null, ...(snapshot.fromGallery === true ? { galleryId: "gallery" } : {}) };
};

// The chat before the newest message, in the words the model got it, trimmed to fit the row. Anything else is dropped.
export const historyFromRow = (input: unknown): ReplyMessage[] => fitHistory(input);

export const stepsFromRow = (input: unknown): ChatStep[] =>
  (Array.isArray(input) ? input : [])
    .filter((step) => typeof step?.text === "string")
    .slice(-MAX_STEPS)
    .map((step) => ({ text: String(step.text).slice(0, MAX_STEP_TEXT), done: step.done === true }));

// The database's own limits on what a job writes: `reply_shape`, `error_shape` and `steps_shape` in the migrations. A
// write over any of them is refused whole, so every one is cut to fit here, and says so, and how a job ended is always
// saved. Postgres counts characters as code points, so this does too, and never cuts a character in half.
const MAX_REPLY = 40_000;
const MAX_ERROR = 500;
const MAX_STEPS_BYTES = 100_000;
const CUT_SHORT = " (cut short)";
const EARLIER_STEPS: ChatStep = { text: "Earlier steps (cut short)", done: true };
const utf8 = new TextEncoder();

const fitText = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const characters = Array.from(text);
  return characters.length <= max ? text : characters.slice(0, max - CUT_SHORT.length).join("") + CUT_SHORT;
};

// A step's bytes as Postgres writes the array out, which puts a space after each colon and comma, with its separator.
const stepBytes = (step: ChatStep) => utf8.encode(JSON.stringify(step)).length + 5;

// The latest steps that fit, after a note that earlier ones were left out.
const fitSteps = (steps: ChatStep[]): ChatStep[] => {
  const fitted = steps.map(({ text, done }) => ({ text: fitText(text, MAX_STEP_TEXT), done }));
  const sizes = fitted.map(stepBytes);
  let bytes = 2 + sizes.reduce((sum, size) => sum + size, 0);
  if (fitted.length <= MAX_STEPS && bytes <= MAX_STEPS_BYTES) return fitted;
  bytes = 2 + stepBytes(EARLIER_STEPS);
  let first = fitted.length;
  while (first > 0 && fitted.length - first < MAX_STEPS - 1 && bytes + sizes[first - 1] <= MAX_STEPS_BYTES) bytes += sizes[--first];
  return [EARLIER_STEPS, ...fitted.slice(first)];
};

export const fitJobUpdate = <T extends { steps?: ChatStep[]; reply?: string; error?: string }>(update: T): T => ({
  ...update,
  ...(update.steps !== undefined ? { steps: fitSteps(update.steps) } : {}),
  ...(update.reply !== undefined ? { reply: fitText(update.reply, MAX_REPLY) } : {}),
  ...(update.error !== undefined ? { error: fitText(update.error, MAX_ERROR) } : {}),
});

// Nobody is at the computer to see what a job does, so it never asks less than the default: "Never ask" becomes "risky".
export const actionApprovalFromRow = (input: unknown): ActionApproval => (input === "always" ? "always" : "risky");

export type ApprovalKind = "approval" | "question" | "handoff";

export interface ApprovalToAsk {
  kind: ApprovalKind;
  text: string;
  need: "sign-in" | "captcha" | null;
  site: string | null;
}

// A cloud page has no code entry, so a handoff asks for a sign-in or a captcha.
export const approvalToAsk = ({ text, question, handoff }: ChatApproval): ApprovalToAsk =>
  handoff
    ? { kind: "handoff", text, need: handoff.need === "captcha" ? "captcha" : "sign-in", site: handoff.site }
    : { kind: question ? "question" : "approval", text, need: null, site: null };

// The approval a job's row says it's waiting on, as a chat shows one. Its page is in the cloud, so there's no tab here.
export const approvalFromRow = (row: Record<string, unknown>): (ChatApproval & { askedAt: number }) | null => {
  const { approval_id: id, approval_kind: kind, approval_text: text, approval_need: need, approval_site: site, approval_asked_at: askedAt } = row;
  if (typeof id !== "string" || typeof text !== "string") return null;
  const asked = typeof askedAt === "string" ? Date.parse(askedAt) : NaN;
  return {
    id,
    text,
    askedAt: Number.isNaN(asked) ? Date.now() : asked,
    ...(kind === "question" ? { question: true } : {}),
    ...(kind === "handoff" ? { handoff: { need: need === "captcha" ? ("captcha" as const) : ("sign-in" as const), tabId: "", site: typeof site === "string" ? site : "" } } : {}),
  };
};

// A routine that runs in the cloud, as the app keeps it there for the runner. Its bird's limits are narrowed by the
// routine's own sites before it goes. When it's due is the server's from then on: `firstRunAt` only counts for a new
// routine, a changed schedule or a resume.
export interface CloudRoutineRow {
  key: string;
  prompt: string;
  mascot: MascotSnapshot;
  actionApproval: ActionApproval;
  contextId: string | null;
  schedule: object;
  timeZone: string;
  paused: boolean;
  firstRunAt: string | null;
}
