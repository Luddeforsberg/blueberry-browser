import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { safeStorage } from "electron";
import type { CloudIds } from "./cloudProvider";

// Where Settings > Cloud keeps the Browserbase key and project id, sealed with `safeStorage`, and the ids of the
// Context and session it last had. Only CloudTabs reads or writes it.

export const MAX_FIELD_LENGTH = 200;

export interface Saved extends CloudIds {
  apiKey: string | null;
  projectId: string | null;
}

export const EMPTY: Saved = { apiKey: null, projectId: null, contextId: null, sessionId: null };

export const readCloudFile = (file: string): Saved => {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const open = (value: unknown) =>
      typeof value === "string" && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : null;
    const text = (value: unknown) => (typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null);
    return {
      apiKey: open(saved.apiKey),
      projectId: open(saved.projectId),
      contextId: text(saved.contextId),
      sessionId: text(saved.sessionId),
    };
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
    const { apiKey, projectId, contextId, sessionId } = saved;
    writeFileSync(temp, JSON.stringify({ apiKey: seal(apiKey), projectId: seal(projectId), contextId, sessionId }), { mode: 0o600 });
    renameSync(temp, file);
    return true;
  } catch {
    console.error("Couldn't save the cloud settings.");
    return false;
  }
};
