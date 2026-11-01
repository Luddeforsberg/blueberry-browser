import type { WebContents } from "electron";
import { sendToRenderer } from "./ipc";
import { DRAFT_PROMPT, draftFromReply, plainDraft, Trail, trailAddress, trailForModel } from "./recordingTrail";
import { finishWatching, nextNotes } from "./recorderScript";
import type { RecordedDraftResult, RecordingState } from "../shared/library";
import type { Tab } from "./Tab";

// Past this it stops by itself, so a recording nobody remembers doesn't go on watching.
const MAX_RECORDING_MS = 30 * 60_000;
// A stuck page doesn't get to hold up Stop.
const FINISH_MS = 500;

interface RecordingsDeps {
  chrome: () => WebContents;
  // The web tab in front, or null on one of our own pages, which are never watched.
  activeTab: () => Tab | null;
  openReview: () => void;
  closeReview: () => void;
  hasModel: () => boolean;
  write: (system: string, data: string) => Promise<string>;
}

interface Watched {
  // Each new page starts this again, and an answer from an older one is ignored.
  page: number;
  listening: boolean;
  ended: boolean;
  stopListening: () => void;
}

// Showing Berry something: everything between pressing start and pressing Stop, and nothing else. Only the tab in front is
// watched, and only while no job is using it, so this is only ever the user's own doing. It's all in memory until it's
// confirmed on the review screen and sent, and then it's gone from here. No tool or mascot has any way to reach this class.
export class Recordings {
  private status: RecordingState["status"] = "idle";
  private trail = new Trail();
  private startedAt: number | null = null;
  private cut: RecordingState["cut"] = null;
  private error: string | null = null;
  private readonly watched = new Map<Tab, Watched>();
  private current: Tab | null = null;
  // One of our own pages is in front, so whatever the last tab does now, the user isn't doing it.
  private onOurPage = false;
  // The address bar was used on this tab, so the next page's query may be a search typed there.
  private fromAddressBar: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  // Throwing the trail away while it's being written up means that answer has nowhere to go.
  private drafting = 0;
  private stopping = false;

  constructor(private readonly deps: RecordingsDeps) {}

  get state(): RecordingState {
    const { status, startedAt, cut, error } = this;
    return { status, startedAt, steps: this.trail.steps, cut, error };
  }

  get isRecording(): boolean {
    return this.status === "recording";
  }

  private publish(): void {
    sendToRenderer(this.deps.chrome(), "recording:updated", this.state);
  }

  start(): boolean {
    if (this.isRecording) return false;
    // An earlier trail still being gone through goes now, along with its page.
    this.deps.closeReview();
    this.drafting++;
    this.trail = new Trail();
    this.status = "recording";
    this.startedAt = Date.now();
    this.cut = null;
    this.error = null;
    this.current = null;
    this.onOurPage = false;
    this.timer = setTimeout(() => void this.stop("time"), MAX_RECORDING_MS);
    const tab = this.deps.activeTab();
    this.sync();
    // Where it starts from is where the job starts from.
    if (tab) this.trail.went(tab.url, { now: Date.now() });
    this.publish();
    return true;
  }

  // Any change of tabs comes through here. A tab first seen now gets watched, and going to one that's already there is a
  // step. Going to one of our own pages and back isn't anything.
  sync(): void {
    if (!this.isRecording || this.stopping) return;
    const tab = this.deps.activeTab();
    this.onOurPage = !tab;
    if (!tab || tab === this.current) return;
    this.current = tab;
    if (!this.watched.has(tab)) this.watch(tab);
    // A brand new tab says where it went once it's there.
    if (tab.hasLoaded && this.trail.steps.length > 0) this.trail.switched(tab.url);
    this.publish();
  }

  private watch(tab: Tab): void {
    const contents = tab.webContents;
    let opening = !tab.hasLoaded;
    const moved = (_: unknown, url: string, isMainFrame = true) => {
      if (!isMainFrame) return;
      const fromAddressBar = this.fromAddressBar === tab.id;
      this.fromAddressBar = null;
      if (this.counts(tab) && !this.stopping) this.trail.went(url, { fromAddressBar, newTab: opening && this.trail.steps.length > 0, now: Date.now() });
      opening = false;
      this.publish();
      this.limitReached();
    };
    const entry: Watched = { page: 0, listening: false, ended: false, stopListening: () => {} };
    const newPage = (_: unknown, url: string) => {
      moved(_, url);
      entry.page++;
      entry.listening = false;
      if (!entry.ended) void this.listen(tab, entry);
    };
    const ready = () => {
      if (!entry.listening && !entry.ended) void this.listen(tab, entry);
    };
    contents.on("did-navigate", newPage);
    contents.on("did-navigate-in-page", moved);
    contents.on("dom-ready", ready);
    entry.stopListening = () => {
      entry.ended = true;
      if (contents.isDestroyed()) return;
      contents.off("did-navigate", newPage);
      contents.off("did-navigate-in-page", moved);
      contents.off("dom-ready", ready);
    };
    this.watched.set(tab, entry);
    if (!contents.isLoading()) void this.listen(tab, entry);
  }

  // The only tab that counts is the one in front, with the user on it. Berry's own input is real input too, so nothing
  // on a tab a job is using can count, and neither does anything from a tab held for a sign-in.
  private counts(tab: Tab): boolean {
    return this.isRecording && tab === this.current && !this.onOurPage && !tab.berryWorking && !tab.heldForUser;
  }

  // Asks the page, which answers whenever the user next does something. The next page ends this by never answering.
  private async listen(tab: Tab, entry: Watched): Promise<void> {
    const { page } = entry;
    entry.listening = true;
    for (;;) {
      let notes: unknown;
      try {
        notes = await tab.listenInPage(nextNotes);
      } catch {
        if (entry.page === page) entry.listening = false;
        return;
      }
      if (!Array.isArray(notes)) return;
      this.take(tab, notes);
      // Asking again is what starts the watching in a page, so it mustn't happen once it's over.
      if (entry.page !== page || entry.ended) return;
    }
  }

  private take(tab: Tab, notes: unknown[]): void {
    if (!this.counts(tab)) return;
    const address = trailAddress(tab.url);
    if (!address) return;
    const frames = () => tab.webContents.mainFrame.framesInSubtree.map(({ url }) => trailAddress(url)?.host);
    notes.forEach((note) => this.trail.note(note, address.site, Date.now(), (host) => frames().includes(host.replace(/^www\./, ""))));
    this.publish();
    this.limitReached();
  }

  private limitReached(): void {
    if (this.isRecording && this.trail.full) void this.stop("full");
  }

  // Only the address bar comes through `Window.navigateTab`.
  addressBarUsed(tabId: string): void {
    if (this.isRecording) this.fromAddressBar = tabId;
  }

  async stop(cut: RecordingState["cut"] = null): Promise<void> {
    if (!this.isRecording || this.stopping) return;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tabs = [...this.watched.entries()];
    // Whatever's still in a field goes in the notes, before the status changes and they stop counting.
    await Promise.all(
      tabs.map(async ([tab, entry]) => {
        entry.stopListening();
        const left = await Promise.race([tab.listenInPage(finishWatching).catch(() => []), new Promise((resolve) => setTimeout(() => resolve([]), FINISH_MS))]);
        this.take(tab, Array.isArray(left) ? left : []);
      })
    );
    this.watched.clear();
    this.current = null;
    this.stopping = false;
    this.status = "review";
    this.cut = cut;
    this.publish();
    this.deps.openReview();
  }

  removeStep(id: unknown): void {
    if (this.status !== "review" || typeof id !== "string") return;
    this.trail.remove(id);
    this.publish();
  }

  // Also for the review tab closing: going away from it doesn't leave the trail lying around.
  discard(): void {
    this.drafting++;
    if (this.isRecording) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.watched.forEach((entry, tab) => {
        entry.stopListening();
        void tab.listenInPage(finishWatching).catch(() => []);
      });
      this.watched.clear();
    }
    this.status = "idle";
    this.trail = new Trail();
    this.startedAt = null;
    this.cut = null;
    this.error = null;
    this.publish();
  }

  // The one place anything leaves. Sites come from the trail in `draftFromReply`, whatever the model says.
  async draft(): Promise<RecordedDraftResult> {
    if (this.status !== "review") return { ok: false, error: "There’s nothing here to write up." };
    const { steps } = this.trail;
    if (steps.length === 0) return { ok: false, error: "There’s nothing left to write up." };
    const attempt = ++this.drafting;
    this.status = "drafting";
    this.error = null;
    this.publish();
    let draft = plainDraft(steps);
    if (this.deps.hasModel()) {
      try {
        const reply = await this.deps.write(DRAFT_PROMPT, JSON.stringify(trailForModel(steps)));
        draft = draftFromReply(reply, steps);
      } catch (error) {
        // It's all still here, and they can try again. The reason is printed rather than shown, as it can be long.
        console.error("Failed to write up a recording:", error);
        if (attempt === this.drafting) {
          this.status = "review";
          this.error = "I couldn’t reach the model. Nothing was saved, so you can try again.";
          this.publish();
        }
        return { ok: false, error: this.error ?? "" };
      }
    }
    if (attempt !== this.drafting) return { ok: false, error: "" };
    this.discard();
    return { ok: true, draft };
  }

  destroy(): void {
    this.drafting++;
    if (this.timer) clearTimeout(this.timer);
    this.watched.clear();
  }
}
