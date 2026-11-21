import { nativeTheme, systemPreferences, type WebContents } from "electron";
import { TAB_WEB_PREFERENCES, Tab } from "../tabs/Tab";
import type { SavedWebTab } from "../tabs/Session";
import { attachPageMenu } from "../menus/pageMenu";
import { isMac } from "./windowFrame";
import type { Popup } from "./TabStrip";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// A web page in this window: making its tab, wiring what it tells us to the window, what happens when it opens another
// page with `window.open`, and closing its tab when the page closes itself or leaves nothing but a download.
export class WebTabs {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: AppStores,
  ) {}

  createWebTab(tabId: string, url: string, restored?: SavedWebTab, popup?: Popup): Tab {
    // Loading starts inside the constructor, so these can run before `tab` is assigned.
    let tab: Tab | null = null;
    tab = new Tab(
      tabId,
      url,
      {
        onChange: () => this.w.tabs.notifyTabs(),
        // The title at this point is still the last page's, so the new page's arrives through `onDetails`.
        onNavigate: (address) => this.w.tabs.saveVisit(tabId, () => this.stores.history.record(address, "", null)),
        onUserInput: () => this.w.app.chats.releaseTab(tabId),
        onPlacingChanged: () => {
          if (this.w.baseWindow.isDestroyed()) return;
          if (tab) this.w.panels.placeTab(tab, this.w.panels.layout);
          this.w.workViews.sync();
        },
        actorOptions: () => ({
          on: this.w.settings.mascotOnPages,
          plain: !this.w.settings.showBerry,
          still: this.w.settings.keepBerryStill || systemPreferences.getAnimationSettings().prefersReducedMotion,
          look: this.stores.mascotStore.resolve(tab?.workingMascotId ?? null).look,
          dark: nativeTheme.shouldUseDarkColors,
          windowShowing: this.w.windowShowing,
        }),
        onClosedByPage: () => this.closedByPage(tabId, popup?.opener.id),
        onDetails: () =>
          this.w.tabs.saveVisit(tabId, () => {
            if (tab) this.stores.history.update(tab.url, { title: tab.title, favicon: tab.favicon });
          }),
        onView: (withView) => {
          this.w.baseWindow.contentView.addChildView(withView.view);
          this.w.panels.placeTab(withView, this.w.panels.layout);
          this.openLinksInTabs(withView.webContents);
          this.w.siteZoom.track(withView);
          // Added on top, so a question asking first goes back over it.
          this.w.menus.raise();
          attachPageMenu(withView, {
            openMenu: (items, at, page) => {
              const view = withView.existingView?.getBounds();
              if (view)
                this.w.menus.open(
                  items,
                  { x: view.x + at.x, y: view.y + at.y, width: 0, height: 0 },
                  { label: "Page", mac: isMac(), page },
                );
            },
            openTab: (address) => this.w.tabs.createTab(address),
            askBerry: (text) => this.w.panels.askBerryAbout(text),
            recording: () => this.w.recordings.isRecording,
            startRecording: () => void this.w.recordings.start(),
            stopRecording: () => void this.w.recordings.stop(),
            assistantName: () => (this.w.settings.showBerry ? "Berry" : "Assistant"),
          });
        },
      },
      restored,
      popup,
    );
    return tab;
  }

  // Without a handler, window.open starts a new window that inherits the opener's preload.
  openLinksInTabs(webContents: WebContents): void {
    webContents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:/i.test(url)) return { action: "deny" };
      const opener = this.w.tabs.allTabs.find((tab) => tab.existingView?.webContents === webContents);
      // The chrome's own links open as plain tabs, so no page is ever a child of the chrome.
      if (!opener) {
        this.w.tabs.createTab(url);
        return { action: "deny" };
      }
      // A limited mascot's click can't open what it couldn't go to.
      if (opener.refusesNavigation(url)) return { action: "deny" };
      // A page behind the current one, perhaps one Berry is using, doesn't get to come to the front.
      // Nor does one Berry opened, even with the user watching. If they had clicked here, it would be theirs by now.
      const behind = opener.id !== this.w.tabs.activeId || this.w.app.chats.isOwnTab(opener.id);
      // A real popup, so the page that opened it can talk to it, as a sign-in with Google needs. It's a tab with a
      // tab's preferences, its size is ignored, and it stays when its opener goes, like any tab.
      return {
        action: "allow",
        outlivesOpener: true,
        overrideBrowserWindowOptions: { webPreferences: TAB_WEB_PREFERENCES },
        createWindow: (options) => {
          // Electron passes the page it made for the popup along with the options, though its types leave it out.
          const page = (options as { webContents?: WebContents }).webContents;
          if (!page) throw new Error("Electron gave no page for the popup");
          const popup = { page, opener };
          const tab = behind ? this.w.tabs.createBackgroundTab(url, popup) : this.w.tabs.createTab(url, popup);
          tab.limitFirstLoadLike(opener);
          if (behind) this.w.app.chats.notePopup(opener.id, tab.id);
          return tab.webContents;
        },
      };
    });
  }

  // A popup that closes itself takes the user back to the page that opened it, if they were looking at the popup.
  private closedByPage(tabId: string, openerId: string | undefined): void {
    if (this.w.session.windowClosed || !this.w.tabs.has(tabId)) return;
    // Its page is gone, so the tab goes before anything else looks at it.
    const wasActive = this.w.tabs.activeId === tabId;
    this.w.tabs.closeTab(tabId, false);
    if (wasActive && openerId && this.w.tabs.has(openerId)) this.w.tabs.switchActiveTab(openerId);
  }

  // A link to a download in a new tab would otherwise leave that tab empty for good.
  closeTabLeftEmpty(contents: WebContents): void {
    const tab = this.w.tabs.allTabs.find((candidate) => candidate.existingView?.webContents === contents);
    if (tab && !tab.hasLoaded && this.w.tabs.tabCount > 1) this.w.tabs.closeTab(tab.id, false);
  }
}
