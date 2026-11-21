import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { safeStorage } from "electron";
import { entriesOf, fieldsOf } from "../../shared/fields";
import { browserbaseOrigin } from "./browserbase";
import { NO_IDS, type CloudIds, type Handle } from "./cloudProvider";

// What Settings > Cloud keeps, in two files that only CloudTabs reads or writes. `cloud.json` has the Browserbase key and
// project id, sealed with `safeStorage`. `cloud-sessions.json` beside it has each project's Context and a handle for every
// session that may still be running, in plain text, with the key each was made with, sealed, while a handle names it.
// Nothing that saves a key writes it, so a key that can't be opened, or a new one, never takes them along. An app before
// this one kept its one session and Context in `cloud.json`, and still does if it's opened again, so they're brought over
// on every launch, with the key beside them, and taken out of there only once the sessions' file has them. A file that's
// there but can't be read is never taken as empty: nothing is written that launch unless the user forgets the key.

export const MAX_FIELD_LENGTH = 200;
// A sealed key is longer than the key, by more on Windows.
const MAX_SEALED_LENGTH = 4096;
// A session saved by an app before this one began within its hour, as every one was asked for with an hour.
const OLD_SESSION_MS = 70 * 60_000;

export interface Key {
  apiKey: string | null;
  projectId: string | null;
}

export const NO_KEY: Key = { apiKey: null, projectId: null };

// A key sessions were made with, by the id their handles name it with: as sealed, the provider and project it's for, and
// opened, or null where it can't be.
export interface KeptKey {
  sealed: string;
  by: string;
  apiKey: string | null;
}

export type KeptKeys = Record<string, KeptKey>;

export interface CloudFiles {
  key: Key;
  // What could be read, even when something couldn't.
  ids: CloudIds;
  keys: KeptKeys;
  // `cloud.json` has a session or Context from an app before this one, to take out once the sessions' file has it.
  fromBefore: boolean;
  // The projects the one list of sign-ins from before there was one per project may be in: the one whose Context came
  // from `cloud.json`, which is the last an app before this one brought sites into, or else every project with a Context,
  // since a site listed where it isn't signed in does no harm and one missing where it is does. Null while the files
  // can't be read, so nothing is decided until they can.
  oldLoginsIn: string[] | null;
  // A file that's there couldn't be read, or what an app before this one kept couldn't be opened, so neither file may be
  // written, and no session started, this launch, unless the user forgets the key.
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
const sealedText = (value: unknown) => (typeof value === "string" && value.length <= MAX_SEALED_LENGTH ? value : null);

export const seal = (value: string): string => safeStorage.encryptString(value).toString("base64");

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
  const { tag, id, by, until, keyId } = fieldsOf(value);
  const [tagText, byText, idText] = [text(tag), text(by), id === null ? null : text(id)];
  if (!tagText || !byText || (id !== null && !idText) || typeof until !== "number" || !Number.isFinite(until)) return null;
  return { tag: tagText, id: idText, by: byText, keyId: text(keyId), until };
};

const keysOf = (fields: Record<string, unknown> | null | undefined): KeptKeys =>
  Object.fromEntries(
    Object.entries(fieldsOf(fields?.keys)).flatMap(([id, value]) => {
      const { apiKey, by } = fieldsOf(value);
      const [idText, sealed, byText] = [text(id), sealedText(apiKey), text(by)];
      return idText && sealed && byText ? [[idText, { sealed, by: byText, apiKey: opened(sealed) ?? null }] as const] : [];
    }),
  );

// The id a key is kept under for `by`: one already kept for the same key, or `otherwise`.
const keyIdOf = (keys: KeptKeys, key: KeptKey, otherwise: string): string =>
  Object.entries(keys).find(
    ([, one]) => one.by === key.by && (one.sealed === key.sealed || (key.apiKey !== null && one.apiKey === key.apiKey)),
  )?.[0] ?? otherwise;

// Every handle the file has, however many, since dropping one could leave a paid session nothing can end.
const idsOf = (fields: Record<string, unknown> | null | undefined): CloudIds => {
  if (!fields) return NO_IDS;
  const contexts = Object.entries(fieldsOf(fields.contexts)).flatMap(([origin, id]) => {
    const [originText, idText] = [text(origin), text(id)];
    return originText && idText ? [[originText, idText] as const] : [];
  });
  return { contexts: Object.fromEntries(contexts), handles: entriesOf(fields.handles, handleOf).entries };
};

const NOTHING_BEFORE = { ids: NO_IDS, keys: {} };

// What an app before this one kept in `cloud.json`, for its project, with the key it was kept with. Undefined when
// there's some but its project can't be opened, since then nothing could say whose it is.
const fromBefore = (
  { contextId, sessionId, projectId, apiKey }: Record<string, unknown>,
  keys: KeptKeys,
): { ids: CloudIds; keys: KeptKeys } | undefined => {
  const [context, session, sealed] = [text(contextId), text(sessionId), sealedText(apiKey)];
  if (!context && !session) return NOTHING_BEFORE;
  const project = opened(projectId);
  if (!project) return undefined;
  const by = browserbaseOrigin(project);
  const key = sealed ? { sealed, by, apiKey: opened(sealed) ?? null } : null;
  const keyId = session && key ? keyIdOf(keys, key, `before-${session}`) : null;
  return {
    ids: {
      contexts: context ? { [by]: context } : {},
      handles: session ? [{ tag: `before-${session}`, id: session, by, keyId, until: Date.now() + OLD_SESSION_MS }] : [],
    },
    keys: keyId && key ? { [keyId]: keys[keyId] ?? key } : {},
  };
};

// Both files. One that's there but can't be read, or a session from before whose project can't be opened, leaves
// `unreadable` set, with what could be read. A Context from before is newer than the one kept here, since it's taken out
// of `cloud.json` once it's kept, and a session from before is added unless it's kept already.
export const readCloud = (keyFile: string): CloudFiles => {
  const saved = fieldsIn(keyFile);
  const kept = fieldsIn(sessionsFile(keyFile));
  const key = saved ? { apiKey: opened(saved.apiKey) ?? null, projectId: opened(saved.projectId) ?? null } : NO_KEY;
  // A key that can't be opened is no key at all.
  const usable = key.apiKey && key.projectId ? key : NO_KEY;
  const ids = idsOf(kept);
  const keys = keysOf(kept);
  const before = saved ? fromBefore(saved, keys) : NOTHING_BEFORE;
  const known = new Set(ids.handles.map(({ id }) => id));
  const all = before
    ? {
        contexts: { ...ids.contexts, ...before.ids.contexts },
        handles: [...ids.handles, ...before.ids.handles.filter(({ id }) => !known.has(id))],
      }
    : ids;
  const unreadable = saved === undefined || kept === undefined || !before;
  const contextBefore = Object.keys(before?.ids.contexts ?? {})[0];
  return {
    key: usable,
    ids: all,
    keys: { ...keys, ...before?.keys },
    fromBefore: !!before && before !== NOTHING_BEFORE,
    oldLoginsIn: unreadable ? null : contextBefore ? [contextBefore] : Object.keys(all.contexts),
    unreadable,
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
  try {
    return writeJson(file, { apiKey: apiKey && seal(apiKey), projectId: projectId && seal(projectId) });
  } catch {
    console.error("Couldn't save the cloud settings.");
    return false;
  }
};

// With the keys the handles name, as they were sealed, whether or not they can be opened now.
export const writeCloudIds = (file: string, { contexts, handles }: CloudIds, keys: KeptKeys): boolean => {
  const named = new Set(handles.flatMap(({ keyId }) => (keyId ? [keyId] : [])));
  const kept = Object.entries(keys).flatMap(([id, { sealed, by }]) => (named.has(id) ? [[id, { apiKey: sealed, by }] as const] : []));
  return writeJson(file, { contexts, handles, keys: Object.fromEntries(kept) });
};

// Takes out of `cloud.json` what an app before this one kept there, once the sessions' file has it. The key stays as it
// was sealed, so nothing here has to open it.
export const forgetBefore = (keyFile: string): boolean => {
  const saved = fieldsIn(keyFile);
  if (!saved) return false;
  return writeJson(keyFile, { apiKey: saved.apiKey ?? null, projectId: saved.projectId ?? null });
};
