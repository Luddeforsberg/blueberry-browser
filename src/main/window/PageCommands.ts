import { Menu, type WebContents } from "electron";
import { printPage } from "../menus/pageMenu";
import { sendToRenderer } from "./ipc";
import type { WindowParts } from "./WindowParts";

// App menu items that only do something on a web page.
export const WEB_PAGE_MENU_IDS = ["zoom-in", "zoom-in-equals", "zoom-out", "zoom-reset", "print"];

// The app menu's and the toolbar's commands for what's in front: find, zoom and print, which of the menu's items a page
// turns on, and the address field with its suggestions and the tooltip that hang over the page.
export class PageCommands {
  constructor(private readonly w: WindowParts) {}

  // Internal pages are drawn by the chrome view, so finding on one searches that.
  get findTarget(): WebContents | null {
    if (!this.w.settings.onboarded) return null;
    return this.w.tabs.activeTab?.webContents ?? this.w.chromeView.view.webContents;
  }

  openFindBar(): void {
    const target = this.findTarget;
    if (target) this.w.findBar.open(target);
  }

  // With the bar closed there's nothing to step through yet, so this opens it.
  findStep(forward: boolean): void {
    if (this.w.findBar.isOpen) this.w.findBar.step(forward);
    else this.openFindBar();
  }

  zoomActiveTab(direction: 1 | -1): void {
    if (this.w.tabs.activeTab) this.w.siteZoom.step(this.w.tabs.activeTab, direction);
  }

  resetActiveTabZoom(): void {
    if (this.w.tabs.activeTab) this.w.siteZoom.reset(this.w.tabs.activeTab);
  }

  printActiveTab(): void {
    if (this.w.tabs.activeTab) printPage(this.w.tabs.activeTab.webContents);
  }

  syncMenu(): void {
    const menu = Menu.getApplicationMenu();
    WEB_PAGE_MENU_IDS.forEach((id) => {
      const item = menu?.getMenuItemById(id);
      if (item) item.enabled = this.w.tabs.activeTab !== null;
    });
  }

  showAddressSuggestions(request: unknown): void {
    const { width, height } = this.w.baseWindow.getContentBounds();
    this.w.addressSuggestions.show(request, { width, height });
  }

  // A row pressed in the list goes back to the chrome, which acts on it as it would on Enter. The press took the keyboard
  // to the list's view, so it comes back first.
  showTooltip(request: unknown): void {
    const { width, height } = this.w.baseWindow.getContentBounds();
    this.w.tooltip.show(request, { width, height });
  }

  pickAddressSuggestion(index: unknown): void {
    const row = this.w.addressSuggestions.pick(index);
    if (!row) return;
    this.w.chromeView.view.webContents.focus();
    sendToRenderer(this.w.chromeView.view.webContents, "address:picked", row);
  }

  focusAddressBar(): void {
    this.w.chromeView.view.webContents.focus();
    sendToRenderer(this.w.chromeView.view.webContents, "toolbar:focus-address", null);
  }
}
