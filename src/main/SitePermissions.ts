import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { PermissionPrompt, SavedSitePermission, SiteDecision, SitePermission } from "../shared/ipc";

// Everything a site can be asked about. Electron's own names go through `ASKED` to reach these.
const SITE_PERMISSIONS: readonly SitePermission[] = [
  "camera", "microphone", "location", "notifications", "midi", "screen", "clipboard-read", "idle-detection",
  "window-management", "local-fonts", "speaker-selection", "local-network", "open-external",
];

const ASKED: Record<string, SitePermission> = {
  geolocation: "location",
  "geolocation-approximate": "location",
  notifications: "notifications",
  midi: "midi",
  midiSysex: "midi",
  "display-capture": "screen",
  "clipboard-read": "clipboard-read",
  "deprecated-sync-clipboard-read": "clipboard-read",
  "idle-detection": "idle-detection",
  "window-management": "window-management",
  "local-fonts": "local-fonts",
  "speaker-selection": "speaker-selection",
  "local-network-access": "local-network",
  "local-network": "local-network",
  "loopback-network": "local-network",
  openExternal: "open-external",
};

// Ordinary parts of the web that reveal nothing, or where the user already answered in a picker of the system's
// own, such as choosing a file. Everything else, including USB, HID, serial, NFC and anything new, is refused.
const ALWAYS_ALLOWED = new Set([
  "fullscreen", "pointerLock", "keyboardLock", "clipboard-sanitized-write", "mediaKeySystem", "storage-access",
  "top-level-storage-access", "fileSystem", "persistent-storage", "background-fetch", "background-sync",
  "periodic-background-sync", "screen-wake-lock", "sensors", "payment-handler",
]);

// Too much to hand over for good, so Allow lasts for one request. Block is still remembered.
const ASK_EVERY_TIME: readonly SitePermission[] = ["screen", "open-external"];

// Null for anything that isn't a real site, such as our own pages, file:, data: and srcdoc frames.
export const siteOrigin = (url: string | undefined): string | null => {
  try {
    const parsed = new URL(url ?? "");
    const origin = parsed.origin;
    return /^https?:\/\//.test(origin) ? origin : null;
  } catch {
    return null;
  }
};

export interface RequestContents {
  getURL(): string;
  on(event: "did-navigate", listener: () => void): unknown;
  once(event: "destroyed", listener: () => void): unknown;
}

interface MediaDetails {
  requestingUrl?: string;
  mediaTypes?: ("video" | "audio")[];
}

interface CheckDetails {
  embeddingOrigin?: string;
  mediaType?: "video" | "audio" | "unknown";
}

interface Pending extends PermissionPrompt {
  // Everything the page asked for. `permissions` is only what's left to ask about, and one of the rest can be
  // blocked from Settings while this waits.
  wanted: SitePermission[];
  contents: RequestContents;
  answers: ((granted: boolean) => void)[];
}

const mediaPermissions = (types: ("video" | "audio")[] | undefined): SitePermission[] => {
  const wanted: SitePermission[] = [];
  if (!types?.length || types.includes("video")) wanted.push("camera");
  if (!types?.length || types.includes("audio")) wanted.push("microphone");
  return wanted;
};

export class SitePermissions {
  private readonly decisions = new Map<string, Map<SitePermission, SiteDecision>>();
  private pending: Pending[] = [];
  private readonly watched = new WeakSet<RequestContents>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        raw.forEach((entry) => this.store(entry?.origin, entry?.permission, entry?.decision));
      }
    } catch {
      // A missing or unreadable file means every site asks again, which is the safe way to fail.
    }
  }

  get saved(): SavedSitePermission[] {
    return [...this.decisions].flatMap(([origin, decisions]) =>
      [...decisions].map(([permission, decision]) => ({ origin, permission, decision }))
    );
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // What Electron calls when a page asks. The answer can wait as long as the user does.
  request(contents: RequestContents, permission: string, details: MediaDetails): Promise<boolean> {
    if (ALWAYS_ALLOWED.has(permission)) return Promise.resolve(true);
    const wanted = permission === "media" ? mediaPermissions(details.mediaTypes) : ASKED[permission] ? [ASKED[permission]] : [];
    const origin = siteOrigin(details.requestingUrl);
    // An embedded frame answers to a different site than the one the user sees, so it never gets to ask.
    if (wanted.length === 0 || !origin || origin !== siteOrigin(contents.getURL())) return Promise.resolve(false);

    const answer = this.answer(origin, wanted);
    if (typeof answer === "boolean") return Promise.resolve(answer);

    return new Promise((resolve) => {
      // An Allow that lasts for one request has to answer exactly one.
      const once = answer.some((name) => ASK_EVERY_TIME.includes(name));
      const same = !once && this.pending.find(
        (entry) => entry.contents === contents && entry.origin === origin && entry.permissions.join() === answer.join()
      );
      if (same) {
        same.answers.push(resolve);
        return;
      }
      this.watch(contents);
      this.pending.push({ id: randomUUID(), origin, wanted, permissions: answer, contents, answers: [resolve] });
      this.notify();
    });
  }

  // What Electron calls to see whether a site already has something. It never prompts, so undecided is no.
  check(contents: Pick<RequestContents, "getURL"> | null, permission: string, requestingOrigin: string, details: CheckDetails): boolean {
    if (ALWAYS_ALLOWED.has(permission)) return true;
    const origin = siteOrigin(requestingOrigin);
    const top = details.embeddingOrigin ?? contents?.getURL();
    if (!origin || (top && siteOrigin(top) !== origin)) return false;
    const wanted =
      permission === "media"
        ? mediaPermissions(details.mediaType === "video" || details.mediaType === "audio" ? [details.mediaType] : undefined)
        : ASKED[permission] ? [ASKED[permission]] : [];
    return wanted.length > 0 && wanted.every((name) => this.decisions.get(origin)?.get(name) === "allow");
  }

  // The first waiting request of the tab. Requests in other tabs wait until the user is looking at them.
  promptFor(contents: RequestContents): PermissionPrompt | null {
    const entry = this.pending.find((candidate) => candidate.contents === contents);
    return entry ? { id: entry.id, origin: entry.origin, permissions: entry.permissions } : null;
  }

  decide(id: string, allow: boolean): boolean {
    const entry = this.pending.find((candidate) => candidate.id === id);
    if (!entry) return false;
    this.pending = this.pending.filter((candidate) => candidate !== entry);
    entry.permissions.forEach((permission) => {
      if (!allow) this.store(entry.origin, permission, "block");
      else if (!ASK_EVERY_TIME.includes(permission)) this.store(entry.origin, permission, "allow");
    });
    entry.answers.forEach((answer) => answer(allow));
    this.save();
    this.settle();
    return true;
  }

  // From Settings. Null forgets the answer, so the site has to ask again.
  set(origin: string, permission: SitePermission, decision: SiteDecision | null): boolean {
    if (decision === null) {
      const decisions = this.decisions.get(origin);
      if (!decisions?.delete(permission)) return false;
      if (decisions.size === 0) this.decisions.delete(origin);
    } else if (!this.store(origin, permission, decision)) {
      return false;
    }
    this.save();
    this.settle();
    return true;
  }

  // Whatever arrives, from disk or a renderer, only valid values get through.
  private store(origin: unknown, permission: unknown, decision: unknown): boolean {
    if (typeof origin !== "string" || siteOrigin(origin) !== origin) return false;
    if (!SITE_PERMISSIONS.includes(permission as SitePermission)) return false;
    if (decision !== "block" && (decision !== "allow" || ASK_EVERY_TIME.includes(permission as SitePermission))) return false;
    const decisions = this.decisions.get(origin) ?? new Map<SitePermission, SiteDecision>();
    decisions.set(permission as SitePermission, decision);
    this.decisions.set(origin, decisions);
    return true;
  }

  // True or false when saved answers settle it, otherwise what's left to ask. One block refuses the whole request,
  // because a page asking for its camera and microphone together gets both or neither.
  private answer(origin: string, wanted: SitePermission[]): boolean | SitePermission[] {
    const decisions = this.decisions.get(origin);
    if (wanted.some((name) => decisions?.get(name) === "block")) return false;
    const undecided = wanted.filter((name) => decisions?.get(name) !== "allow");
    return undecided.length === 0 ? true : undecided;
  }

  // Another prompt or Settings may just have answered what a waiting request wants.
  private settle(): void {
    this.pending = this.pending.filter((entry) => {
      const answer = this.answer(entry.origin, entry.wanted);
      if (typeof answer !== "boolean") {
        entry.permissions = answer;
        return true;
      }
      entry.answers.forEach((resolve) => resolve(answer));
      return false;
    });
    this.notify();
  }

  // A page that's gone can't use an answer, and the next one must not inherit it. Nothing gets saved.
  private watch(contents: RequestContents): void {
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    const refuse = () => {
      const stale = this.pending.filter((entry) => entry.contents === contents);
      if (stale.length === 0) return;
      this.pending = this.pending.filter((entry) => entry.contents !== contents);
      stale.forEach((entry) => entry.answers.forEach((answer) => answer(false)));
      this.notify();
    };
    contents.on("did-navigate", refuse);
    contents.once("destroyed", refuse);
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.saved, null, 2));
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save site permissions:", error);
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
