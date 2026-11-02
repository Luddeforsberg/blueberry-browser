import type { MascotProfile } from "./library";
import { BERRY, BERRY_ID, parseMascotDraft } from "./mascots";

// The flock on its way to the phone and back. The app shares each bird's name, look and limits, never what it remembers,
// and the phone sends a job as one of them with the same snapshot the app would. Plain data, used by the app and, bundled
// into site/shared.js, by the phone page, so both read a row the same way.

export const MAX_SHARED_BIRDS = 100;

export interface FlockRow {
  id: string;
  name: string;
  palette: string;
  accessory: string;
  instructions: string;
  sites: string[];
  tools: string[];
  from_gallery: boolean;
}

// What the app shares: every bird but Berry, which the phone always has, and none that's been deleted.
export const flockRows = (mascots: readonly MascotProfile[]): FlockRow[] =>
  mascots
    .filter((mascot) => mascot.id !== BERRY_ID && mascot.deletedAt === null)
    .slice(0, MAX_SHARED_BIRDS)
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
// else is left out, so a bird can only be sent as what the app would have sent.
export const flockFromRows = (rows: unknown): MascotProfile[] => {
  const birds: MascotProfile[] = [BERRY];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { id, name, palette, accessory, instructions, sites, tools, from_gallery: fromGallery } = (row ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id) || id === BERRY_ID || birds.some((bird) => bird.id === id)) continue;
    const parsed = parseMascotDraft({ name, look: { palette, accessory }, instructions, sites, tools });
    if ("error" in parsed) continue;
    birds.push({ ...parsed.draft, id, deletedAt: null, ...(fromGallery === true ? { galleryId: "gallery" } : {}) });
  }
  return birds;
};

// The bird a job is sent as, in the shape the app sends and `mascotFromSnapshot` checks on the runner.
export const snapshotOf = ({ id, name, instructions, sites, tools, galleryId }: MascotProfile) => ({
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
export const MAX_HISTORY_TEXT = 8000;
// Under the row's limit of 100,000 bytes, with room for the JSON around each message.
const MAX_HISTORY_BYTES = 90_000;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// The model sees what a bird did earlier by notes of its steps, never by the pages, which aren't kept.
export const asHistoryMessage = ({ role, content, steps }: { role: "user" | "assistant"; content: string; steps?: readonly { text: string }[] }): HistoryMessage => ({
  role,
  content: steps?.length ? `<steps>\n${steps.map((step) => `- ${step.text}`).join("\n")}\n</steps>\n\n${content}` : content,
});

const bytes = (text: string) => new TextEncoder().encode(text).length;

// Only the user's and the bird's messages, newest kept, each cut to length, and dropped from the oldest until it fits.
export const fitHistory = (input: unknown): HistoryMessage[] => {
  const messages = (Array.isArray(input) ? input : [])
    .filter((message): message is HistoryMessage => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string")
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
  const steps = (Array.isArray(last.steps) ? last.steps : []).filter((step): step is { text: string } => typeof step?.text === "string");
  const reply = typeof last.reply === "string" ? last.reply : "";
  return fitHistory([
    ...fitHistory(last.history),
    { role: "user", content: last.prompt },
    ...(reply || steps.length ? [asHistoryMessage({ role: "assistant", content: reply, steps })] : []),
  ]);
};

export const conversationIdOf = (job: Pick<ConversationJob, "id" | "conversation_id">): string => job.conversation_id || job.id;

// One per conversation, the newest first, each with its jobs oldest first. A job from before conversations is one alone.
export const conversationsOf = <T extends ConversationJob>(jobs: readonly T[]): { id: string; jobs: T[]; latest: T }[] => {
  const groups = new Map<string, T[]>();
  for (const job of [...jobs].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const id = conversationIdOf(job);
    groups.set(id, [...(groups.get(id) ?? []), job]);
  }
  return [...groups]
    .map(([id, grouped]) => ({ id, jobs: grouped, latest: grouped.at(-1)! }))
    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
};
