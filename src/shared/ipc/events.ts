// Part of the IPC contract (ipc.ts): every channel main sends on, with what it carries.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { AiKeyState } from "../aiKey";
import type { ChatThread, LibrarySnapshot, RecordingState, Suggestion, WorkFrame, WorkView } from "../library";
import type { DownloadInfo, PermissionPrompt, SavedSitePermission } from "./browsing";
import type { ChatChunk } from "./chats";
import type { AccountState, CloudFrame, CloudState, McpState, PhoneAnswered, PhoneState, RunnerState } from "./connections";
import type { DesktopDropState, DesktopPanelState } from "./desktop";
import type { AddressSuggestion, AddressSuggestionsShown, FindResult, MenuViewState, TabPreviewShown, TooltipShown } from "./overPage";
import type { Settings } from "./settings";
import type { Layout, PopoverState, TabInfo, ThemeState } from "./window";

// Main tells renderers.
export interface EventChannels {
  "tabs:updated": TabInfo[];
  "account:updated": AccountState;
  "ai-key:updated": AiKeyState;
  "phone:updated": PhoneState;
  "phone:answered": PhoneAnswered;
  "mcp:updated": McpState;
  "cloud:updated": CloudState;
  "cloud:runner-updated": RunnerState;
  "cloud:frame": CloudFrame;
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "desktop:state": DesktopDropState;
  "desktop:panel-state": DesktopPanelState;
  "settings:updated": Settings;
  "library:updated": LibrarySnapshot;
  // A `blueberry://mascot/<id>` link was opened, so the Gallery shows that entry. Only ever a checked uuid.
  "gallery:linked": string;
  "toolbar:focus-address": null;
  // To the suggestions view: what to draw, or null when it's hidden.
  "address:suggestions": AddressSuggestionsShown | null;
  // To the chrome: the row pressed in the list.
  "address:picked": AddressSuggestion;
  // To the tooltip view: what to draw, or null when it's hidden.
  "tooltip:shown": TooltipShown | null;
  // To the preview view: the card to draw, or null when it's hidden.
  "preview:shown": TabPreviewShown | null;
  "overlay:visibility": boolean;
  "overlay:popover": PopoverState;
  "recording:updated": RecordingState;
  "work:updated": WorkView | null;
  "work:frame": WorkFrame;
  "chat:chunk": ChatChunk;
  "chat:updated": ChatThread;
  "chat:deleted": string;
  // Text the user chose to ask about. It waits in the composer and is never sent by itself.
  "chat:draft": string;
  "find:opened": null;
  "find:result": FindResult;
  "suggestions:updated": Suggestion[];
  "downloads:updated": DownloadInfo[];
  "permissions:saved-updated": SavedSitePermission[];
  "permissions:prompt": PermissionPrompt | null;
  // To a menu view: the menu or card to draw, or null when it's hidden.
  "menu:shown": MenuViewState;
}
