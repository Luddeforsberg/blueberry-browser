import { clipboard, type ContextMenuParams, type WebContents } from "electron";
import type { OwnMenuItem } from "./ownMenu";
import type { Tab } from "../tabs/Tab";
import { SHORTCUTS } from "../../shared/shortcuts";

export interface PageMenuActions {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  openLink: (url: string) => void;
  copyText: (text: string) => void;
  saveImage: (url: string) => void;
  copyImage: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  replaceWord: (word: string) => void;
  addToDictionary: (word: string) => void;
  askBerry: (text: string) => void;
  showHow: () => void;
  print: () => void;
  inspect: () => void;
}

export interface PageMenuState {
  canGoBack: boolean;
  canGoForward: boolean;
  assistantName: string;
  recording: boolean;
}

export type PageMenuParams = Pick<
  ContextMenuParams,
  "linkURL" | "srcURL" | "mediaType" | "selectionText" | "isEditable" | "misspelledWord" | "dictionarySuggestions" | "editFlags"
>;

const OPENABLE_LINK = /^https?:/i;
// A page may point an image at anything, and saving shouldn't copy local files around.
const SAVEABLE_IMAGE = /^(https?|data|blob):/i;

// What a normal browser offers for whatever was right-clicked, in groups split by separators.
export function pageMenuTemplate(params: PageMenuParams, state: PageMenuState, actions: PageMenuActions): OwnMenuItem[] {
  const { linkURL, srcURL, editFlags, misspelledWord, dictionarySuggestions } = params;
  const selection = params.selectionText.trim();
  const image = params.mediaType === "image" && srcURL !== "";
  const plainPage = !linkURL && !image && !selection && !params.isEditable;
  const groups: OwnMenuItem[][] = [];

  if (params.isEditable && misspelledWord) {
    groups.push([
      ...dictionarySuggestions.map((word) => ({ label: word, click: () => actions.replaceWord(word) })),
      ...(dictionarySuggestions.length === 0 ? [{ label: "No Spelling Suggestions", enabled: false }] : []),
      { label: "Add to Dictionary", click: () => actions.addToDictionary(misspelledWord) },
    ]);
  }

  if (linkURL) {
    groups.push([
      ...(OPENABLE_LINK.test(linkURL)
        ? [{ label: "Open Link in New Tab", icon: "new-tab" as const, click: () => actions.openLink(linkURL) }]
        : []),
      { label: "Copy Link", icon: "link", click: () => actions.copyText(linkURL) },
    ]);
  }

  if (image) {
    groups.push([
      ...(SAVEABLE_IMAGE.test(srcURL) ? [{ label: "Save Image", icon: "save" as const, click: () => actions.saveImage(srcURL) }] : []),
      { label: "Copy Image", icon: "copy", click: actions.copyImage },
    ]);
  }

  if (selection) {
    groups.push([{ label: `Ask ${state.assistantName} About This`, icon: "berry", click: () => actions.askBerry(selection) }]);
  }

  if (params.isEditable) {
    groups.push([
      { label: "Undo", icon: "undo", accelerator: "CmdOrCtrl+Z", enabled: editFlags.canUndo, click: actions.undo },
      { label: "Redo", icon: "redo", accelerator: "Shift+CmdOrCtrl+Z", enabled: editFlags.canRedo, click: actions.redo },
    ]);
    groups.push([
      { label: "Cut", icon: "cut", accelerator: "CmdOrCtrl+X", enabled: editFlags.canCut, click: actions.cut },
      { label: "Copy", icon: "copy", accelerator: "CmdOrCtrl+C", enabled: editFlags.canCopy, click: actions.copy },
      { label: "Paste", icon: "paste", accelerator: "CmdOrCtrl+V", enabled: editFlags.canPaste, click: actions.paste },
      { label: "Select All", icon: "select-all", accelerator: "CmdOrCtrl+A", enabled: editFlags.canSelectAll, click: actions.selectAll },
    ]);
  } else if (selection) {
    groups.push([{ label: "Copy", icon: "copy", accelerator: "CmdOrCtrl+C", click: actions.copy }]);
  }

  if (plainPage) {
    groups.push([
      { label: "Back", icon: "back", accelerator: SHORTCUTS.back, enabled: state.canGoBack, click: actions.goBack },
      { label: "Forward", icon: "forward", accelerator: SHORTCUTS.forward, enabled: state.canGoForward, click: actions.goForward },
      { label: "Reload", icon: "reload", accelerator: SHORTCUTS.reload, click: actions.reload },
    ]);
    groups.push([{ label: "Select All", icon: "select-all", accelerator: "CmdOrCtrl+A", click: actions.selectAll }]);
    groups.push([
      {
        label: state.recording ? `Stop Showing ${state.assistantName}` : `Show ${state.assistantName} How`,
        icon: "show-how",
        click: actions.showHow,
      },
    ]);
  }

  groups.push([
    ...(plainPage || (selection && !params.isEditable)
      ? [{ label: "Print…", icon: "print" as const, accelerator: "CmdOrCtrl+P", click: actions.print }]
      : []),
    { label: "Inspect", icon: "inspect", click: actions.inspect },
  ]);

  return groups.flatMap((group, index) => (index === 0 ? group : [{ type: "separator" as const }, ...group]));
}

export const printPage = (contents: WebContents): void => {
  contents.print({}, (success, reason) => {
    if (!success) console.error("Printing stopped:", reason);
  });
};

// The tab can close while its menu is open, and its web contents with it. The menu is ours, drawn over the page at the
// pointer, so nothing the page runs can see or press it.
export function attachPageMenu(
  tab: Tab,
  app: {
    openMenu: (items: OwnMenuItem[], at: { x: number; y: number }, page: WebContents) => void;
    openTab: (url: string) => void;
    askBerry: (text: string) => void;
    assistantName: () => string;
    recording: () => boolean;
    startRecording: () => void;
    stopRecording: () => void;
  },
): void {
  const contents = tab.webContents;
  const live = (action: () => void) => () => {
    if (!contents.isDestroyed()) action();
  };

  contents.on("context-menu", (_, params) => {
    const actions: PageMenuActions = {
      goBack: live(() => tab.goBack()),
      goForward: live(() => tab.goForward()),
      reload: live(() => tab.reload()),
      openLink: app.openTab,
      copyText: (text) => void clipboard.writeText(text),
      saveImage: (url) => live(() => contents.downloadURL(url))(),
      copyImage: live(() => contents.copyImageAt(params.x, params.y)),
      undo: live(() => contents.undo()),
      redo: live(() => contents.redo()),
      cut: live(() => contents.cut()),
      copy: live(() => contents.copy()),
      paste: live(() => contents.paste()),
      selectAll: live(() => contents.selectAll()),
      replaceWord: (word) => live(() => contents.replaceMisspelling(word))(),
      addToDictionary: (word) => live(() => contents.session.addWordToSpellCheckerDictionary(word))(),
      askBerry: app.askBerry,
      showHow: () => (app.recording() ? app.stopRecording() : app.startRecording()),
      print: live(() => printPage(contents)),
      inspect: live(() => contents.inspectElement(params.x, params.y)),
    };
    const state = {
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      assistantName: app.assistantName(),
      recording: app.recording(),
    };
    app.openMenu(pageMenuTemplate(params, state, actions), { x: params.x, y: params.y }, contents);
  });
}
