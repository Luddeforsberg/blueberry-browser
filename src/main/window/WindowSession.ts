import { InternalTab } from "../tabs/InternalTab";
import { Tab } from "../tabs/Tab";
import type { SavedTab, Session } from "../tabs/Session";
import type { WindowParts, WindowStores } from "./WindowParts";

// The open tabs and panels, saved soon after each change and brought back at the next launch.
export class WindowSession {
  windowClosed = false;
  // Kept here because a closed window, which is when this is saved last, can't be asked.
  private windowSize = { width: 0, height: 0 };

  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  noteSize(): void {
    this.windowSize = this.w.baseWindow.getBounds();
  }

  restoreSession({ tabs, active, sidebarOpen, chatOpen }: Session): void {
    this.w.panels.sidebarOpen = sidebarOpen;
    this.w.panels.chatOpen = chatOpen;
    const ids = tabs.map((saved) => this.w.tabs.restoreTab(saved));
    const open = ids.filter((id) => id !== null);
    if (open.length === 0) this.w.tabs.createTab();
    else this.w.tabs.switchActiveTab(ids[active] ?? open[0]);
  }

  get currentSession(): Session | null {
    if (this.w.settings.onStartup !== "restore") return null;
    const { width, height } = this.windowSize;
    // A chat's or routine's own tabs last as long as its work, so they aren't the user's to get back.
    const entries = this.w.tabs.entries.filter(
      (tab) => !this.w.tabs.isBackground(tab.id) && !(tab instanceof InternalTab && tab.page === "cloud"),
    );
    return {
      tabs: entries.map((tab): SavedTab => (tab instanceof Tab ? tab.saved : { page: tab.page, param: tab.param, title: tab.title })),
      active: entries.findIndex((tab) => tab.id === this.w.tabs.activeId),
      sidebarOpen: this.w.panels.sidebarOpen,
      chatOpen: this.w.panels.chatOpen,
      width,
      height,
    };
  }

  saveSessionSoon(): void {
    if (!this.windowClosed) this.stores.sessionStore.saveSoon(() => this.currentSession);
  }
}
