import { app } from "electron";
import { browserDataFor, findBrowsers, readBrowserHistory } from "../library/browserHistory";
import type { HistoryCursor, HistoryImportResult, HistoryPage, ImportSource, VisitedPage } from "../../shared/ipc";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// What the address field sends to look up in the history, at most.
const MAX_SUGGEST_TEXT = 200;

// The History page and the address field's suggestions: searching, deleting and clearing the history, and bringing it in
// from another browser.
export class BrowsingHistory {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: AppStores,
  ) {}

  searchHistory(options: { query?: string; before?: HistoryCursor | undefined }): HistoryPage {
    return this.stores.history.search(options);
  }

  deleteHistoryEntry(id: number): boolean {
    const url = this.stores.history.delete(id);
    if (url === null) return false;
    this.w.tabs.forgetPages(url);
    this.w.library.publishSuggestions();
    return true;
  }

  private get browserData() {
    return browserDataFor(process.platform, {
      appData: app.getPath("appData"),
      localAppData: process.env.LOCALAPPDATA,
      home: app.getPath("home"),
      programFiles: [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]],
      override: process.env.BLUEBERRY_BROWSER_DATA,
      packaged: app.isPackaged,
    });
  }

  // Each browser with the icon of its app as installed here, read by the system, never fetched.
  importSources(): Promise<ImportSource[]> {
    return findBrowsers(this.browserData, async (file) => {
      const icon = await app.getFileIcon(file, { size: "normal" });
      return icon.isEmpty() ? null : icon.toDataURL();
    });
  }

  async importHistory(sourceId: string): Promise<HistoryImportResult> {
    const visits = await readBrowserHistory(this.browserData, sourceId);
    if (!visits) return { ok: false };
    let added: number;
    try {
      added = this.stores.history.importVisits(visits);
    } catch (error) {
      console.error("Failed to save imported history:", (error as Error).message);
      return { ok: false };
    }
    // Saved, so it says so, even if the window closed during the read. What's the window's happens only while it's open.
    if (added > 0) this.w.app.suggestions.historyImported();
    if (this.w.app.window === this.w) {
      this.w.settingsChanges.firstJobDone("history");
      if (added > 0) this.w.library.publishSuggestions();
    }
    return { ok: true, added };
  }

  async clearHistory(): Promise<boolean> {
    const yes = await this.w.menus.ask({
      question: "Clear all browsing history?",
      detail: "It will be permanently removed from this computer. Open tabs stay open, but lose their back and forward pages.",
      action: "Clear history",
      mascot: null,
    });
    if (!yes) return false;
    this.stores.history.clear();
    this.w.tabs.forgetPages();
    this.w.library.publishSuggestions();
    return true;
  }

  // Pages in the history for the address field's suggestions. Only the chrome asks, and only while the field is edited.
  suggestHistory(text: unknown): VisitedPage[] {
    if (typeof text !== "string") return [];
    return this.stores.history.suggest(text.slice(0, MAX_SUGGEST_TEXT));
  }
}
