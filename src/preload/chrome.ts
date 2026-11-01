import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ChromeAPI, EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

const invoke = <C extends InvokeChannel>(
  channel: C,
  ...args: InvokeChannels[C]["args"]
): Promise<InvokeChannels[C]["result"]> => ipcRenderer.invoke(channel, ...args);

const subscribe = <C extends keyof EventChannels>(
  channel: C,
  callback: (payload: EventChannels[C]) => void
) => {
  const listener = (_: IpcRendererEvent, payload: EventChannels[C]) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const chromeAPI: ChromeAPI = {
  desktop: {
    shortcutTaken: () => invoke("desktop:shortcut-taken"),
    onAway: (callback) => subscribe("desktop:away", callback),
    state: () => invoke("desktop:state"),
    lineBox: (box) => invoke("desktop:line-box", box),
    press: () => invoke("desktop:press"),
    dragStart: () => invoke("desktop:drag-start"),
    dragEnd: () => invoke("desktop:drag-end"),
    menu: () => invoke("desktop:menu"),
    onState: (callback) => subscribe("desktop:state", callback),
    composerState: () => invoke("desktop:composer-state"),
    composerHeight: (height) => invoke("desktop:composer-height", height),
    send: (text) => invoke("desktop:send", text),
    closeComposer: () => invoke("desktop:close-composer"),
    onComposerState: (callback) => subscribe("desktop:composer-state", callback),
  },
  browser: {
    getTabs: () => invoke("tabs:list"),
    createTab: (url) => invoke("tabs:create", url),
    closeTab: (tabId) => invoke("tabs:close", tabId),
    switchTab: (tabId) => invoke("tabs:switch", tabId),
    moveTab: (tabId, toIndex) => invoke("tabs:move", tabId, toIndex),
    moveTabBy: (tabId, delta) => invoke("tabs:move-by", tabId, delta),
    navigateTab: (tabId, url) => invoke("tab:navigate", tabId, url),
    goBack: (tabId) => invoke("tab:back", tabId),
    goForward: (tabId) => invoke("tab:forward", tabId),
    reload: (tabId) => invoke("tab:reload", tabId),
    stop: (tabId) => invoke("tab:stop", tabId),
    stopWork: (tabId) => invoke("tab:stop-work", tabId),
    resetZoom: (tabId) => invoke("tab:zoom-reset", tabId),
    openPage: (page, options) => invoke("tabs:open-page", page, options),
    getRecent: () => invoke("history:recent"),
    searchHistory: (options) => invoke("history:search", options),
    deleteHistoryEntry: (id) => invoke("history:delete", id),
    clearHistory: () => invoke("history:clear"),
    importSources: () => invoke("history:import-sources"),
    importHistory: (sourceId) => invoke("history:import", sourceId),
    onTabsUpdated: (callback) => subscribe("tabs:updated", callback),
    onFocusAddress: (callback) => subscribe("toolbar:focus-address", () => callback()),
  },
  layout: {
    getLayout: () => invoke("layout:get"),
    toggleSidebar: () => invoke("layout:toggle-sidebar"),
    toggleChat: () => invoke("layout:toggle-chat"),
    resize: (panel, width) => invoke("layout:resize", panel, width),
    showFloatingSidebar: () => invoke("overlay:show-sidebar"),
    hideFloatingSidebar: () => invoke("overlay:hide"),
    onFloatingSidebarVisibility: (callback) => subscribe("overlay:visibility", callback),
    onLayoutUpdated: (callback) => subscribe("layout:updated", callback),
  },
  theme: {
    getTheme: () => invoke("theme:get"),
    onThemeUpdated: (callback) => subscribe("theme:updated", callback),
  },
  settings: {
    getSettings: () => invoke("settings:get"),
    updateSettings: (patch) => invoke("settings:update", patch),
    showBerryMenu: () => invoke("berry:context-menu"),
    onSettingsUpdated: (callback) => subscribe("settings:updated", callback),
  },
  library: {
    toggleBookmark: () => invoke("bookmarks:toggle"),
    togglePin: () => invoke("bookmarks:toggle-pin"),
    showBookmarkMenu: (bookmarkId) => invoke("bookmarks:menu", bookmarkId),
    getLibrary: () => invoke("library:get"),
    getChat: (chatId) => invoke("library:chat", chatId),
    onLibraryUpdated: (callback) => subscribe("library:updated", callback),
  },
  chat: {
    send: (chatId, text, options) => invoke("chat:send", chatId, text, options),
    stop: (chatId) => invoke("chat:stop", chatId),
    decide: (chatId, approvalId, allow, answer) => invoke("chat:decide", chatId, approvalId, allow, answer),
    rename: (chatId, title) => invoke("chat:rename", chatId, title),
    showMenu: (chatId) => invoke("chat:menu", chatId),
    getPageText: () => invoke("page:text"),
    getPageAccess: () => invoke("chat:page-access"),
    setPageAccess: (enabled) => invoke("chat:set-page-access", enabled),
    onChatChunk: (callback) => subscribe("chat:chunk", callback),
    onChatUpdated: (callback) => subscribe("chat:updated", callback),
    onChatDeleted: (callback) => subscribe("chat:deleted", callback),
    onDraft: (callback) => subscribe("chat:draft", callback),
  },
  work: {
    watch: (chatId, pictureWidth) => invoke("work:watch", chatId, pictureWidth),
    onUpdated: (callback) => subscribe("work:updated", callback),
    onFrame: (callback) => subscribe("work:frame", callback),
  },
  recording: {
    state: () => invoke("recording:state"),
    start: () => invoke("recording:start"),
    stop: () => invoke("recording:stop"),
    removeStep: (stepId) => invoke("recording:remove-step", stepId),
    discard: () => invoke("recording:discard"),
    draft: () => invoke("recording:draft"),
    onUpdated: (callback) => subscribe("recording:updated", callback),
  },
  find: {
    search: (text) => invoke("find:search", text),
    step: (forward) => invoke("find:step", forward),
    close: () => invoke("find:close"),
    onOpened: (callback) => subscribe("find:opened", () => callback()),
    onResult: (callback) => subscribe("find:result", callback),
  },
  routines: {
    save: (id, draft) => invoke("routines:save", id, draft),
    setPaused: (id, paused) => invoke("routines:set-paused", id, paused),
    delete: (id) => invoke("routines:delete", id),
    runNow: (id) => invoke("routines:run-now", id),
    stop: (runId) => invoke("routines:stop", runId),
    getRuns: (id) => invoke("routines:runs", id),
    markSeen: () => invoke("routines:mark-seen"),
  },
  mascots: {
    save: (id, draft) => invoke("mascots:save", id, draft),
    delete: (id) => invoke("mascots:delete", id),
    gallery: () => invoke("mascots:gallery"),
    addFromGallery: (galleryId, name) => invoke("mascots:add-from-gallery", galleryId, name),
    publish: (mascotId, choices) => invoke("mascots:publish", mascotId, choices),
    unpublish: (publishedId) => invoke("mascots:unpublish", publishedId),
    published: () => invoke("mascots:published"),
    lastAuthor: () => invoke("mascots:last-author"),
  },
  account: {
    state: () => invoke("account:state"),
    signIn: (email, password) => invoke("account:sign-in", email, password),
    signUp: (email, password) => invoke("account:sign-up", email, password),
    signOut: () => invoke("account:sign-out"),
    onUpdated: (callback) => subscribe("account:updated", callback),
  },
  phone: {
    state: () => invoke("phone:state"),
    connect: (token) => invoke("phone:connect", token),
    newLink: () => invoke("phone:new-link"),
    openLink: () => invoke("phone:open-link"),
    disconnect: () => invoke("phone:disconnect"),
    onUpdated: (callback) => subscribe("phone:updated", callback),
    onAnswered: (callback) => subscribe("phone:answered", callback),
  },
  suggestions: {
    list: () => invoke("suggestions:list"),
    dismiss: (id) => invoke("suggestions:dismiss", id),
    onUpdated: (callback) => subscribe("suggestions:updated", callback),
  },
  downloads: {
    list: () => invoke("downloads:list"),
    act: (id, action) => invoke("downloads:act", id, action),
    chooseFolder: () => invoke("downloads:choose-folder"),
    onUpdated: (callback) => subscribe("downloads:updated", callback),
  },
  permissions: {
    saved: () => invoke("permissions:saved"),
    set: (origin, permission, decision) => invoke("permissions:set", origin, permission, decision),
    onSavedUpdated: (callback) => subscribe("permissions:saved-updated", callback),
    current: () => invoke("permissions:current"),
    decide: (promptId, allow) => invoke("permissions:decide", promptId, allow),
    resizePrompt: (height) => invoke("permissions:resize", height),
    onPrompt: (callback) => subscribe("permissions:prompt", callback),
  },
};

contextBridge.exposeInMainWorld("chromeAPI", chromeAPI);
