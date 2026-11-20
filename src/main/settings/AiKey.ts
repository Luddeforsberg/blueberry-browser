import { app, safeStorage } from "electron";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { isAiService, looksLikeAiKey, type AiKeyState, type AiKeyTried } from "../../shared/aiKey";
import type { SavedKey } from "../chats/agent";
import { Latest } from "../../shared/lateWork";
import { tryAiKey, type TryOutcome } from "./aiKeyTry";

// The user's own AI key, kept as the cloud's key is: encrypted with `safeStorage` in its own file, and never sent back to
// a renderer. Renderers get `state`, the service and the last four characters, and only `agent.ts` reads the key itself,
// through `inUse`. A key is only kept once the service has answered with it. Where this computer can't encrypt, it isn't
// kept at all, as with the cloud's key. There's one for the app, made with the stores, and each window listens to it, so a
// try started in a window that has closed since still loses to anything newer in the next one.

// Where each service makes keys.
export const KEY_PAGES: Record<SavedKey["service"], string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

export class AiKey {
  private saved: SavedKey | null;
  // Only the newest try may save, and never one a removal overtook.
  private readonly tries = new Latest();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly file: string,
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

  // Hears every change to the saved key, until the function it gives back is called.
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }

  async try(service: unknown, key: unknown): Promise<{ outcome: AiKeyTried; state: AiKeyState }> {
    // Taken first, so the newest submission owns the outcome even when it isn't a key at all.
    const turn = this.tries.next();
    const text = typeof key === "string" ? key.trim() : "";
    const answer = (outcome: AiKeyTried) => ({ outcome, state: this.state });
    if (!isAiService(service) || !looksLikeAiKey(service, text)) return answer("not-a-key");
    if (!safeStorage.isEncryptionAvailable()) return answer("not-safe");
    const outcome = await this.tryKey(service, text);
    if (!turn.current) return answer("overtaken");
    if (outcome !== "works") return answer(outcome);
    if (!this.save({ service, key: text })) return answer("not-saved");
    this.saved = { service, key: text };
    this.changed();
    return answer("works");
  }

  remove(): AiKeyState {
    this.tries.end();
    this.saved = null;
    try {
      rmSync(this.file, { force: true });
    } catch {
      console.error("Couldn't remove the saved AI key.");
    }
    this.changed();
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
      const { service, key } = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>;
      if (!isAiService(service) || typeof key !== "string") return null;
      const plain = safeStorage.decryptString(Buffer.from(key, "base64"));
      return looksLikeAiKey(service, plain) ? { service, key: plain } : null;
    } catch {
      return null;
    }
  }
}
