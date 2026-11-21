import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { safeStorage } from "electron";
import { entriesOf, fieldsOf } from "../../shared/fields";
import { browserbaseOrigin } from "./browserbase";
import { NO_IDS, type CloudIds, type Handle } from "./cloudProvider";

// What Settings > Cloud keeps, in two files that only CloudTabs reads or writes. `cloud.json` has the Browserbase key and
// project id, sealed with `safeStorage`. `cloud-sessions.json` beside it has the Context's id and a handle for every
// session that may still be running, in plain text, and nothing that saves a key writes it, so a key that can't be
// opened, or a new one, never takes them along.

export const MAX_FIELD_LENGTH = 200;
// A session saved before handles had a deadline began within its hour, as every one was asked for with an hour.
const OLD_SESSION_MS = 70 * 60_000;

export interface Key {
  apiKey: string | null;
  projectId: string | null;
}

export const NO_KEY: Key = { apiKey: null, projectId: null };

export const sessionsFile = (keyFile: string): string => join(dirname(keyFile), "cloud-sessions.json");

const text = (value: unknown) => (typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null);
// Throws if it can't be opened.
const open = (value: unknown) =>
  typeof value === "string" && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : null;
const readJson = (file: string): Record<string, unknown> => fieldsOf(JSON.parse(readFileSync(file, "utf8")));

// No key if it can't be read or opened. The sessions' file is untouched either way.
export const readCloudKey = (file: string): Key => {
  try {
    const { apiKey, projectId } = readJson(file);
    return { apiKey: open(apiKey), projectId: open(projectId) };
  } catch {
    return NO_KEY;
  }
};

const handleOf = (value: unknown): Handle | null => {
  const { tag, id, by, until } = fieldsOf(value);
  const [tagText, byText, idText] = [text(tag), text(by), id === null ? null : text(id)];
  if (!tagText || !byText || (id !== null && !idText) || typeof until !== "number" || !Number.isFinite(until)) return null;
  return { tag: tagText, id: idText, by: byText, until };
};

// Every handle the file has, however many, since dropping one could leave a paid session nothing can end. `moved` says
// they came from the key's file, where an app before this one kept them, and are to be saved in their own.
export const readCloudIds = (file: string, keyFile: string): { ids: CloudIds; moved: boolean } => {
  if (!existsSync(file)) return { ids: idsFromBefore(keyFile), moved: true };
  try {
    const { contextId, handles } = readJson(file);
    return { ids: { contextId: text(contextId), handles: entriesOf(handles, handleOf).entries }, moved: false };
  } catch {
    return { ids: NO_IDS, moved: false };
  }
};

// The Context, and the one session by its id, from the key's file of an app before this one. A session whose project
// can't be opened has no key that could end it, and ends within its hour.
const idsFromBefore = (keyFile: string): CloudIds => {
  try {
    const { contextId, sessionId, projectId } = readJson(keyFile);
    const id = text(sessionId);
    const project = (() => {
      try {
        return open(projectId);
      } catch {
        return null;
      }
    })();
    const by = project ? browserbaseOrigin(project) : null;
    return { contextId: text(contextId), handles: id && by ? [{ tag: `before-${id}`, id, by, until: Date.now() + OLD_SESSION_MS }] : [] };
  } catch {
    return NO_IDS;
  }
};

// False if it couldn't be saved.
const writeJson = (file: string, value: object): boolean => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    renameSync(temp, file);
    return true;
  } catch {
    console.error("Couldn't save the cloud settings.");
    return false;
  }
};

export const writeCloudKey = (file: string, { apiKey, projectId }: Key): boolean => {
  const seal = (value: string | null) => value && safeStorage.encryptString(value).toString("base64");
  try {
    return writeJson(file, { apiKey: seal(apiKey), projectId: seal(projectId) });
  } catch {
    console.error("Couldn't save the cloud settings.");
    return false;
  }
};

export const writeCloudIds = (file: string, { contextId, handles }: CloudIds): boolean => writeJson(file, { contextId, handles });
