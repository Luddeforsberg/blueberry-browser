import type { RunnerProgress } from "../chats/Chats";
import type { GalleryServer } from "../account/galleryServer";
import type { CloudJobStatus, CloudRoutineRow } from "./cloudJobs";
import type { RunnerState } from "../../shared/ipc";
import type { ChatStep, MascotProfile } from "../../shared/library";

// What the parts of RunnerJobs share: a chat's entry, the hooks into the app, and `RunnerParts`, which only RunnerJobs
// makes, holding its state and the checks every call to the server goes through.

const FAILED = "The job failed in the cloud.";

export interface Entry {
  // The account that sent it, by email. Only that account, signed in, sees anything of it.
  account: string;
  // The conversation its jobs are in, which the phone shows as one too.
  conversationId: string;
  // Every job of it this chat already has, so one sent from elsewhere can be told apart.
  jobIds: string[];
  // The newest job. Null while it's being sent.
  jobId: string | null;
  // Stopped or deleted while it was being sent, which is done as soon as its id comes back.
  cancel: "stop" | "forget" | null;
  active: boolean;
  status: CloudJobStatus;
  steps: ChatStep[];
  reply: string;
  error: string | null;
  liveView: string | null;
  approval: RunnerProgress["approval"];
}

export interface RunnerJobsHooks {
  changed: (chatId: string) => void;
  finished: (chatId: string, result: { reply: string; steps: ChatStep[]; error: string | null }) => void;
  // The user's Browserbase Context, so the sites they brought along are signed in there too.
  contextId: () => string | null;
  runnerUpdated?: (state: RunnerState) => void;
  // The mascots, shared with the phone page while a linked runner has accepted, so a job can be sent from there as any mascot.
  mascots?: () => MascotProfile[];
  // A conversation started elsewhere becomes a chat here, as the mascot its first job ran as. Says the chat's id.
  adopt?: (first: { prompt: string; mascotId: string | null }) => string | null;
  // A message sent in that chat from elsewhere, saved as the user's.
  followedUp?: (chatId: string, prompt: string) => void;
  // The routines that run in the cloud, as rows for it, kept there while a linked runner has accepted. Null leaves the
  // cloud's alone, neither sent nor forgotten.
  routines?: () => CloudRoutineRow[] | null;
  // The id of every routine here, in the cloud or not. Only those, and ones sent from here, are ever taken away there.
  routineIds?: () => string[];
  // What `stillInCloud` or `cloudFailed` says about a routine changed.
  routinesSettled?: () => void;
}

export const fresh = ({
  account,
  conversationId,
  jobIds,
  jobId,
  active,
}: {
  account: string;
  conversationId: string;
  jobIds: string[];
  jobId: string | null;
  active: boolean;
}): Entry => ({
  account,
  conversationId,
  jobIds,
  jobId,
  cancel: null,
  active,
  status: "queued",
  steps: [],
  reply: "",
  error: null,
  liveView: null,
  approval: null,
});

export type NewJob = Record<string, unknown> & { id: string; prompt: string };

// A conversation's jobs, oldest first, that this chat doesn't have yet.
export const newJobs = (rows: Record<string, unknown>[], known: string[]): NewJob[] =>
  rows.filter((row): row is NewJob => typeof row.id === "string" && typeof row.prompt === "string" && !known.includes(row.id));

// How a job that's over ended, as the chat says it.
export const endError = (status: CloudJobStatus, error: string | null): string | null =>
  status === "failed" ? (error ?? FAILED) : status === "stopped" ? error : null;

export interface RunnerParts {
  server: GalleryServer | null;
  hooks: RunnerJobsHooks;
  entries: Map<string, Entry>;
  // Conversations deleted here, newest last.
  forgotten: string[];
  // Approvals answered here and on their way.
  answered: Set<string>;
  pollMs: number;
  signedIn: () => string | null;
  mine: (entry: Entry | undefined) => entry is Entry;
  available: () => boolean;
  link: () => { email: string; accepted: boolean; relayUrl: string | null } | null;
  destroyed: () => boolean;
  withToken: <T>(account: string, call: (token: string) => Promise<T>) => Promise<T | null>;
  save: () => void;
  schedule: () => void;
}
