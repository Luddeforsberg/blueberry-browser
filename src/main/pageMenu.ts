import { clipboard, Menu, type BaseWindow, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from "electron";
import type { Tab } from "./Tab";

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
  print: () => void;
  inspect: () => void;
}

export interface PageMenuState {
  canGoBack: boolean;
  canGoForward: boolean;
  assistantName: string;
}

export type PageMenuParams = Pick<
  ContextMenuParams,
  "linkURL" | "srcURL" | "mediaType" | "selectionText" | "isEditable" | "misspelledWord" | "dictionarySuggestions" | "editFlags"
>;

const OPENABLE_LINK = /^https?:/i;
// A page may point an image at anything, and saving shouldn't copy local files around.
const SAVEABLE_IMAGE = /^(https?|data|blob):/i;

// What a normal browser offers for whatever was right-clicked, in groups split by separators.
export function pageMenuTemplate(
  params: PageMenuParams,
  state: PageMenuState,
  actions: PageMenuActions
): MenuItemConstructorOptions[] {
  const { linkURL, srcURL, editFlags, misspelledWord, dictionarySuggestions } = params;
  const selection = params.selectionText.trim();
  const image = params.mediaType === "image" && srcURL !== "";
  const plainPage = !linkURL && !image && !selection && !params.isEditable;
  const groups: MenuItemConstructorOptions[][] = [];

  if (params.isEditable && misspelledWord) {
    groups.push([
      ...dictionarySuggestions.map((word) => ({ label: word, click: () => actions.replaceWord(word) })),
      ...(dictionarySuggestions.length === 0 ? [{ label: "No Spelling Suggestions", enabled: false }] : []),
      { label: "Add to Dictionary", click: () => actions.addToDictionary(misspelledWord) },
    ]);
  }

  if (linkURL) {
    groups.push([
      ...(OPENABLE_LINK.test(linkURL) ? [{ label: "Open Link in New Tab", click: () => actions.openLink(linkURL) }] : []),
      { label: "Copy Link", click: () => actions.copyText(linkURL) },
    ]);
  }

  if (image) {
    groups.push([
      ...(SAVEABLE_IMAGE.test(srcURL) ? [{ label: "Save Image…", click: () => actions.saveImage(srcURL) }] : []),
      { label: "Copy Image", click: actions.copyImage },
    ]);
  }

  if (selection) {
    groups.push([{ label: `Ask ${state.assistantName} About This`, click: () => actions.askBerry(selection) }]);
  }

  if (params.isEditable) {
    groups.push([
      { label: "Undo", enabled: editFlags.canUndo, click: actions.undo },
      { label: "Redo", enabled: editFlags.canRedo, click: actions.redo },
    ]);
    groups.push([
      { label: "Cut", enabled: editFlags.canCut, click: actions.cut },
      { label: "Copy", enabled: editFlags.canCopy, click: actions.copy },
      { label: "Paste", enabled: editFlags.canPaste, click: actions.paste },
      { label: "Select All", enabled: editFlags.canSelectAll, click: actions.selectAll },
    ]);
  } else if (selection) {
    groups.push([{ label: "Copy", click: actions.copy }]);
  }

  if (plainPage) {
    groups.push([
      { label: "Back", enabled: state.canGoBack, click: actions.goBack },
      { label: "Forward", enabled: state.canGoForward, click: actions.goForward },
      { label: "Reload", click: actions.reload },
    ]);
    groups.push([{ label: "Select All", click: actions.selectAll }]);
  }

  groups.push([
    ...(plainPage || (selection && !params.isEditable) ? [{ label: "Print…", click: actions.print }] : []),
    { label: "Inspect", click: actions.inspect },
  ]);

  return groups.flatMap((group, index) => (index === 0 ? group : [{ type: "separator" as const }, ...group]));
}

export const printPage = (contents: WebContents): void => {
  contents.print({}, (success, reason) => {
    if (!success) console.error("Printing stopped:", reason);
  });
};

// The tab can close while its menu is open, and its web contents with it.
export function attachPageMenu(
  tab: Tab,
  window: BaseWindow,
  app: { openTab: (url: string) => void; askBerry: (text: string) => void; assistantName: () => string }
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
      copyText: (text) => clipboard.writeText(text),
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
      print: live(() => printPage(contents)),
      inspect: live(() => contents.inspectElement(params.x, params.y)),
    };
    const state = { canGoBack: tab.canGoBack, canGoForward: tab.canGoForward, assistantName: app.assistantName() };
    Menu.buildFromTemplate(pageMenuTemplate(params, state, actions)).popup({ window });
  });
}
