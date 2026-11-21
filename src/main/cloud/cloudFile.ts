import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { safeStorage } from "electron";
import { browserbaseOrigin } from "./browserbase";
import { NO_IDS, type CloudIds, type Handle } from "./cloudProvider";

// Where Settings > Cloud keeps the Browserbase key and project id, sealed with `safeStorage`, the id of the Context it
// last had, and a handle for every session that may still be running. Only CloudTabs reads or writes it.

export const MAX_FIELD_LENGTH = 200;
// More than any run of failed asks, so none is dropped, but a damaged file can't grow without end.
const MAX_HANDLES = 100;
// A session saved before handles had a deadline began within its hour, as every one was asked for with an hour.
const OLD_SESSION_MS = 70 * 60_000;

export interface Saved extends CloudIds {
  apiKey: string | null;
  projectId: string | null;
}

export const EMPTY: Saved = { apiKey: null, projectId: null, ...NO_IDS };

export const readCloudFile = (file: string): Saved => {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const open = (value: unknown) =>
      typeof value === "string" && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : null;
    const text = (value: unknown) => (typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null);
    const handle = (value: unknown): Handle[] => {
      const { tag, id, by, until } = (value ?? {}) as Record<string, unknown>;
      const [tagText, byText, idText] = [text(tag), text(by), id === null ? null : text(id)];
      if (!tagText || !byText || (id !== null && !idText) || typeof until !== "number" || !Number.isFinite(until)) return [];
      return [{ tag: tagText, id: idText, by: byText, until }];
    };
    const apiKey = open(saved.apiKey);
    const projectId = open(saved.projectId);
    const handles = Array.isArray(saved.handles) ? saved.handles.flatMap(handle).slice(0, MAX_HANDLES) : [];
    // A file from before handles had only Browserbase's session in it, by its id.
    const old = text(saved.sessionId);
    if (old && projectId && !Array.isArray(saved.handles))
      handles.push({ tag: `before-${old}`, id: old, by: browserbaseOrigin(projectId), until: Date.now() + OLD_SESSION_MS });
    return { apiKey, projectId, contextId: text(saved.contextId), handles };
  } catch {
    return EMPTY;
  }
};

// False if it couldn't be saved.
export const writeCloudFile = (file: string, saved: Saved): boolean => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const seal = (value: string | null) => value && safeStorage.encryptString(value).toString("base64");
    const temp = `${file}.tmp`;
    const { apiKey, projectId, contextId, handles } = saved;
    writeFileSync(temp, JSON.stringify({ apiKey: seal(apiKey), projectId: seal(projectId), contextId, handles }), { mode: 0o600 });
    renameSync(temp, file);
    return true;
  } catch {
    console.error("Couldn't save the cloud settings.");
    return false;
  }
};
