import type { WebContents } from "electron";
import type { OwnMenuItem } from "../menus/ownMenu";
import { clearMemoryWords, deleteMascotWords, deleteRoutineWords } from "./routineNotices";
import { sendToRenderer } from "./ipc";
import { finite } from "./Panels";
import { isMac } from "./windowFrame";
import type { ChromeRegion, MenuAnchor } from "../../shared/ipc";
import type { PublishResult } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { bestEffort } from "../library/savedFile";
import type { WindowParts, WindowStores } from "./WindowParts";

// The menus the window opens from its views, and the questions it asks before deleting something or after something
// went wrong, all drawn by its own menu view.
export class WindowMenus {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  // A menu opened from a view, at its button or at the pointer, in the window. The chrome fills the window, and the
  // overlay is wherever it is now.
  openMenu(items: OwnMenuItem[], anchor: unknown, from: ChromeRegion, label: string, onClosed?: () => void): void {
    const { x, y, width, height } = (anchor ?? {}) as Record<string, unknown>;
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width < 0 || height < 0) return onClosed?.();
    const origin = from === "overlay" ? this.w.overlayView.view.getBounds() : { x: 0, y: 0 };
    const at: MenuAnchor = { x: origin.x + x, y: origin.y + y, width, height };
    this.w.menus.open(items, at, { label, mac: isMac(), onClosed });
  }

  showChatMenu(chatId: string, anchor: unknown, from: ChromeRegion): Promise<"rename" | null> {
    if (!this.w.chats.thread(chatId)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const items: OwnMenuItem[] = [
        { label: "Rename", icon: "rename", click: () => resolve("rename") },
        { type: "separator" },
        { label: "Delete…", icon: "delete", danger: true, click: () => void this.confirmDeleteChat(chatId) },
      ];
      this.openMenu(items, anchor, from, "Chat", () => resolve(null));
    });
  }

  private async confirmDeleteChat(chatId: string): Promise<void> {
    const chat = this.w.chats.thread(chatId);
    if (!chat) return;
    const yes = await this.w.menus.ask({
      question: `Delete “${chat.title}”?`,
      detail: "This chat will be permanently removed from this computer.",
      action: "Delete",
      mascot: null,
    });
    if (!yes || !this.w.chats.delete(chatId)) return;

    // Closing the last tab closes the window, and deleting a chat shouldn't do that.
    const tabs = this.w.tabs.chatTabs(chatId);
    if (tabs.length === this.w.tabs.tabCount) this.w.tabs.openPage("new-tab");
    this.w.tabs.closedTabs = this.w.tabs.closedTabs.filter((tab) => tab.page !== "chat" || tab.pageParam !== chatId);
    tabs.forEach((tab) => this.w.tabs.closeTab(tab.id, false));
    sendToRenderer(this.w.chromeView.view.webContents, "chat:deleted", chatId);
  }

  async confirmDeleteRoutine(id: string): Promise<boolean> {
    const routine = this.w.routines.list().find((candidate) => candidate.id === id);
    if (!routine || !(await this.w.menus.ask(deleteRoutineWords(routine.name)))) return false;
    return this.w.routines.delete(id);
  }

  async confirmUnpublish(id: string): Promise<PublishResult> {
    const yes = await this.w.menus.ask({
      question: "Take this mascot out of the Gallery?",
      detail:
        "Its public page and its count go. Your own mascot stays, and so do copies other people have already added, because nothing here can reach them.",
      action: "Unpublish",
      mascot: null,
    });
    return yes ? this.w.gallery.unpublish(id) : { ok: false, error: "" };
  }

  // Its routines pause rather than move to Berry, which could do more than the user set them up to.
  async confirmDeleteMascot(id: string): Promise<boolean> {
    const mascot = this.stores.mascotStore.find(id);
    if (!mascot || mascot.id === BERRY.id || mascot.deletedAt !== null) return false;
    const runs = this.w.routines.list().filter((routine) => routine.mascotId === id);
    const words = deleteMascotWords(mascot, runs.length, Boolean(mascot.publishedId), !this.w.settings.showBerry);
    if (!(await this.w.menus.ask(words))) return false;
    if (!this.stores.mascotStore.delete(id)) return false;
    bestEffort(this.w.memory.clear(id), "The deleted mascot's remembered facts are still on file.");
    runs.forEach((routine) => this.w.routines.setPaused(routine.id, true));
    this.w.library.mascotsChanged();
    return true;
  }

  async confirmClearMemory(mascotId: string): Promise<boolean> {
    const count = this.w.memory.factsOf(mascotId).length;
    if (count === 0 || !(await this.w.menus.ask(clearMemoryWords(this.w.library.mascotName(mascotId), count)))) return false;
    return this.w.memory.clear(mascotId);
  }

  showBerryMenu(anchor: unknown): void {
    const { keepBerryStill, showBerry } = this.w.settings;
    const items: OwnMenuItem[] = [
      {
        label: "Keep Berry Still",
        type: "checkbox",
        checked: keepBerryStill,
        click: () => this.w.settingsChanges.updateSettings({ keepBerryStill: !keepBerryStill }),
      },
      {
        label: "Hide Berry",
        type: "checkbox",
        checked: !showBerry,
        click: () => this.w.settingsChanges.updateSettings({ showBerry: !showBerry }),
      },
    ];
    this.openMenu(items, anchor, "chrome", "Berry");
  }

  // A warning with only OK, over the window once its chrome has drawn, as at startup.
  async notice(question: string, detail: string): Promise<void> {
    await Promise.all([this.w.chromeView.view.webContents, this.w.menus.chromeView.view.webContents].map(loaded));
    if (!this.w.baseWindow.isDestroyed()) await this.w.menus.notice(question, detail);
  }
}

const loaded = (contents: WebContents): Promise<void> =>
  contents.isDestroyed() || !contents.isLoading()
    ? Promise.resolve()
    : new Promise((resolve) => contents.once("did-finish-load", () => resolve()));
