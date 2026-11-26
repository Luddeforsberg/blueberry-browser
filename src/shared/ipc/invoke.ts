// Part of the IPC contract (ipc.ts): every channel a renderer calls, with its arguments, its result and its regions.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { AiKeyState, AiKeyTried, AiService } from "../aiKey";
import type { AppIconGround } from "../appIcon";
import type { FileChip, TabChoice } from "../attachments";
import type {
  ChatThread,
  GalleryLinked,
  GalleryListing,
  LibrarySnapshot,
  MascotDraft,
  MemoryResult,
  PublishChoices,
  PublishResult,
  PublishedMascot,
  RecordedDraftResult,
  RecordingState,
  RoutineDraft,
  RoutineRun,
  SavedSiteList,
  Suggestion,
} from "../library";
import type {
  DownloadAction,
  DownloadInfo,
  HistoryCursor,
  HistoryImportResult,
  HistoryPage,
  ImportSource,
  PermissionPrompt,
  SavedSitePermission,
  SiteDecision,
  SitePermission,
  Visit,
  VisitedPage,
} from "./browsing";
import type { ChatSendOptions, MascotSaveResult, RoutineSaveResult } from "./chats";
import type { AccountState, CloudState, CloudView, McpState, PhoneState, RunnerState } from "./connections";
import type { DesktopDecided, DesktopDecision, DesktopDropPart, DesktopDropState, DesktopPanelState } from "./desktop";
import type {
  AddressSuggestionsRequest,
  MenuAnchor,
  MenuPlacement,
  MenuSheetSize,
  MenuViewState,
  TabPreviewRequest,
  TooltipRequest,
} from "./overPage";
import type { Appearance, Settings } from "./settings";
import type { InternalPage, Layout, Popover, Rect, ResizablePanel, TabInfo, ThemeState } from "./window";

// Renderer asks, main answers. `region` names the views main accepts the call from.
export interface InvokeChannels {
  "tabs:list": { region: "chrome" | "overlay"; args: []; result: TabInfo[] };
  "tabs:create": { region: "chrome" | "overlay"; args: [url?: string]; result: TabInfo };
  "tabs:close": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tabs:switch": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tabs:move": { region: "chrome" | "overlay"; args: [tabId: string, toIndex: number]; result: boolean };
  "tabs:move-by": { region: "chrome" | "overlay"; args: [tabId: string, delta: number]; result: boolean };
  "tabs:open-page": {
    region: "chrome" | "overlay";
    args: [page: InternalPage, options?: { param?: string; title?: string }];
    result: TabInfo;
  };
  "history:recent": { region: "chrome"; args: []; result: Visit[] };
  "history:search": {
    region: "chrome";
    args: [options: { query?: string; before?: HistoryCursor | undefined }];
    result: HistoryPage;
  };
  "history:delete": { region: "chrome"; args: [id: number]; result: boolean };
  // Asks first, in main. False if the user said no.
  "history:clear": { region: "chrome"; args: []; result: boolean };
  "history:import-sources": { region: "chrome"; args: []; result: ImportSource[] };
  "history:import": { region: "chrome"; args: [sourceId: string]; result: HistoryImportResult };
  // Pages in the history matching what's typed in the address field, one row per page, for its suggestions.
  "history:suggest": { region: "chrome"; args: [text: string]; result: VisitedPage[] };
  // Shows the list under the address field, or moves its selection. The chrome works out the rows.
  "address:show": { region: "chrome"; args: [request: AddressSuggestionsRequest]; result: void };
  "address:close": { region: "chrome"; args: []; result: void };
  // A row pressed in the list, by its place in what's shown. Main hands that row back to the chrome to act on.
  "address:pick": { region: "suggestions"; args: [listId: number, index: number]; result: void };
  // A tooltip over the page, in a view of its own that never takes the keyboard. The chrome decides when and where.
  "tooltip:show": { region: "chrome"; args: [request: TooltipRequest]; result: void };
  "tooltip:hide": { region: "chrome" | "tooltip"; args: []; result: void };
  // A tab's preview card over the page, in a view of its own that never takes the keyboard. The chrome decides when.
  "preview:show": { region: "chrome" | "overlay"; args: [request: TabPreviewRequest]; result: void };
  "preview:hide": { region: "chrome" | "overlay" | "preview"; args: []; result: void };
  "tab:navigate": { region: "chrome"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:stop": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Ends every job working in this tab. It's here, in the chrome, because no page can reach it.
  "tab:stop-work": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Takes a tab a job opened away from it, as clicking in the page does: the job can't reach it any more. Only ever narrows.
  "tab:take-over": { region: "chrome"; args: [tabId: string]; result: void };
  "tab:zoom-reset": { region: "chrome"; args: [tabId: string]; result: boolean };
  "find:search": { region: "find"; args: [text: string]; result: void };
  "find:step": { region: "find"; args: [forward: boolean]; result: void };
  "find:close": { region: "find"; args: []; result: void };
  "layout:get": { region: "chrome" | "overlay"; args: []; result: Layout };
  "layout:toggle-sidebar": { region: "chrome" | "overlay"; args: []; result: void };
  "layout:toggle-chat": { region: "chrome"; args: []; result: void };
  "layout:resize": { region: "chrome"; args: [panel: ResizablePanel, width: number]; result: void };
  // Off a Mac, the menu button opens the app's own menu under itself, since the window has no menu bar.
  "layout:app-menu": { region: "chrome"; args: []; result: void };
  // The menu views: what they show, where main put each sheet once the view says how big they are, and their answers.
  // Only the view drawing a menu or a card may answer it, by the ids main gave, and main acts on each id once.
  "menu:current": { region: "menu" | "drop-menu"; args: []; result: MenuViewState };
  "menu:place": { region: "menu" | "drop-menu"; args: [menuId: string, sheets: MenuSheetSize[]]; result: MenuPlacement | null };
  "menu:choose": { region: "menu" | "drop-menu"; args: [menuId: string, rowId: string]; result: void };
  "menu:dismiss": { region: "menu" | "drop-menu"; args: [menuId: string]; result: void };
  "menu:answer": { region: "menu"; args: [askId: string, yes: boolean]; result: void };
  "overlay:show-sidebar": { region: "chrome"; args: []; result: void };
  "overlay:hide": { region: "overlay"; args: []; result: void };
  "overlay:open-popover": { region: "chrome"; args: [popover: Popover]; result: void };
  "overlay:close-popover": { region: "chrome" | "overlay"; args: [refocus: boolean]; result: void };
  "theme:get": {
    region:
      | "chrome"
      | "overlay"
      | "find"
      | "prompt"
      | "desktop"
      | "composer"
      | "suggestions"
      | "tooltip"
      | "preview"
      | "menu"
      | "drop-menu";
    args: [];
    result: ThemeState;
  };
  "library:get": { region: "chrome" | "overlay"; args: []; result: LibrarySnapshot };
  "bookmarks:toggle": { region: "chrome"; args: []; result: void };
  // Moves a saved site on top as a tile, or into the bookmarks, at a place in that list. Dragging and the menu both use it.
  "bookmarks:place": { region: "chrome" | "overlay"; args: [bookmarkId: string, list: SavedSiteList, index: number]; result: void };
  // Settles once the menu has closed.
  "bookmarks:menu": { region: "chrome" | "overlay"; args: [bookmarkId: string, anchor: MenuAnchor]; result: void };
  "library:chat": { region: "chrome"; args: [chatId: string]; result: ChatThread | null };
  "settings:get": { region: "chrome" | "overlay"; args: []; result: Settings };
  "settings:update": { region: "chrome"; args: [patch: Partial<Settings>]; result: Settings };
  // Light, dark or system, from the account menu, which can open in the overlay. It is all the overlay may change.
  "settings:set-appearance": { region: "chrome" | "overlay"; args: [appearance: Appearance]; result: void };
  // The app's icon as the chrome drew it, a PNG data address, for the mascot and ground it was drawn for. Main refuses
  // it unless those are what's chosen and it's a PNG of the right size, and says whether it took it.
  "settings:app-icon": { region: "chrome"; args: [png: string, mascotId: string | null, ground: AppIconGround]; result: boolean };
  // Whether the shortcut couldn't be had, because another app holds it, so Settings can say so.
  "desktop:shortcut-taken": { region: "chrome"; args: []; result: boolean };
  "desktop:state": { region: "desktop"; args: []; result: DesktopDropState };
  // Where the drop is drawn in its window, for the frame it was drawn for, so the pointer can land on it and nowhere else.
  "desktop:drop-box": { region: "desktop"; args: [box: Rect, frame: number]; result: void };
  // The drop, or a button on it, was pressed. Main decides what that opens, so the view never names a chat or an approval.
  "desktop:press": { region: "desktop"; args: [part: DesktopDropPart]; result: void };
  "desktop:drag-start": { region: "desktop"; args: []; result: void };
  "desktop:drag-end": { region: "desktop"; args: []; result: void };
  "desktop:menu": { region: "desktop"; args: []; result: void };
  "desktop:panel-state": { region: "composer"; args: []; result: DesktopPanelState };
  // How tall what's showing needs to be: the box with its lines, or the tray and the ask with their room.
  "desktop:panel-height": { region: "composer"; args: [height: number]; result: void };
  // Starts a job with no page, as whoever is chosen, here or in the cloud where that mascot can work there. It's the
  // same as a chat started from the new tab page.
  "desktop:send": { region: "composer"; args: [text: string, cloud: boolean]; result: boolean };
  // Who the next job goes to, from the box's own picker or Tab.
  "desktop:choose": { region: "composer"; args: [mascotId: string]; result: void };
  "desktop:open-box": { region: "composer"; args: []; result: void };
  "desktop:close-panel": { region: "composer"; args: []; result: void };
  "desktop:open-blueberry": { region: "composer"; args: []; result: void };
  // A row in the tray, by the key main gave it: Answer on an ask, or a job to open in Blueberry.
  "desktop:tray-press": { region: "composer"; args: [key: string]; result: void };
  // The answer to the ask that's showing. Main holds which ask that is.
  "desktop:decide": { region: "composer"; args: [decision: DesktopDecision]; result: DesktopDecided };
  // Opens the page the ask is about in Blueberry, or its chat when it has none here.
  "desktop:see-page": { region: "composer"; args: []; result: void };
  "chat:send": {
    region: "chrome";
    args: [chatId: string | null, text: string, options: ChatSendOptions];
    result: ChatThread | null;
  };
  // Says which chat's working view is on screen and how wide its picture is, or null for none. The answer and everything
  // after it come as `work:updated` and `work:frame`, to the chrome and nowhere else. A width of 0 means words only.
  "work:watch": { region: "chrome"; args: [chatId: string | null, pictureWidth: number]; result: void };
  // The prompt box's +. Main opens the dialog, reads the files and keeps them, and only chips come back. `kept` is what
  // the box holds already, so main can keep the count. A drop or a paste sends the bytes, never a path.
  "attachments:choose-files": { region: "chrome"; args: [kept: string[]]; result: FileChip[] };
  "attachments:add-files": { region: "chrome"; args: [files: { name: string; bytes: Uint8Array }[], kept: string[]]; result: FileChip[] };
  "attachments:discard": { region: "chrome"; args: [id: string]; result: void };
  // The user's tabs that could go with a message in this chat, or a new one as this mascot, each with why not if it can't.
  "attachments:tabs": { region: "chrome"; args: [chatId: string | null, mascotId: string | null]; result: TabChoice[] };
  "chat:stop": { region: "chrome"; args: [chatId: string]; result: void };
  // Send now or Remove on a message the user sent while a reply ran, which waits for that reply to end.
  "chat:follow-up": { region: "chrome"; args: [chatId: string, id: string, action: "send-now" | "remove"]; result: boolean };
  // Which chat the chat panel has, or null for a new one, so a reply that ends in the open panel counts as seen.
  "chat:panel-shows": { region: "chrome"; args: [chatId: string | null]; result: void };
  // A routine's run answers its approvals here too, under the run's id.
  "chat:decide": {
    region: "chrome" | "overlay";
    args: [chatId: string, approvalId: string, allow: boolean, answer?: string];
    result: boolean;
  };
  "chat:rename": { region: "chrome" | "overlay"; args: [chatId: string, title: string]; result: boolean };
  // The menu for a chat in the sidebar. Delete asks first and happens in main, so only Rename comes back.
  "chat:menu": { region: "chrome" | "overlay"; args: [chatId: string, anchor: MenuAnchor]; result: "rename" | null };
  "page:text": { region: "chrome"; args: []; result: string | null };
  "chat:page-access": { region: "chrome"; args: []; result: boolean };
  "chat:set-page-access": { region: "chrome"; args: [enabled: boolean]; result: boolean };
  "berry:context-menu": { region: "chrome"; args: [anchor: MenuAnchor]; result: void };
  // Showing Berry how. Only the chrome can start, stop or read one, so no page, tool or mascot can.
  "recording:state": { region: "chrome"; args: []; result: RecordingState };
  "recording:start": { region: "chrome"; args: []; result: boolean };
  "recording:stop": { region: "chrome"; args: []; result: void };
  "recording:remove-step": { region: "chrome"; args: [stepId: string]; result: void };
  "recording:discard": { region: "chrome"; args: []; result: void };
  // The one call that sends anything anywhere. On success the trail is gone from main.
  "recording:draft": { region: "chrome"; args: []; result: RecordedDraftResult };
  "routines:save": { region: "chrome"; args: [id: string | null, draft: RoutineDraft]; result: RoutineSaveResult };
  "routines:set-paused": { region: "chrome"; args: [id: string, paused: boolean]; result: boolean };
  // Asks first, in main.
  "routines:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "routines:run-now": { region: "chrome"; args: [id: string]; result: boolean };
  "routines:stop": { region: "chrome"; args: [runId: string]; result: boolean };
  "routines:runs": { region: "chrome"; args: [id: string]; result: RoutineRun[] };
  "routines:mark-seen": { region: "chrome"; args: []; result: void };
  "mascots:save": {
    region: "chrome";
    args: [id: string | null, draft: MascotDraft & { worksInCloud?: boolean }];
    result: MascotSaveResult;
  };
  // Asks first, in main.
  "mascots:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "mascots:gallery": { region: "chrome"; args: []; result: GalleryListing };
  // The bundled starters' example prompts, by Gallery id, from real runs. For the new tab's try rows. Nothing from the server.
  "mascots:examples": { region: "chrome"; args: []; result: Record<string, string> };
  // Who the next new chat runs as, from the chrome or a mascot's card over the page. Null is Berry.
  "mascots:choose": { region: "chrome" | "overlay"; args: [mascotId: string | null]; result: void };
  "mascots:gallery-linked": { region: "chrome"; args: [galleryId: string]; result: GalleryLinked };
  // By the entry's id, so main copies what it has rather than what a renderer sends. A name is only for one that clashes.
  // `version` is the one the review showed, so what's added is what was read.
  "mascots:add-from-gallery": {
    region: "chrome";
    args: [galleryId: string, version: string, name: string | null];
    result: MascotSaveResult;
  };
  // By the mascot's id, so what goes public is read in main, not sent by a renderer. Only the choices come from there.
  "mascots:publish": { region: "chrome"; args: [mascotId: string, choices: PublishChoices]; result: PublishResult };
  // Asks first, in main.
  "mascots:unpublish": { region: "chrome"; args: [publishedId: string]; result: PublishResult };
  // Null if the server couldn't say.
  "mascots:published": { region: "chrome"; args: []; result: PublishedMascot[] | null };
  "mascots:last-author": { region: "chrome"; args: []; result: string };
  // By the offer's id, so what's kept is what main showed, not what a renderer sends. Only the chrome can reach these: no
  // page, tool or mascot can read or write memory.
  "memory:decide": { region: "chrome"; args: [offerId: string, keep: boolean]; result: MemoryResult };
  "memory:edit": { region: "chrome"; args: [factId: string, text: string]; result: MemoryResult };
  "memory:forget": { region: "chrome"; args: [factId: string]; result: boolean };
  // Asks first, in main.
  "memory:clear": { region: "chrome"; args: [mascotId: string]; result: boolean };
  "account:state": { region: "chrome" | "overlay"; args: []; result: AccountState };
  "account:sign-in": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-up": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-out": { region: "chrome" | "overlay"; args: []; result: AccountState };
  "ai-key:state": { region: "chrome"; args: []; result: AiKeyState };
  // The key goes this way only, and is kept only if the service answers with it. Nothing gives it back.
  "ai-key:try": { region: "chrome"; args: [service: AiService, key: string]; result: { outcome: AiKeyTried; state: AiKeyState } };
  "ai-key:remove": { region: "chrome"; args: []; result: { removed: boolean; state: AiKeyState } };
  // Opens the service's own page for making a key.
  "ai-key:find": { region: "chrome"; args: [service: AiService]; result: void };
  // What's on the clipboard, for the key field's Paste, only if it has the shape of that service's key. Null otherwise,
  // so nothing else on the clipboard, such as a password, can be read this way.
  "ai-key:paste": { region: "chrome"; args: [service: AiService]; result: string | null };
  "suggestions:list": { region: "chrome"; args: []; result: Suggestion[] };
  "suggestions:dismiss": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "suggestions:used": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "downloads:list": { region: "chrome"; args: []; result: DownloadInfo[] };
  "downloads:act": { region: "chrome"; args: [id: string, action: DownloadAction]; result: boolean };
  "downloads:choose-folder": { region: "chrome"; args: []; result: void };
  // Shows the folder files are saved to. Main knows which, so nothing names a path.
  "downloads:open-folder": { region: "chrome"; args: []; result: boolean };
  "permissions:saved": { region: "chrome"; args: []; result: SavedSitePermission[] };
  "permissions:set": {
    region: "chrome";
    args: [origin: string, permission: SitePermission, decision: SiteDecision | null];
    result: boolean;
  };
  "phone:state": { region: "chrome"; args: []; result: PhoneState };
  // The token goes this way only.
  "phone:connect": { region: "chrome"; args: [token: string]; result: PhoneState };
  "phone:new-link": { region: "chrome"; args: []; result: PhoneState };
  "phone:open-link": { region: "chrome"; args: []; result: void };
  "phone:disconnect": { region: "chrome"; args: []; result: PhoneState };
  "mcp:state": { region: "chrome"; args: []; result: McpState };
  "mcp:set-on": { region: "chrome"; args: [on: boolean]; result: McpState };
  // A new token, so every app set up with the old one is refused.
  "mcp:revoke": { region: "chrome"; args: []; result: McpState };
  // Puts that app's snippet, with the real token, on the clipboard.
  "mcp:copy": { region: "chrome"; args: [app: string]; result: boolean };
  "cloud:state": { region: "chrome"; args: []; result: CloudState };
  // The key and project id go this way only.
  "cloud:save": { region: "chrome"; args: [apiKey: string, projectId: string]; result: CloudState };
  "cloud:forget": { region: "chrome"; args: []; result: CloudState };
  "cloud:end": { region: "chrome"; args: []; result: CloudState };
  "cloud:view": { region: "chrome"; args: [tabId: string]; result: CloudView };
  // The live view of a chat's job on the cloud runner, only ever Browserbase's page, or null while there's none.
  "cloud:runner-view": { region: "chrome"; args: [chatId: string]; result: string | null };
  // The runner's link, looked up again. Link names the runner's account by email.
  "cloud:runner-state": { region: "chrome"; args: []; result: RunnerState };
  "cloud:runner-link": { region: "chrome"; args: [email: string]; result: RunnerState };
  "cloud:runner-unlink": { region: "chrome"; args: []; result: RunnerState };
  // Ends every connection ChatGPT or Claude made through the relay. False if it couldn't.
  "cloud:relay-disconnect": { region: "chrome"; args: []; result: boolean };
  // Which cloud tab is on screen, or null. Pictures of it come as `cloud:frame`, to the chrome and nowhere else.
  "cloud:watch": { region: "chrome"; args: [tabId: string | null]; result: void };
  // The size the cloud tab shows its page at, so the page's viewport fills it, as a tab of the window's own does.
  "cloud:fit": { region: "chrome"; args: [tabId: string, width: number, height: number]; result: void };
  // The user takes the tab from the job, as clicking in a tab of the window's own does.
  "cloud:take-over": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Sites from history and bookmarks to offer for bringing along. Names only.
  "cloud:login-suggestions": { region: "chrome"; args: []; result: string[] };
  // Asks for Touch ID, then copies that one site's cookies from this browser into the cloud browser and opens it there.
  // Says what went wrong, or null. Only the user can start this, from Settings: no tool or mascot reaches it.
  "cloud:bring-login": { region: "chrome"; args: [site: string]; result: string | null };
  // Opens the site in a cloud tab, for the user to see whether they're signed in.
  "cloud:check-login": { region: "chrome"; args: [site: string]; result: string | null };
  // What the user saw there.
  "cloud:mark-login": { region: "chrome"; args: [site: string, signedIn: boolean]; result: void };
  // Takes that site's cookies out of the cloud browser, and the site off the list.
  "cloud:revoke-login": { region: "chrome"; args: [site: string]; result: string | null };
  // Every cookie in the cloud browser, and the whole list.
  "cloud:forget-logins": { region: "chrome"; args: []; result: string | null };
  "permissions:current": { region: "prompt"; args: []; result: PermissionPrompt | null };
  "permissions:decide": { region: "prompt"; args: [promptId: string, allow: boolean]; result: boolean };
  "permissions:resize": { region: "prompt"; args: [height: number]; result: void };
}

export type InvokeChannel = keyof InvokeChannels;
