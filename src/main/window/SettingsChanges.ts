import { Menu, dialog, nativeTheme, shell } from "electron";
import { KEY_PAGES } from "../settings/AiKey";
import { isAiService } from "../../shared/aiKey";
import { PLAIN_WORDS, type FirstJob } from "../../shared/firstRun";
import type { ResizablePanel, Settings } from "../../shared/ipc";
import type { ChatThread } from "../../shared/library";
import { titleBarOverlay, windowButtonPosition } from "./windowFrame";
import type { WindowParts, WindowStores } from "./WindowParts";

export const HORIZONTAL_TABS_MENU_ID = "horizontal-tabs";

// Changing a setting and everything in the window that follows from it, and the First jobs on the new tab that the
// settings keep.
export class SettingsChanges {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  updateSettings(patch: Partial<Settings>): Settings {
    const before = this.stores.settingsStore.get();
    const after = this.stores.settingsStore.update(patch);

    if (after.layoutMode !== before.layoutMode) {
      this.w.panels.hideFloatingSidebar();
      if (process.platform === "darwin") {
        this.w.baseWindow.setWindowButtonPosition(windowButtonPosition(this.w.settings.layoutMode));
      } else if (process.platform === "win32") {
        this.w.baseWindow.setTitleBarOverlay(titleBarOverlay(this.w.settings.layoutMode));
      }
    }
    const item = Menu.getApplicationMenu()?.getMenuItemById(HORIZONTAL_TABS_MENU_ID);
    if (item) item.checked = after.layoutMode === "horizontal";
    if (after.appearance !== before.appearance) nativeTheme.themeSource = after.appearance;

    if (after.onboarded !== before.onboarded) this.w.tabs.syncTabViews();
    if (after.onStartup !== before.onStartup) this.w.session.saveSessionSoon();
    if (after.suggestions !== before.suggestions) this.w.library.publishSuggestions();
    if (after.phoneAlways !== before.phoneAlways) this.w.phone.sync();
    if (after.relayOnMac !== before.relayOnMac) this.w.macJobs.sync();
    this.w.desktopBerry.sync();

    this.w.broadcast("settings:updated", after);
    this.w.panels.updateAllBounds();
    return after;
  }

  resizePanel(panel: ResizablePanel, width: number): void {
    if (panel === "sidebar") this.updateSettings({ sidebarWidth: width });
    else if (panel === "chat") this.updateSettings({ chatWidth: width });
  }

  async chooseDownloadFolder(): Promise<void> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this.w.baseWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths[0]) this.updateSettings({ downloadFolder: filePaths[0] });
  }

  // A row of First jobs on the new tab, done by what really happened.
  firstJobDone(job: FirstJob): void {
    const done = this.w.settings.firstJobsDone;
    if (!done.includes(job)) this.updateSettings({ firstJobsDone: [...done, job] });
  }

  // A message the user sent from Blueberry's own composer: a first job, and meeting Plain Words if it's the one asked.
  sentFromChrome({ mascotId }: ChatThread): void {
    this.firstJobDone("try");
    if (mascotId && this.stores.mascotStore.find(mascotId)?.galleryId === PLAIN_WORDS) this.firstJobDone("meet");
  }

  // The service's own page for making a key. During the first run there are no tabs to show it in, so it opens in the
  // system's browser, where the user is likely signed in to the service already.
  findKey(service: unknown): void {
    if (!isAiService(service)) return;
    if (this.w.settings.onboarded) this.w.tabs.createTab(KEY_PAGES[service]);
    else void shell.openExternal(KEY_PAGES[service]);
  }
}
