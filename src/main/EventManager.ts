import { ipcMain } from "electron";
import type { Window } from "./Window";
import type { Tab } from "./Tab";
import { CHANNEL_REGIONS, chatSendOptions, isTrustedSender, type ChromeEndpoint } from "./ipc";
import type { ChromeRegion, InvokeChannel, InvokeChannels } from "../shared/ipc";

type Result<C extends InvokeChannel> =
  | InvokeChannels[C]["result"]
  | Promise<InvokeChannels[C]["result"]>;

export class EventManager {
  private mainWindow: Window;
  private handledChannels: string[] = [];

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.handleTabEvents();
    this.handleLayoutEvents();
    this.handleThemeEvents();
    this.handleChatEvents();
    this.handleRoutineEvents();
    this.handleDownloadEvents();
    this.handlePermissionEvents();
    this.handleDesktopEvents();
  }

  private get endpoints(): Record<ChromeRegion, ChromeEndpoint | null> {
    const endpoint = ({ view, url }: { view: { webContents: ChromeEndpoint["webContents"] }; url: string }) => ({
      webContents: view.webContents,
      url,
    });
    return {
      chrome: endpoint(this.mainWindow.chromeView),
      overlay: endpoint(this.mainWindow.overlayView),
      find: endpoint(this.mainWindow.findBar.chromeView),
      prompt: endpoint(this.mainWindow.permissionPrompt.chrome),
      // There's no such view while the feature is off, so nothing can claim to be it.
      desktop: this.mainWindow.desktopBerry.chromeView && endpoint(this.mainWindow.desktopBerry.chromeView),
      composer: this.mainWindow.desktopBerry.composerView && endpoint(this.mainWindow.desktopBerry.composerView),
    };
  }

  private handle<C extends InvokeChannel>(
    channel: C,
    listener: (...args: InvokeChannels[C]["args"]) => Result<C>
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      const endpoints = this.endpoints;
      const trusted = CHANNEL_REGIONS[channel].some((region) => {
        const endpoint = endpoints[region];
        return endpoint !== null && isTrustedSender(event, endpoint);
      });
      if (!trusted) {
        throw new Error(`Rejected ${channel} from ${event.senderFrame?.url ?? "an unknown frame"}`);
      }
      return listener(...(args as InvokeChannels[C]["args"]));
    });
    this.handledChannels.push(channel);
  }

  private withTab(tabId: string, action: (tab: Tab) => unknown): boolean {
    const tab = this.mainWindow.getTab(tabId);
    if (!tab) return false;
    action(tab);
    return true;
  }

  private handleTabEvents(): void {
    this.handle("tabs:list", () => this.mainWindow.tabInfos);

    this.handle("tabs:create", (url) =>
      this.mainWindow.tabInfo(this.mainWindow.createTab(url))
    );

    this.handle("tabs:close", (tabId) => this.mainWindow.closeTab(tabId));

    this.handle("tabs:switch", (tabId) => this.mainWindow.switchActiveTab(tabId));

    this.handle("tabs:move", (tabId, toIndex) => this.mainWindow.moveTab(tabId, toIndex));

    this.handle("tabs:move-by", (tabId, delta) => this.mainWindow.moveTabBy(tabId, delta));

    this.handle("tabs:open-page", (page, options) =>
      this.mainWindow.tabInfo(this.mainWindow.openPage(page, options))
    );

    this.handle("tab:navigate", (tabId, url) => this.mainWindow.navigateTab(tabId, url));

    this.handle("history:recent", () => this.mainWindow.recentVisits);

    this.handle("history:search", (options) => this.mainWindow.searchHistory(options));

    this.handle("history:delete", (id) => this.mainWindow.deleteHistoryEntry(id));

    this.handle("history:clear", () => this.mainWindow.clearHistory());

    this.handle("history:import-sources", () => this.mainWindow.importSources());

    this.handle("history:import", (sourceId) => this.mainWindow.importHistory(sourceId));

    this.handle("tab:back", (tabId) => this.withTab(tabId, (tab) => tab.goBack()));

    this.handle("tab:forward", (tabId) => this.withTab(tabId, (tab) => tab.goForward()));

    this.handle("tab:reload", (tabId) => this.withTab(tabId, (tab) => tab.reload()));

    this.handle("tab:stop", (tabId) => this.withTab(tabId, (tab) => tab.stop()));

    this.handle("tab:stop-work", (tabId) => this.mainWindow.chats.stopWorkIn(tabId));

    this.handle("tab:zoom-reset", (tabId) => this.withTab(tabId, (tab) => this.mainWindow.siteZoom.reset(tab)));

    this.handle("find:search", (text) => {
      if (typeof text === "string") this.mainWindow.findBar.search(text);
    });

    this.handle("find:step", (forward) => this.mainWindow.findBar.step(forward === true));

    this.handle("find:close", () => this.mainWindow.findBar.close());
  }

  private handleLayoutEvents(): void {
    this.handle("layout:get", () => this.mainWindow.layout);

    this.handle("layout:toggle-sidebar", () => this.mainWindow.toggleSidebar());

    this.handle("layout:toggle-chat", () => this.mainWindow.toggleChat());

    this.handle("layout:resize", (panel, width) => this.mainWindow.resizePanel(panel, width));

    this.handle("layout:app-menu", () => this.mainWindow.showAppMenu());

    this.handle("overlay:show-sidebar", () => this.mainWindow.showFloatingSidebar());

    this.handle("overlay:hide", () => this.mainWindow.hideFloatingSidebar());
  }

  private handleThemeEvents(): void {
    this.handle("theme:get", () => this.mainWindow.theme);

    this.handle("library:get", () => this.mainWindow.librarySnapshot);

    this.handle("bookmarks:toggle", () => this.mainWindow.toggleBookmark());

    this.handle("bookmarks:toggle-pin", () => this.mainWindow.togglePin());

    this.handle("bookmarks:menu", (id) => this.mainWindow.showBookmarkMenu(id));

    this.handle("library:chat", (chatId) => this.mainWindow.chats.thread(chatId));

    this.handle("settings:get", () => this.mainWindow.settings);

    this.handle("settings:update", (patch) => this.mainWindow.updateSettings(patch));

    this.handle("phone:state", () => this.mainWindow.telegram.state);
    this.handle("phone:connect", (token) => this.mainWindow.telegram.connect(token));
    this.handle("phone:new-link", () => this.mainWindow.telegram.newLink());
    this.handle("phone:open-link", () => this.mainWindow.telegram.openLink());
    this.handle("phone:disconnect", () => this.mainWindow.telegram.disconnect());
    this.handle("mcp:state", () => this.mainWindow.mcp.state);
    this.handle("mcp:set-on", (on) => this.mainWindow.mcp.setOn(on === true));
    this.handle("mcp:revoke", () => this.mainWindow.mcp.revoke());
    this.handle("mcp:copy", async (app) => typeof app === "string" && (await this.mainWindow.mcp.copy(app)));
    this.handle("cloud:state", () => this.mainWindow.cloud.state);
    this.handle("cloud:save", (apiKey, projectId) => this.mainWindow.cloud.saveKey(apiKey, projectId));
    this.handle("cloud:forget", () => this.mainWindow.cloud.forget());
    this.handle("cloud:end", () => this.mainWindow.cloud.end());
    this.handle("cloud:view", (tabId) => this.mainWindow.cloud.view(tabId));
    this.handle("cloud:runner-view", (chatId) => (typeof chatId === "string" ? this.mainWindow.runnerJobs.liveView(chatId) : null));
    this.handle("cloud:runner-state", () => this.mainWindow.runnerJobs.refreshLink());
    this.handle("cloud:runner-link", (email) => this.mainWindow.runnerJobs.linkRunner(email));
    this.handle("cloud:runner-unlink", () => this.mainWindow.runnerJobs.unlinkRunner());
    this.handle("cloud:relay-disconnect", () => this.mainWindow.runnerJobs.disconnectRelay());
    this.handle("cloud:watch", (tabId) => this.mainWindow.cloud.watch(tabId));
    this.handle("cloud:fit", (tabId, width, height) => this.mainWindow.cloud.fit(tabId, width, height));
    this.handle("cloud:take-over", (tabId) => this.mainWindow.cloud.takeOver(tabId));
    this.handle("cloud:login-suggestions", () => this.mainWindow.cloudLoginSuggestions());
    this.handle("cloud:bring-login", (site) => this.mainWindow.cloud.bringLogin(site));
    this.handle("cloud:check-login", (site) => this.mainWindow.cloud.checkLogin(site));
    this.handle("cloud:mark-login", (site, signedIn) => this.mainWindow.cloud.markLogin(site, signedIn));
    this.handle("cloud:revoke-login", (site) => this.mainWindow.cloud.revokeLogin(site));
    this.handle("cloud:forget-logins", () => this.mainWindow.cloud.forgetLogins());
  }

  private handleChatEvents(): void {
    // Only Blueberry's own composers send this, so the user is there to answer if Berry asks before it starts.
    // A card's chat opened as a chat tab still sends through its card, so it gets its source card's answer as it would there.
    this.handle("chat:send", (chatId, text, options) => {
      if (typeof text !== "string") return null;
      const nests = this.mainWindow.nests;
      const card = typeof chatId === "string" ? nests.cardOfChat(chatId) : null;
      if (card) return nests.send(card.id, text);
      // A run of For each row gets its row again the same way.
      const run = typeof chatId === "string" ? nests.runOfChat(chatId) : null;
      if (run) return nests.sendRun(run.id, text);
      return this.mainWindow.chats.send(chatId, text, { ...chatSendOptions(options), userPresent: true });
    });

    this.handle("work:watch", (chatId, pictureWidth) => this.mainWindow.workViews.watch(chatId, pictureWidth));
    this.handle("recording:state", () => this.mainWindow.recordings.state);
    this.handle("recording:start", () => this.mainWindow.recordings.start());
    this.handle("recording:stop", () => this.mainWindow.recordings.stop());
    this.handle("recording:remove-step", (stepId) => this.mainWindow.recordings.removeStep(stepId));
    this.handle("recording:discard", () => this.mainWindow.recordings.discard());
    this.handle("recording:draft", () => this.mainWindow.recordings.draft());
    this.handle("chat:stop", (chatId) => this.mainWindow.chats.stop(chatId));
    this.handle("chat:decide", (chatId, approvalId, allow, answer) =>
      this.mainWindow.chats.decide(chatId, approvalId, allow, answer)
    );

    this.handle("chat:rename", (chatId, title) =>
      typeof title === "string" ? this.mainWindow.chats.rename(chatId, title) : false
    );

    this.handle("chat:menu", (chatId) => this.mainWindow.showChatMenu(chatId));

    // A card sends through the chat path, from Blueberry's own composer, so the user is there to answer too.
    const nests = this.mainWindow.nests;
    this.handle("nests:create", () => this.mainWindow.createNest());
    this.handle("nests:board", (nestId) => nests.board(nestId));
    this.handle("nests:rename", (nestId, title) => nests.rename(nestId, title));
    this.handle("nests:menu", (nestId) => this.mainWindow.showNestMenu(nestId));
    this.handle("nests:add-card", (nestId, card) => nests.addCard(nestId, card));
    this.handle("nests:move-card", (cardId, x, y) => nests.moveCard(cardId, x, y));
    this.handle("nests:nudge-cards", (nestId, moves) => nests.nudgeCards(nestId, moves));
    this.handle("nests:set-bird", (cardId, mascotId) => nests.setBird(cardId, mascotId));
    this.handle("nests:delete-card", (cardId) => this.mainWindow.confirmDeleteCard(cardId));
    this.handle("nests:send", (cardId, text) => nests.sendCard(cardId, text));
    this.handle("nests:send-each", (cardId, text) => nests.sendEach(cardId, text));
    this.handle("nests:send-run", (runId, text) => nests.sendRunReply(runId, text));
    this.handle("nests:stop-card", (cardId) => nests.stopCard(cardId));
    this.handle("nests:ask", (nestId, text, options) => nests.ask(nestId, text, options));
    this.handle("nests:edit-plan", (cardId, change) => nests.editPlanned(cardId, change));
    this.handle("nests:run-plan", (nestId) => nests.runPlan(nestId));
    this.handle("nests:discard-plan", (nestId) => nests.discardPlan(nestId));
    this.handle("nests:from-chat", (chatId) => this.mainWindow.openChatAsNest(chatId));
    this.handle("nests:continue", (cardId) => nests.continueFrom(cardId));
    this.handle("nests:attach-files", (target) => this.mainWindow.attachFiles(target));
    this.handle("nests:add-note", (target, text) => nests.addNote(target, text));
    this.handle("nests:edit-note", (attachmentId, text) => nests.editNote(attachmentId, text));
    this.handle("nests:remove-attachment", (attachmentId, fromCardId) => nests.removeAttachment(attachmentId, fromCardId));
    this.handle("nests:add-table-file", (nestId, place) => this.mainWindow.addTableFile(nestId, place));
    this.handle("nests:rename-column", (cardId, name) => nests.renameColumn(cardId, name));
    this.handle("nests:copy-table", (cardId) => this.mainWindow.copyTable(cardId));
    this.handle("nests:table-rows", (cardId) => nests.tableRows(cardId));
    this.handle("nests:save-table", (cardId) => this.mainWindow.saveTable(cardId));

    this.handle("chat:page-access", () => this.mainWindow.chats.canSeePage);

    this.handle("chat:set-page-access", (enabled) => this.mainWindow.chats.setPageAccess(enabled));

    this.handle("berry:context-menu", () => this.mainWindow.showBerryMenu());

    this.handle("page:text", async () => {
      const tab = this.mainWindow.activeTab;
      if (!tab) return null;
      try {
        return await tab.getTabText();
      } catch (error) {
        console.error("Error getting page text:", error);
        return null;
      }
    });
  }

  private handleRoutineEvents(): void {
    const { routines } = this.mainWindow;
    this.handle("routines:save", (id, draft) => routines.save(id, draft));
    this.handle("routines:set-paused", (id, paused) => routines.setPaused(id, paused));
    this.handle("routines:delete", (id) => this.mainWindow.confirmDeleteRoutine(id));
    this.handle("routines:run-now", (id) => routines.runNow(id));
    this.handle("routines:stop", (runId) => routines.stop(runId));
    this.handle("routines:runs", (id) => routines.runsShown(id));
    this.handle("routines:mark-seen", () => routines.markSeen());
    this.handle("memory:decide", (offerId, keep) => this.mainWindow.memory.decide(offerId, keep === true));
    this.handle("memory:edit", (factId, text) => this.mainWindow.memory.edit(factId, text));
    this.handle("memory:forget", (factId) => this.mainWindow.memory.forget(factId));
    this.handle("memory:clear", (mascotId) => this.mainWindow.confirmClearMemory(mascotId));
    this.handle("mascots:save", (id, draft) => this.mainWindow.saveMascot(id, draft));
    this.handle("mascots:delete", (id) => this.mainWindow.confirmDeleteMascot(id));
    this.handle("mascots:gallery", () => this.mainWindow.gallery.list());
    this.handle("mascots:gallery-linked", (id) => this.mainWindow.gallery.linked(id));
    this.handle("mascots:add-from-gallery", (galleryId, version, name) => this.mainWindow.addFromGallery(galleryId, version, name));
    this.handle("mascots:publish", (mascotId, choices) => this.mainWindow.gallery.publish(mascotId, choices));
    this.handle("mascots:unpublish", (id) => this.mainWindow.confirmUnpublish(id));
    this.handle("mascots:published", () => this.mainWindow.gallery.mine());
    this.handle("mascots:last-author", () => this.mainWindow.gallery.author);
    this.handle("account:state", () => this.mainWindow.account.state);
    this.handle("account:sign-in", (email, password) => this.mainWindow.account.signIn(email, password));
    this.handle("account:sign-up", (email, password) => this.mainWindow.account.signUp(email, password));
    this.handle("account:sign-out", () => this.mainWindow.account.signOut());
    this.handle("suggestions:list", () => this.mainWindow.suggestions.list());
    this.handle("suggestions:dismiss", (id) => this.mainWindow.suggestions.dismiss(id));
    this.handle("suggestions:used", (id) => this.mainWindow.suggestions.used(id));
  }

  private handleDownloadEvents(): void {
    this.handle("downloads:list", () => this.mainWindow.downloads.refresh());
    this.handle("downloads:act", (id, action) => this.mainWindow.downloads.act(id, action));
    this.handle("downloads:choose-folder", () => this.mainWindow.chooseDownloadFolder());
  }

  private handlePermissionEvents(): void {
    const { sitePermissions, permissionPrompt } = this.mainWindow;
    this.handle("permissions:saved", () => sitePermissions.saved);
    this.handle("permissions:set", (origin, permission, decision) => sitePermissions.set(origin, permission, decision));
    this.handle("permissions:current", () => permissionPrompt.current);
    this.handle("permissions:decide", (id, allow) => permissionPrompt.decide(id, allow === true));
    this.handle("permissions:resize", (height) => permissionPrompt.resize(height));
  }

  private handleDesktopEvents(): void {
    const { desktopBerry } = this.mainWindow;
    this.handle("desktop:shortcut-taken", () => desktopBerry.shortcutTaken);
    this.handle("desktop:state", () => desktopBerry.state);
    this.handle("desktop:line-box", (box) => desktopBerry.setLineBox(box));
    this.handle("desktop:press", () => desktopBerry.press());
    this.handle("desktop:drag-start", () => desktopBerry.dragStart());
    this.handle("desktop:drag-end", () => desktopBerry.dragEnd());
    this.handle("desktop:menu", () => desktopBerry.showMenu());
    this.handle("desktop:composer-state", () => desktopBerry.composerState);
    this.handle("desktop:composer-height", (height) => desktopBerry.setComposerHeight(height));
    this.handle("desktop:send", (text) => desktopBerry.send(text));
    this.handle("desktop:close-composer", () => desktopBerry.closeComposer());
  }

  public cleanup(): void {
    this.handledChannels.forEach((channel) => ipcMain.removeHandler(channel));
  }
}
