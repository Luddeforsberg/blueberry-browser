import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { safeStorage } from "electron";
import { entriesOf, fieldsOf } from "../../shared/fields";
import { browserbaseOrigin } from "./browserbase";
import { NO_IDS, type CloudIds, type Handle } from "./cloudProvider";

// What Settings > Cloud keeps, in two files that only CloudTabs reads or writes. `cloud.json` has the Browserbase key and
// project id, sealed with `safeStorage`. `cloud-sessions.json` beside it has each project's Context and a handle for every
// session that may still be running, in plain text, and nothing that saves a key writes it, so a key that can't be
// opened, or a new one, never takes them along. An app before this one kept its one session and Context in `cloud.json`,
// and still does if it's opened again, so they're brought over on every launch, and taken out of there only once the
// sessions' file has them. A file that's there but can't be read is never taken as empty: nothing is written that launch.

export const MAX_FIELD_LENGTH = 200;
// A session saved by an app before this one began within its hour, as every one was asked for with an hour.
const OLD_SESSION_MS = 70 * 60_000;

export interface Key {
  apiKey: string | null;
  projectId: string | null;
}

export const NO_KEY: Key = { apiKey: null, projectId: null };

export interface CloudFiles {
  key: Key;
  ids: CloudIds;
  // `cloud.json` has a session or Context from an app before this one, to take out once the sessions' file has it.
  fromBefore: boolean;
  // A file that's there couldn't be read, or what an app before this one kept couldn't be opened, so neither file may be
  // written, and no session started, this launch.
  unreadable: boolean;
}

export const sessionsFile = (keyFile: string): string => join(dirname(keyFile), "cloud-sessions.json");

const text = (value: unknown) => (typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null);
// Throws if it can't be opened.
const open = (value: unknown) =>
  typeof value === "string" && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : null;
const opened = (value: unknown): string | null | undefined => {
  try {
    return open(value);
  } catch {
    return undefined;
  }
};

// A file's fields, null when it isn't there, and undefined when it's there but couldn't be read as an object.
const fieldsIn = (file: string): Record<string, unknown> | null | undefined => {
  if (!existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? fieldsOf(value) : undefined;
  } catch {
    return undefined;
  }
};

const handleOf = (value: unknown): Handle | null => {
  const { tag, id, by, until } = fieldsOf(value);
  const [tagText, byText, idText] = [text(tag), text(by), id === null ? null : text(id)];
  if (!tagText || !byText || (id !== null && !idText) || typeof until !== "number" || !Number.isFinite(until)) return null;
  return { tag: tagText, id: idText, by: byText, until };
};

// Every handle the file has, however many, since dropping one could leave a paid session nothing can end.
const idsOf = (fields: Record<string, unknown> | null | undefined): CloudIds => {
  if (!fields) return NO_IDS;
  const contexts = Object.entries(fieldsOf(fields.contexts)).flatMap(([origin, id]) => {
    const [originText, idText] = [text(origin), text(id)];
    return originText && idText ? [[originText, idText] as const] : [];
  });
  return { contexts: Object.fromEntries(contexts), handles: entriesOf(fields.handles, handleOf).entries };
};

// What an app before this one kept in `cloud.json`, for its project. Undefined when there's some but its project can't
// be opened, since then nothing could say whose it is.
const fromBefore = ({ contextId, sessionId, projectId }: Record<string, unknown>): CloudIds | undefined => {
  const [context, session] = [text(contextId), text(sessionId)];
  if (!context && !session) return NO_IDS;
  const project = opened(projectId);
  if (!project) return undefined;
  const by = browserbaseOrigin(project);
  return {
    contexts: context ? { [by]: context } : {},
    handles: session ? [{ tag: `before-${session}`, id: session, by, until: Date.now() + OLD_SESSION_MS }] : [],
  };
};

// Both files. One that's there but can't be read, or a session from before whose project can't be opened, leaves
// `unreadable` set. A Context from before is newer than the one kept here, since it's taken out of `cloud.json` once it's
// kept, and a session from before is added unless it's kept already.
export const readCloud = (keyFile: string): CloudFiles => {
  const saved = fieldsIn(keyFile);
  const kept = fieldsIn(sessionsFile(keyFile));
  const key = saved ? { apiKey: opened(saved.apiKey) ?? null, projectId: opened(saved.projectId) ?? null } : NO_KEY;
  // A key that can't be opened is no key at all.
  const usable = key.apiKey && key.projectId ? key : NO_KEY;
  const ids = idsOf(kept);
  const before = saved ? fromBefore(saved) : NO_IDS;
  if (saved === undefined || kept === undefined || !before) return { key: usable, ids, fromBefore: false, unreadable: true };
  const known = new Set(ids.handles.map(({ id }) => id));
  return {
    key: usable,
    ids: {
      contexts: { ...ids.contexts, ...before.contexts },
      handles: [...ids.handles, ...before.handles.filter(({ id }) => !known.has(id))],
    },
    fromBefore: before !== NO_IDS,
    unreadable: false,
  };
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

export const writeCloudIds = (file: string, { contexts, handles }: CloudIds): boolean => writeJson(file, { contexts, handles });

// Takes out of `cloud.json` what an app before this one kept there, once the sessions' file has it. The key stays as it
// was sealed, so nothing here has to open it.
export const forgetBefore = (keyFile: string): boolean => {
  const saved = fieldsIn(keyFile);
  if (!saved) return false;
  return writeJson(keyFile, { apiKey: saved.apiKey ?? null, projectId: saved.projectId ?? null });
};
