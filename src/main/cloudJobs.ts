import type { ReplyMessage } from "./agent";
import type { ActionApproval } from "../shared/ipc";
import type { ChatApproval, ChatStep, MascotProfile } from "../shared/library";
import { BERRY, BERRY_ID, parseMascotDraft } from "../shared/mascots";

// What goes into a cloud job's row and what comes back out, for the app and the runner alike. Plain data, no Electron.
// Everything read from a row is checked again here, whoever wrote it, and a mascot's limits can only come out the same
// or narrower.

const MAX_HISTORY = 40;
const MAX_HISTORY_TEXT = 8000;
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

// Berry is Berry whatever the row says. Anyone else must pass the same checks as a mascot made in the app, or the job
// doesn't run at all, so nothing in a row can lift a limit.
export const mascotFromSnapshot = (input: unknown): MascotProfile | null => {
  const snapshot = (input ?? {}) as Record<string, unknown>;
  if (snapshot.id === BERRY_ID) return BERRY;
  if (typeof snapshot.id !== "string" || !/^[\w-]{1,100}$/.test(snapshot.id)) return null;
  const parsed = parseMascotDraft({ ...snapshot, look: BERRY.look });
  if ("error" in parsed) return null;
  return { ...parsed.draft, id: snapshot.id, deletedAt: null, ...(snapshot.fromGallery === true ? { galleryId: "gallery" } : {}) };
};

// The chat before the newest message, in the words the model got it. Anything else in the row is dropped.
export const historyFromRow = (input: unknown): ReplyMessage[] =>
  (Array.isArray(input) ? input : [])
    .filter((message): message is ReplyMessage => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string")
    .slice(-MAX_HISTORY)
    .map(({ role, content }) => ({ role, content: (content as string).slice(0, MAX_HISTORY_TEXT) }));

export const stepsFromRow = (input: unknown): ChatStep[] =>
  (Array.isArray(input) ? input : [])
    .filter((step) => typeof step?.text === "string")
    .slice(-MAX_STEPS)
    .map((step) => ({ text: String(step.text).slice(0, MAX_STEP_TEXT), done: step.done === true }));

export const actionApprovalFromRow = (input: unknown): ActionApproval => (input === "always" || input === "never" ? input : "risky");

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
