import { app, safeStorage } from "electron";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { isAiService, looksLikeAiKey, type AiKeyState, type AiKeyTried } from "../../shared/aiKey";
import type { SavedKey } from "../chats/agent";
import { tryAiKey, type TryOutcome } from "./aiKeyTry";

// The user's own AI key, kept as the cloud's key is: encrypted with `safeStorage` in its own file, and never sent back to
// a renderer. Renderers get `state`, the service and the last four characters, and only `agent.ts` reads the key itself,
// through `inUse`. A key is only kept once the service has answered with it. Where this computer can't encrypt, it isn't
// kept at all, as with the cloud's key.

// Where each service makes keys.
export const KEY_PAGES: Record<SavedKey["service"], string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

export class AiKey {
  private saved: SavedKey | null;
  // Counts every try and removal, so only the newest try may save, and never one a removal overtook.
  private generation = 0;

  constructor(
    private readonly file: string,
    private readonly onChange: () => void,
    // A packaged app only ever tries a key at the service's own address.
    private readonly tryKey: (service: SavedKey["service"], key: string) => Promise<TryOutcome> = (service, key) =>
      tryAiKey(service, key, { ownAddressOnly: app.isPackaged }),
  ) {
    this.saved = this.load();
  }

  get state(): AiKeyState {
    return this.saved ? { service: this.saved.service, last4: this.saved.key.slice(-4) } : { service: null, last4: null };
  }

  get inUse(): SavedKey | null {
    return this.saved;
  }

  async try(service: unknown, key: unknown): Promise<{ outcome: AiKeyTried; state: AiKeyState }> {
    const text = typeof key === "string" ? key.trim() : "";
    const answer = (outcome: AiKeyTried) => ({ outcome, state: this.state });
    if (!isAiService(service) || !looksLikeAiKey(service, text)) return answer("not-a-key");
    if (!safeStorage.isEncryptionAvailable()) return answer("not-safe");
    const generation = ++this.generation;
    const outcome = await this.tryKey(service, text);
    if (outcome !== "works" || generation !== this.generation) return answer(outcome);
    if (!this.save({ service, key: text })) return answer("not-saved");
    this.saved = { service, key: text };
    this.onChange();
    return answer("works");
  }

  remove(): AiKeyState {
    this.generation++;
    this.saved = null;
    try {
      rmSync(this.file, { force: true });
    } catch {
      console.error("Couldn't remove the saved AI key.");
    }
    this.onChange();
    return this.state;
  }

  private save({ service, key }: SavedKey): boolean {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ service, key: safeStorage.encryptString(key).toString("base64") }), { mode: 0o600 });
      renameSync(temp, this.file);
      return true;
    } catch {
      console.error("Couldn't save the AI key.");
      return false;
    }
  }

  private load(): SavedKey | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const { service, key } = JSON.parse(readFileSync(this.file, "utf8"));
      if (!isAiService(service) || typeof key !== "string") return null;
      const plain = safeStorage.decryptString(Buffer.from(key, "base64"));
      return looksLikeAiKey(service, plain) ? { service, key: plain } : null;
    } catch {
      return null;
    }
  }
}
