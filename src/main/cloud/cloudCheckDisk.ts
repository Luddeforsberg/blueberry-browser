// The cloud's files as the model checker reads them, apart from the app's own code: what's sealed, what each file
// holds, and whether a session can still be found from them.
import type { Setup } from "./cloudCheckApp";
import { entriesOf, fieldsOf } from "../../shared/fields";
import type { CloudWorld } from "./cloudWorldTesting";

export type Files = Setup["disk"]["files"];
export const KEY_FILE = "cloud.json";
export const SESSIONS_FILE = "cloud-sessions.json";

// What a sealed value is once the keychain that sealed it has gone.
export const DAMAGED = "ZGFtYWdlZA==";

// As the fake `safeStorage` in cloudLifetime.test.ts seals a key.
export const seal = (text: string) => Buffer.from(`sealed:${text}`).toString("base64");
export const unseal = (value: unknown) => {
  const text = typeof value === "string" ? Buffer.from(value, "base64").toString() : "";
  return text.startsWith("sealed:") ? text.slice("sealed:".length) : null;
};
export const read = (files: Files, name: string) => {
  try {
    return fieldsOf(JSON.parse(files.get(name) ?? ""));
  } catch {
    return {};
  }
};
// The handles saved, and the one session an app before this one kept in the key's file, for that key's project.
const handlesIn = (files: Files): Record<string, unknown>[] => {
  const { entries } = entriesOf(read(files, SESSIONS_FILE).handles, (one) => fieldsOf(one));
  const { sessionId, projectId } = read(files, KEY_FILE);
  const project = unseal(projectId);
  return typeof sessionId === "string" && project ? [...entries, { id: sessionId, by: `browserbase:${project}` }] : entries;
};

// What the app couldn't read, so the user may let it go by forgetting the key: everything in a file it couldn't read, a
// session from before whose project or key doesn't open, and a handle whose key doesn't, by id and tag, and Contexts by id.
export const unreadableIn = (files: Files, unread: Set<string>): string[] => {
  const saved = read(files, KEY_FILE);
  const kept = read(files, SESSIONS_FILE);
  const keys = fieldsOf(kept.keys);
  const { entries } = entriesOf(kept.handles, (one) => fieldsOf(one));
  const sealedAway = (one: Record<string, unknown>) => typeof one.keyId === "string" && !unseal(fieldsOf(keys[one.keyId]).apiKey);
  const lost = entries.filter((one) => unread.has(SESSIONS_FILE) || sealedAway(one));
  const before = unread.has(KEY_FILE) || !unseal(saved.projectId) || !unseal(saved.apiKey) ? [saved.sessionId] : [];
  const contexts = unread.has(SESSIONS_FILE) ? Object.values(fieldsOf(kept.contexts)) : [];
  const contextBefore = unread.has(KEY_FILE) || !unseal(saved.projectId) ? [saved.contextId] : [];
  return [...lost.flatMap((one) => [one.id, one.tag]), ...before, ...contexts, ...contextBefore].filter(
    (one): one is string => typeof one === "string",
  );
};

// Each Context saved, with the project it's kept for.
export const contextsIn = (files: Files): [string, string][] => {
  const kept = Object.entries(read(files, SESSIONS_FILE).contexts ?? {}).flatMap(([by, id]): [string, string][] =>
    typeof id === "string" ? [[id, by.replace(/^browserbase:/, "")]] : [],
  );
  const { contextId, projectId } = read(files, KEY_FILE);
  const project = unseal(projectId);
  return typeof contextId === "string" && project ? [...kept, [contextId, project]] : kept;
};

// Whether a session can still be found from what's saved, by its id or the tag it was asked for with, through the
// provider and project that made it.
export const findable = (files: Files, world: CloudWorld, id: string): boolean => {
  const tag = world.tagOf(id);
  const by = `browserbase:${world.projectOf(id)}`;
  return handlesIn(files).some((one) => one.by === by && (one.id === id || (tag !== undefined && one.tag === tag)));
};

// What's saved at the start of a run: a key, sealed.
export const FIRST = (): Files => new Map([[KEY_FILE, JSON.stringify({ apiKey: seal("key-0"), projectId: seal("proj") })]]);
