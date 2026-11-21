import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import { browserbaseOrigin } from "./browserbase";
import { seal, type KeptKey, type KeptKeys, type Key } from "./cloudFile";
import type { CloudBrowser, Handle } from "./cloudProvider";

// The keys the cloud's sessions were made with, so each is ended with its own key whatever key is used now, and a new
// key never has to wait for an old one's sessions. One for each key and project, by an id of its own, sealed with
// `safeStorage`, and written beside the handles only while one names it. No key leaves main, or goes anywhere but to the
// provider.

const PREFIX = browserbaseOrigin("");

export class CloudKeys {
  private readonly browsers = new Map<string, CloudBrowser | null>();

  constructor(
    private keys: KeptKeys,
    // The browser a key makes.
    private readonly provider: (key: Key) => CloudBrowser | null,
  ) {}

  get all(): KeptKeys {
    return this.keys;
  }

  // The keys the file holds, read again as a launch reads them, in place of what's kept.
  load(keys: KeptKeys): void {
    this.keys = keys;
    this.browsers.clear();
  }

  // The browser for `key`, carrying the id its sessions' handles name its key by, where it's Browserbase's own.
  browserOf(key: Key): CloudBrowser | null {
    const made = this.provider(key);
    const keyId = made && made.origin === (key.projectId && browserbaseOrigin(key.projectId)) ? this.idFor(key) : null;
    return made && keyId ? { ...made, keyId } : made;
  }

  // The browser for the key a handle was made with, or null where it isn't kept or can't be opened.
  browserFor({ keyId, by }: Handle): CloudBrowser | null {
    if (keyId === null) return null;
    if (!this.browsers.has(keyId)) {
      const kept = this.keys[keyId];
      const made = kept?.apiKey && kept.by === by ? this.provider({ apiKey: kept.apiKey, projectId: by.slice(PREFIX.length) }) : null;
      this.browsers.set(keyId, made?.origin === by ? { ...made, keyId } : null);
    }
    return this.browsers.get(keyId) ?? null;
  }

  // Whether a handle names a key that can't be opened, as after the system's keychain changed, or isn't kept at all.
  unopenable({ keyId }: Handle): boolean {
    return keyId !== null && !this.keys[keyId]?.apiKey;
  }

  // The id for this key and project: the one it's kept under already, or a new one, sealed now. Null where it can't be
  // sealed, even after the system said it could.
  private idFor({ apiKey, projectId }: Key): string | null {
    if (!apiKey || !projectId || !safeStorage.isEncryptionAvailable()) return null;
    const by = browserbaseOrigin(projectId);
    const known = Object.entries(this.keys).find(([, one]) => one.by === by && one.apiKey === apiKey);
    if (known) return known[0];
    let sealed: string;
    try {
      sealed = seal(apiKey);
    } catch {
      return null;
    }
    const id = randomUUID();
    this.keys = { ...this.keys, [id]: { sealed, by, apiKey } satisfies KeptKey };
    return id;
  }
}
