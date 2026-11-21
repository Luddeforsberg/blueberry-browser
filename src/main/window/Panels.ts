import type { Tab } from "../tabs/Tab";
import { InternalTab } from "../tabs/InternalTab";
import { computeLayout, type Layout } from "./Layout";
import { sendToRenderer } from "./ipc";
import type { Popover } from "../../shared/ipc";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";
import { fieldsOf } from "../../shared/fields";

// What's open around the page, the sidebar, the chat panel and what floats over the page in the overlay view, and where
// that puts every view in the window.
export class Panels {
  private floatingSidebarVisible = false;
  // What's open over the page from the horizontal toolbar, in the overlay view. Null when nothing is.
  private popover: Popover | null = null;
  sidebarOpen = true;
  chatOpen = false;
  // The chat the chat panel has, which the chrome tells us, since a panel chat has no tab to be in front.
  private panelChatId: string | null = null;
  private readonly tabsUnderChrome = new WeakSet<Tab>();

  constructor(
    private readonly w: WindowParts,
    private readonly stores: AppStores,
  ) {}

  isChatInFront(chatId: string): boolean {
    const entry = this.w.tabs.activeEntry;
    return (entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId) || this.panelChatShowing === chatId;
  }

  // Null while the panel is closed or has no place, as on the new tab.
  private get panelChatShowing(): string | null {
    return this.chatOpen && this.chatAvailable ? this.panelChatId : null;
  }

  seePanelChat(): void {
    const chatId = this.panelChatShowing;
    if (chatId) this.w.app.chats.markSeen(chatId);
  }

  panelShows(chatId: string | null): void {
    this.panelChatId = chatId;
    this.seePanelChat();
  }

  // Puts the text in the panel's composer and leaves sending to the user.
  askBerryAbout(text: string): void {
    this.chatOpen = true;
    this.updateAllBounds();
    this.w.chromeView.view.webContents.focus();
    sendToRenderer(this.w.chromeView.view.webContents, "chat:draft", text);
  }

  toggleSidebar(): void {
    this.hideFloatingSidebar();
    this.sidebarOpen = !this.layout.sidebarOpen;
    this.updateAllBounds();
    this.w.session.saveSessionSoon();
  }

  // Chats or a mascot's card, opened from the horizontal toolbar. A tab's view covers the chrome, so they're drawn in the
  // overlay view, which takes everything under the toolbar's own row: a press anywhere in it outside the panel closes it.
  openPopover(request: unknown): void {
    const area = this.layout.popover;
    const popover = validPopover(request);
    if (area.width === 0 || !popover) return;
    this.hideFloatingSidebar();
    this.popover = popover;
    // Adding a view again moves it to the top, above tabs opened since.
    this.w.baseWindow.contentView.addChildView(this.w.overlayView.view);
    this.w.overlayView.view.setBounds(area);
    this.w.overlayView.view.setVisible(true);
    this.w.overlayView.view.webContents.focus();
    this.w.broadcast("overlay:popover", { shown: popover, refocus: false });
  }

  // With `refocus`, the keyboard goes back to what opened it, as after Escape.
  closePopover(refocus: boolean): void {
    if (!this.popover) return;
    this.popover = null;
    this.w.overlayView.view.setVisible(false);
    if (refocus) this.w.chromeView.view.webContents.focus();
    this.w.broadcast("overlay:popover", { shown: null, refocus });
  }

  showFloatingSidebar(): void {
    const { floatingSidebar } = this.layout;
    if (floatingSidebar.width === 0) return;
    // Adding a view again moves it to the top, above tabs opened since.
    this.w.baseWindow.contentView.addChildView(this.w.overlayView.view);
    this.w.overlayView.view.setBounds(floatingSidebar);
    this.w.overlayView.view.setVisible(true);
    this.floatingSidebarVisible = true;
    sendToRenderer(this.w.overlayView.view.webContents, "overlay:visibility", true);
  }

  hideFloatingSidebar(): void {
    if (!this.floatingSidebarVisible) return;
    this.w.overlayView.view.setVisible(false);
    this.floatingSidebarVisible = false;
    sendToRenderer(this.w.overlayView.view.webContents, "overlay:visibility", false);
  }

  // The new tab page has its own composer. The panel comes back on the next page if it was open.
  private get chatAvailable(): boolean {
    const entry = this.w.tabs.activeEntry;
    return !(entry instanceof InternalTab && entry.page === "new-tab");
  }

  toggleChat(): void {
    if (!this.chatAvailable) return;
    this.chatOpen = !this.layout.chatOpen;
    this.seePanelChat();
    this.updateAllBounds();
    this.w.session.saveSessionSoon();
  }

  get layout(): Layout {
    const { width, height } = this.w.baseWindow.getContentBounds();
    return computeLayout(
      { width, height },
      {
        mode: this.w.settings.layoutMode,
        sidebarOpen: this.sidebarOpen,
        chatOpen: this.chatOpen && this.chatAvailable,
        sidebarWidth: this.w.settings.sidebarWidth,
        chatWidth: this.w.settings.chatWidth,
        platform: process.platform,
        savedSites: this.stores.bookmarkStore.pinned.length + this.stores.bookmarkStore.bookmarks.length > 0,
      },
    );
  }

  // A parked tab goes under the chrome, which then takes any click on the one pixel it leaves in the window.
  placeTab(tab: Tab, layout: Layout): void {
    const view = tab.existingView;
    if (!view) return;
    if (tab.isParked !== this.tabsUnderChrome.has(tab)) {
      const { contentView } = this.w.baseWindow;
      if (tab.isParked) {
        contentView.addChildView(view, 0);
        this.tabsUnderChrome.add(tab);
      } else {
        contentView.addChildView(view, contentView.children.indexOf(this.w.chromeView.view) + 1);
        this.tabsUnderChrome.delete(tab);
      }
    }
    tab.place(layout);
  }

  updateAllBounds(): void {
    const { width, height } = this.w.baseWindow.getContentBounds();
    const layout = this.layout;
    this.w.chromeView.view.setBounds({ x: 0, y: 0, width, height });
    this.w.tabs.allTabs.forEach((tab) => this.placeTab(tab, layout));
    if (layout.floatingSidebar.width === 0) this.hideFloatingSidebar();
    else if (this.floatingSidebarVisible) this.w.overlayView.view.setBounds(layout.floatingSidebar);
    if (layout.popover.width === 0) this.closePopover(false);
    else if (this.popover) this.w.overlayView.view.setBounds(layout.popover);
    this.w.findBar.setBounds(layout.findBar);
    // Whatever it hung from may have moved.
    this.w.tooltip.hide();
    this.w.previews.hide();
    this.w.menus.fit();
    this.w.broadcast("layout:updated", layout);
    this.w.permissionPrompt.sync();
  }
}

// What a renderer asked to open, checked: a known kind, a mascot named by a string, and a rect of finite numbers.
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validPopover = (input: unknown): Popover | null => {
  const { kind, mascotId, anchor } = fieldsOf(input);
  const { x, y, width, height } = fieldsOf(anchor);
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null;
  const rect = { x, y, width, height };
  if (kind === "chats") return { kind: "chats", anchor: rect };
  if (kind === "mascot" && typeof mascotId === "string") return { kind: "mascot", mascotId, anchor: rect };
  if (kind === "account") return { kind: "account", anchor: rect };
  return null;
};
