import { powerMonitor } from "electron";
import { notifyNeedsYou } from "./routineNotices";
import { sendToRenderer } from "./ipc";
import type { MascotSaveResult } from "../../shared/ipc";
import type { LibrarySnapshot, NeedsYouItem } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import type { WindowParts, WindowStores } from "./WindowParts";

// How long with no input before the phone gets what's waiting, even with the window in front.
const AWAY_AFTER_IDLE_SECONDS = 60;

// What the sidebar and pages show, sent to the views whenever it changes, and a notification for anything newly waiting
// on the user when they aren't here to see it.
export class LibraryUpdates {
  // What Needs you held last time, so only something new gets a notification.
  private knownWaiting = new Set<string>();

  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  get needsYou(): NeedsYouItem[] {
    const routines = this.w.routines.list();
    return this.w.chats.waiting().map(({ chatTitle, ...waiting }) => {
      const routine = routines.find(({ latestRun }) => latestRun?.id === waiting.id);
      return { ...waiting, job: chatTitle ?? routine?.name ?? "A job", routineId: routine?.id ?? null };
    });
  }

  publishLibrary(): void {
    // A reply stopped by the window closing ends after the window has gone.
    if (this.w.baseWindow.isDestroyed()) return;
    const snapshot = this.librarySnapshot;
    const known = this.knownWaiting;
    this.knownWaiting = new Set(snapshot.needsYou.map(({ approval }) => approval.id));
    // The mascot on the desktop says so instead, and it isn't one more thing to clear.
    if (!this.userIsBusyOrHere && !this.w.settings.desktopBerry) {
      snapshot.needsYou
        .filter(({ approval }) => !known.has(approval.id))
        .forEach(({ approval, mascotId }) => {
          notifyNeedsYou(this.mascotName(mascotId), approval, () => {
            this.w.show();
            this.w.focus();
            this.w.tabs.openPage("needs-you", { param: approval.id });
          });
        });
    }
    this.w.broadcast("library:updated", snapshot);
    this.w.phone.sync();
    this.w.desktopBerry.libraryChanged(snapshot);
  }

  publishSuggestions(): void {
    sendToRenderer(this.w.chromeView.view.webContents, "suggestions:updated", this.w.suggestions.list());
  }

  mascotName(mascotId: string): string {
    const mascot = this.stores.mascotStore.resolve(mascotId);
    return mascot.id === BERRY.id && !this.w.settings.showBerry ? "Assistant" : mascot.name;
  }

  get librarySnapshot(): LibrarySnapshot {
    return {
      pinned: this.stores.pinnedStore.get(),
      bookmarks: this.stores.bookmarkStore.get(),
      chats: this.stores.chatStore
        .summaries()
        .map((chat) => ({ ...chat, running: this.w.chats.isRunning(chat.id), cloud: this.w.chats.inCloud(chat.id) })),
      routines: this.w.routines.list(),
      mascots: this.stores.mascotStore.all(),
      needsYou: this.needsYou,
      memory: this.w.memory.state,
    };
  }

  saveMascot(id: string | null, draft: unknown): MascotSaveResult {
    const result = this.stores.mascotStore.save(id, draft);
    if (result.ok) this.mascotsChanged();
    return result;
  }

  async addFromGallery(galleryId: string, version: string, name: string | null): Promise<MascotSaveResult> {
    const result = this.w.gallery.add(galleryId, version, name);
    if (result.ok) this.mascotsChanged();
    return result;
  }

  mascotsChanged(): void {
    this.w.broadcast("library:updated", this.librarySnapshot);
    void this.w.runnerJobs.mascotsChanged();
    // A mascot's limits go with its routines in the cloud.
    void this.w.runnerJobs.routinesChanged();
  }

  // In the app already, or somewhere a notification would interrupt: fullscreen, or anything playing sound.
  get userIsBusyOrHere(): boolean {
    const window = this.w.baseWindow;
    return (
      window.isFocused() || window.isFullScreen() || this.w.tabs.allTabs.some((tab) => tab.existingView?.webContents.isCurrentlyAudible())
    );
  }

  // The window isn't in front, or nobody has touched the computer for a little while. So nothing buzzes on someone
  // reading the page, and a job asking during lunch gets through even with the window left in front.
  get userIsAway(): boolean {
    return this.w.settings.phoneAlways || !this.w.baseWindow.isFocused() || powerMonitor.getSystemIdleTime() >= AWAY_AFTER_IDLE_SECONDS;
  }
}
