import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { fresh, type Entry } from "./runnerTypes";

// The file of ids RunnerJobs keeps: which chat is which conversation and has which of its jobs, the conversations deleted
// here, and the routines that may be in the cloud.

// Conversations deleted here, kept so a slow delete on the server can't bring one back as a chat started elsewhere.
export const MAX_FORGOTTEN = 500;

interface RunnerSaved {
  entries: Map<string, Entry>;
  forgotten: string[];
  routinesThere: Set<string>;
}

export const loadRunnerJobs = (file: string, { entries, forgotten, routinesThere }: RunnerSaved): void => {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100;
    Object.entries(saved?.chats ?? {}).forEach(([chatId, value]) => {
      const { account, jobId, active, conversationId, jobIds } = (value ?? {}) as Record<string, unknown>;
      if (typeof account !== "string" || (jobId !== null && !id(jobId))) return;
      const known = Array.isArray(jobIds) ? jobIds.filter(id) : id(jobId) ? [jobId] : [];
      // A chat saved before conversations is one under its job's id, which is what the server makes of it too.
      const conversation = id(conversationId) ? conversationId : id(jobId) ? jobId : null;
      if (conversation)
        entries.set(
          chatId,
          fresh({
            account,
            conversationId: conversation,
            jobIds: known,
            jobId: id(jobId) ? jobId : null,
            active: id(jobId) && active === true,
          }),
        );
    });
    if (Array.isArray(saved?.forgotten)) forgotten.push(...saved.forgotten.filter(id).slice(-MAX_FORGOTTEN));
    if (Array.isArray(saved?.routinesInCloud))
      saved.routinesInCloud
        .filter(id)
        .slice(0, 100)
        .forEach((key: string) => routinesThere.add(key));
  } catch {
    // Nothing sent there yet.
  }
};

export const saveRunnerJobs = (file: string, { entries, forgotten, routinesThere }: RunnerSaved): void => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const chats = Object.fromEntries(
      [...entries]
        .filter(([, entry]) => entry.jobIds.length > 0)
        .map(([chatId, { account, conversationId, jobIds, jobId, active }]) => [
          chatId,
          { account, conversationId, jobIds, jobId, active: active && !!jobId },
        ]),
    );
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify({ chats, forgotten, routinesInCloud: [...routinesThere] }));
    renameSync(temp, file);
  } catch {
    console.error("Couldn't save which chats are on the runner.");
  }
};
