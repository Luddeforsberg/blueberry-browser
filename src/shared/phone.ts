import { fieldsOf } from "./fields";
import type { MascotProfile } from "./library";
import { BERRY, BERRY_ID, parseMascotDraft } from "./mascots";

// The mascots on their way to the phone and back. The app shares each mascot's name, look and limits, never what it remembers,
// and the phone sends a job as one of them with the same snapshot the app would. Plain data, used by the app and, bundled
// into site/shared.js, by the phone page, so both read a row the same way.

const MAX_SHARED_MASCOTS = 100;

export interface SharedMascotRow {
  id: string;
  name: string;
  palette: string;
  accessory: string;
  instructions: string;
  sites: string[];
  tools: string[];
  from_gallery: boolean;
}

// What the app shares: every mascot but Berry, which the phone always has, and none that's been deleted.
export const sharedMascotRows = (mascots: readonly MascotProfile[]): SharedMascotRow[] =>
  mascots
    .filter((mascot) => mascot.id !== BERRY_ID && mascot.deletedAt === null)
    .slice(0, MAX_SHARED_MASCOTS)
    .map(({ id, name, look, instructions, sites, tools, galleryId }) => ({
      id,
      name,
      palette: look.palette,
      accessory: look.accessory,
      instructions,
      sites: [...sites],
      tools: [...tools],
      from_gallery: !!galleryId,
    }));

// What the phone reads back: Berry first, then each row that passes the same checks as a mascot made in the app. Anything
// else is left out, so a mascot can only be sent as what the app would have sent.
export const mascotsFromSharedRows = (rows: unknown): [MascotProfile, ...MascotProfile[]] => {
  const mascots: [MascotProfile, ...MascotProfile[]] = [BERRY];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { id, name, palette, accessory, instructions, sites, tools, from_gallery: fromGallery } = fieldsOf(row);
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id) || id === BERRY_ID || mascots.some((mascot) => mascot.id === id)) continue;
    const parsed = parseMascotDraft({ name, look: { palette, accessory }, instructions, sites, tools });
    if ("error" in parsed) continue;
    mascots.push({ ...parsed.draft, id, deletedAt: null, ...(fromGallery === true ? { galleryId: "gallery" } : {}) });
  }
  return mascots;
};

// The mascot a job is sent as, at the moment it was sent, in the shape `mascotFromSnapshot` checks on the runner. Its look
// stays on the computer.
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

// --- Conversations ---
// A follow-up is a new job in the same conversation, carrying the messages before it, the same from the app and the phone.

export const MAX_HISTORY = 40;
const MAX_HISTORY_TEXT = 8000;
// Under the row's limit of 100,000 bytes, with room for the JSON around each message.
const MAX_HISTORY_BYTES = 90_000;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// The model sees what a mascot did earlier by notes of its steps, never by the pages, which aren't kept.
export const asHistoryMessage = ({
  role,
  content,
  steps,
}: {
  role: "user" | "assistant";
  content: string;
  steps?: readonly { text: string }[];
}): HistoryMessage => ({
  role,
  content: steps?.length ? `<steps>\n${steps.map((step) => `- ${step.text}`).join("\n")}\n</steps>\n\n${content}` : content,
});

const bytes = (text: string) => new TextEncoder().encode(text).length;

// Only the user's and the mascot's messages, newest kept, each cut to length, and dropped from the oldest until it fits.
export const fitHistory = (input: unknown): HistoryMessage[] => {
  const messages = (Array.isArray(input) ? input : [])
    .filter((message: unknown): message is HistoryMessage => {
      const { role, content } = fieldsOf(message);
      return (role === "user" || role === "assistant") && typeof content === "string";
    })
    .slice(-MAX_HISTORY)
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_HISTORY_TEXT) }));
  while (messages.length > 0 && bytes(JSON.stringify(messages)) > MAX_HISTORY_BYTES) messages.shift();
  return messages;
};

export interface ConversationJob {
  id: string;
  conversation_id?: string | null;
  created_at: string;
  history?: unknown;
  prompt: string;
  reply?: string;
  steps?: unknown;
}

// What the next message in a conversation carries: the history of the job before it, then that job's prompt and what
// came of it, as the app saves a runner chat's reply. A job with neither words nor steps left nothing to say.
export const followUpHistory = (last: ConversationJob): HistoryMessage[] => {
  const steps = (Array.isArray(last.steps) ? last.steps : []).filter(
    (step: unknown): step is { text: string } => typeof fieldsOf(step).text === "string",
  );
  const reply = typeof last.reply === "string" ? last.reply : "";
  return fitHistory([
    ...fitHistory(last.history),
    { role: "user", content: last.prompt },
    ...(reply || steps.length ? [asHistoryMessage({ role: "assistant", content: reply, steps })] : []),
  ]);
};

const conversationIdOf = (job: Pick<ConversationJob, "id" | "conversation_id">): string => job.conversation_id || job.id;

// One per conversation, the newest first, each with its jobs in their turns, the latest last, as the server decides which
// job a follow-up must be built on. A job from before conversations is one alone.
export const conversationsOf = <T extends ConversationJob & { turn: number }>(
  jobs: readonly T[],
): { id: string; jobs: [T, ...T[]]; latest: T }[] => {
  const groups = new Map<string, [T, ...T[]]>();
  for (const job of [...jobs].sort((a, b) => a.turn - b.turn)) {
    const id = conversationIdOf(job);
    const before = groups.get(id);
    groups.set(id, before ? [...before, job] : [job]);
  }
  return [...groups]
    .map(([id, grouped]) => ({ id, jobs: grouped, latest: grouped.at(-1)! }))
    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
};

// --- Jobs as the phone page reads them ---
// Every row is read as the signed-in user, and still checked here, so the page only ever draws the shape below.

export type PhoneJobStatus = "queued" | "running" | "waiting" | "done" | "failed" | "stopped";
const STATUSES: readonly PhoneJobStatus[] = ["queued", "running", "waiting", "done", "failed", "stopped"];
const isStatus = (value: unknown): value is PhoneJobStatus => STATUSES.some((status) => status === value);

export interface PhoneStep {
  text: string;
  done: boolean;
  kind: string | null;
}

// What a waiting job asks, from `my_cloud_jobs`, under the job's own id.
export interface PhoneAsk {
  id: string;
  approval_id: string;
  approval_kind: "approval" | "question" | "handoff";
  approval_text: string;
  approval_need: string | null;
  approval_site: string | null;
  approval_asked_at: string | null;
}

export interface PhoneJob extends ConversationJob {
  conversation_id: string | null;
  // Its place in its conversation, from 1, given by the server.
  turn: number;
  updated_at: string;
  status: PhoneJobStatus;
  // Who it runs as, by id and name only: its look and limits are the phone's own mascot's.
  mascot: { id: string; name: string };
  steps: PhoneStep[];
  reply: string;
  error: string | null;
  live_view_url: string | null;
  context_id: string | null;
  history?: unknown;
  ask: PhoneAsk | null;
}

const textOr = <T>(value: unknown, otherwise: T): string | T => (typeof value === "string" ? value : otherwise);

// A row the page can't place in a conversation is left out. Anything else that isn't what it should be reads as
// nothing: a status the page doesn't know as stopped, and only steps with words, done only when they say so.
export const phoneJobFromRow = (input: unknown): PhoneJob | null => {
  const row = fieldsOf(input);
  const { id, prompt, created_at: createdAt, status, mascot, steps, history, turn } = row;
  if (typeof id !== "string" || typeof prompt !== "string" || typeof createdAt !== "string") return null;
  if (typeof turn !== "number" || !Number.isInteger(turn) || turn < 1) return null;
  const who = fieldsOf(mascot);
  return {
    id,
    conversation_id: textOr(row.conversation_id, null),
    turn,
    prompt,
    created_at: createdAt,
    updated_at: textOr(row.updated_at, createdAt),
    status: isStatus(status) ? status : "stopped",
    mascot: { id: textOr(who.id, ""), name: textOr(who.name, "") },
    // Every one, since a follow-up's history notes them all. The server holds a job to 500.
    steps: (Array.isArray(steps) ? steps : []).flatMap((step: unknown) => {
      const { text, done, kind } = fieldsOf(step);
      return typeof text === "string" ? [{ text, done: done === true, kind: textOr(kind, null) }] : [];
    }),
    reply: textOr(row.reply, ""),
    error: textOr(row.error, null),
    live_view_url: textOr(row.live_view_url, null),
    context_id: textOr(row.context_id, null),
    ...(history === undefined ? {} : { history }),
    ask: null,
  };
};

// An ask with no id can't be answered, so it isn't one. A kind the page doesn't know asks for an OK, as the app does.
export const phoneAskFromRow = (input: unknown): PhoneAsk | null => {
  const row = fieldsOf(input);
  const { id, approval_id: approvalId, approval_kind: kind } = row;
  if (typeof id !== "string" || typeof approvalId !== "string") return null;
  return {
    id,
    approval_id: approvalId,
    approval_kind: kind === "question" || kind === "handoff" ? kind : "approval",
    approval_text: textOr(row.approval_text, ""),
    approval_need: textOr(row.approval_need, null),
    approval_site: textOr(row.approval_site, null),
    approval_asked_at: textOr(row.approval_asked_at, null),
  };
};
