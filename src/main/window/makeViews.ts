import { session, type WebContents } from "electron";
import { MenuView } from "../menus/MenuView";
import { TabPreviews } from "../tabs/TabPreviews";
import { SiteZoom } from "../settings/siteZoom";
import type { Downloads } from "../library/Downloads";
import type { SitePermissions } from "../settings/SitePermissions";
import { PermissionPromptView } from "../settings/PermissionPromptView";
import { sendToRenderer } from "./ipc";
import { BERRY } from "../../shared/mascots";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// The views the window makes over its pages and wires to it, each made in its turn by the window's constructor, since
// views stack in the order they're added.

export const createPreviews = (w: WindowParts, stores: AppStores): TabPreviews =>
  new TabPreviews(w.baseWindow.contentView, {
    tab: (id) => w.tabs.find(id) ?? null,
    layout: () => w.panels.layout,
    window: () => w.baseWindow.getContentBounds(),
    mascotName: (id) => stores.mascotStore.find(id ?? BERRY.id)?.name ?? "A lost mascot",
    keepStill: () => w.settings.keepBerryStill,
  });

// Our menus and Asking first, over everything else in the window.
export const createMenuView = (w: WindowParts): MenuView => {
  const { contentView } = w.baseWindow;
  return new MenuView(
    "menu",
    (view) => {
      contentView.addChildView(view);
      return {
        area: () => {
          const { width, height } = w.baseWindow.getContentBounds();
          return { x: 0, y: 0, width, height };
        },
        show: (rect) => {
          // Adding a view again moves it to the top, above tabs and other views opened since.
          contentView.addChildView(view);
          view.setBounds(rect);
          view.setVisible(true);
        },
        hide: () => view.setVisible(false),
      };
    },
    { mascotsHidden: () => !w.settings.showBerry, refocus: true },
  );
};

export const createSiteZoom = (w: WindowParts): SiteZoom =>
  new SiteZoom({
    levels: () => w.settings.siteZoom,
    save: (siteZoom) => {
      w.settingsChanges.updateSettings({ siteZoom });
      w.tabs.notifyTabs();
    },
    // A restored tab that hasn't loaded gets its zoom when it does.
    tabs: () => w.tabs.allTabs.filter((tab) => tab.existingView),
  });

export const createPermissionPrompt = (w: WindowParts, sitePermissions: SitePermissions): PermissionPromptView =>
  new PermissionPromptView(w.baseWindow, sitePermissions, {
    activeContents: () => (w.settings.onboarded ? (w.tabs.activeTab?.webContents ?? null) : null),
    page: () => w.panels.layout.page,
  });

// Sends downloads and saved site permissions to the chrome as they change, and closes a tab a download left empty. Gives
// back what stops it all, for when the window closes.
export const watchDownloads = (w: WindowParts, downloads: Downloads, sitePermissions: SitePermissions): (() => void) => {
  const offDownloads = downloads.onChange((list) => sendToRenderer(w.chromeView.view.webContents, "downloads:updated", list));
  const offSaved = sitePermissions.onChange(() =>
    sendToRenderer(w.chromeView.view.webContents, "permissions:saved-updated", sitePermissions.saved),
  );

  const onDownload = (_: unknown, __: unknown, contents: WebContents) => w.webTabs.closeTabLeftEmpty(contents);
  session.defaultSession.on("will-download", onDownload);
  return () => {
    session.defaultSession.off("will-download", onDownload);
    offDownloads();
    offSaved();
  };
};
