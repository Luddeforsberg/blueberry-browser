// Part of the IPC contract (ipc.ts): what the views over the page draw: address suggestions, tooltips, menus and the
// Asking first card, tab previews and find in page.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { MascotLook } from "../library";
import type { Point, Rect } from "./window";

// A row under the address field. Titles and addresses are a page's own words, so they're only ever shown as text.
export type AddressSuggestion =
  | { kind: "tab"; tabId: string; title: string; url: string; favicon: string | null }
  | { kind: "bookmark"; title: string; url: string; favicon: string | null }
  // `when` is the last visit in words, such as "Yesterday".
  | { kind: "history"; title: string; url: string; favicon: string | null; when: string }
  // What Enter does today with the typed text: open it if it looks like an address, or search for it.
  | { kind: "search"; text: string; url: string; opens: boolean }
  // Asking the chosen mascot, as the new tab's composer does. `hidden` is Show Berry turned off.
  | { kind: "ask"; text: string; name: string; look: MascotLook; hidden: boolean };

// What the chrome asks the suggestions view to show. `field` is the address field, in the window.
export interface AddressSuggestionsRequest {
  rows: AddressSuggestion[];
  selected: number | null;
  field: Rect;
}

// What the suggestions view draws: the rows, and where the sheet goes in the view, from the layout owner. A press names
// `listId` with its row, so it acts on the list that was drawn and never on a newer one main has since been sent.
export interface AddressSuggestionsShown {
  listId: number;
  rows: AddressSuggestion[];
  selected: number | null;
  sheet: Rect;
}

// A tooltip the chrome can't draw itself, because it hangs over a web page: its words, its shortcut's keys, and where it
// goes in the window. `slide` moves it over from where the last one was.
export interface TooltipRequest {
  words: string;
  keys: string[];
  box: Rect;
  slide: boolean;
}

// What the tooltip view draws, placed in the view by the layout owner.
export type TooltipShown = TooltipRequest;

// DESIGN.md section 8, Menus. The icon a row may lead with, drawn by the menu view.
export type MenuIcon =
  | "rename"
  | "delete"
  | "back"
  | "forward"
  | "reload"
  | "copy"
  | "cut"
  | "paste"
  | "undo"
  | "redo"
  | "select-all"
  | "link"
  | "new-tab"
  | "save"
  | "berry"
  | "show-how"
  | "print"
  | "inspect"
  | "pin"
  | "bookmark"
  | "open";

// A menu as main sends it to the menu view: words, icons and state only. Main keeps what each row does, by its id, for
// this one menu, so the view answers with nothing but the id that was pressed.
export type MenuEntry =
  | { kind: "rule" }
  | {
      kind: "row";
      id: string;
      label: string;
      icon: MenuIcon | null;
      enabled: boolean;
      // Null for a row that isn't a switch.
      checked: boolean | null;
      // Deletes or removes: in `ask`, last, after a hairline.
      danger: boolean;
      // As this computer writes it: "Ctrl C", or "⌘C" on a Mac.
      shortcut: string | null;
      submenu: MenuEntry[] | null;
    };

// What opens a menu, in the view that asked: a button's box, or the pointer as a box with no size.
export type MenuAnchor = Rect;

export interface MenuShown {
  id: string;
  label: string;
  entries: MenuEntry[];
  // With mascots hidden, a row with a mascot for its icon shows the plain glyph.
  mascotsHidden: boolean;
}

// The size of each sheet the view drew: the menu itself at "", and a submenu at the place of its row among the entries,
// such as "3" or "3.1". `rowTop` is where that row starts in the sheet it's on.
export interface MenuSheetSize {
  path: string;
  width: number;
  height: number;
  rowTop: number;
}

// Where each sheet goes in the view, by its path, once main has placed them in the window.
export type MenuPlacement = Record<string, Point>;

// The Asking first card (DESIGN.md section 8). With no `action` it's a warning with only OK.
export interface AskCard {
  id: string;
  question: string;
  detail: string;
  action: string | null;
  // A mascot's own delete shows its face.
  mascot: { name: string; look: MascotLook; hidden: boolean } | null;
}

export type MenuViewState = { kind: "menu"; menu: MenuShown } | { kind: "ask"; ask: AskCard } | null;

// A tab's preview card, which hangs beside or under its tab and so over the page, in a view of its own. The chrome says
// which tab and where its row is in the window. Main decides what the card shows and where it goes.
export interface TabPreviewRequest {
  tabId: string;
  row: Rect;
  // Moving over from the last tab's card, along the tabs.
  slide: boolean;
}

// What the preview view draws. The picture is the tab's own, kept in main, and sent nowhere but here.
export interface TabPreviewShown {
  tabId: string;
  title: string;
  site: string;
  // A small JPEG as a data address, or null where there's no picture yet.
  picture: string | null;
  // The name of the mascot working in the tab, if one is.
  working: string | null;
  // Keep Berry still, so the pips hold.
  still: boolean;
  // Where the card goes in the view, from the layout owner. Its height is what it draws.
  card: Rect;
  slide: boolean;
}

// Where find in page has got to. `active` counts from 1.
export interface FindResult {
  active: number;
  total: number;
}
