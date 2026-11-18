// Shortcuts main registers that the chrome also shows, such as in the account menu and in tooltips, so the two can't
// disagree.
export const SHORTCUTS = {
  settings: "CmdOrCtrl+,",
  history: "CmdOrCtrl+Y",
  downloads: "CmdOrCtrl+Shift+J",
  newTab: "CmdOrCtrl+T",
  closeTab: "CmdOrCtrl+W",
  bookmark: "CmdOrCtrl+D",
  reload: "CmdOrCtrl+R",
  back: "CmdOrCtrl+Left",
  forward: "CmdOrCtrl+Right",
  sidebar: "CmdOrCtrl+S",
  chat: "CmdOrCtrl+E",
  // The desktop mascot's, from any app.
  desktop: "Alt+Space",
} as const;

// Keys that are written as a sign rather than their name.
const SIGNS: Record<string, string> = { Left: "←", Right: "→", Up: "↑", Down: "↓", Plus: "+" };

// Other names Electron takes for the same modifiers.
const ALIASES: Record<string, string> = {
  Command: "CmdOrCtrl",
  Cmd: "CmdOrCtrl",
  CommandOrControl: "CmdOrCtrl",
  Control: "Ctrl",
  Option: "Alt",
};

// An Electron accelerator's keys one by one, as the platform writes them: ⇧ ⌘ J on a Mac, Ctrl Shift J elsewhere.
export const shortcutKeys = (accelerator: string, mac: boolean): string[] => {
  const keys = accelerator.split("+").map((each) => ALIASES[each] ?? each);
  const last = keys.pop() ?? "";
  const key = SIGNS[last] ?? last;
  if (!mac) {
    const ctrl = keys.includes("Ctrl") || keys.includes("CmdOrCtrl");
    return [...(ctrl ? ["Ctrl"] : []), ...(["Alt", "Shift"] as const).filter((each) => keys.includes(each)), key];
  }
  // The Mac's own order: Control, Option, Shift, Command.
  const symbols = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", CmdOrCtrl: "⌘" } as const;
  const order = ["Ctrl", "Alt", "Shift", "CmdOrCtrl"] as const;
  return [...order.filter((each) => keys.includes(each)).map((each) => symbols[each]), key];
};

// An Electron accelerator as the platform writes it: "⇧⌘J" on a Mac, "Ctrl+Shift+J" elsewhere.
export const shortcutWords = (accelerator: string, mac: boolean): string => shortcutKeys(accelerator, mac).join(mac ? "" : "+");

// As a menu row writes it (DESIGN.md section 8): "⌘C" on a Mac, "Ctrl C" elsewhere.
export const menuShortcut = (accelerator: string, mac: boolean): string => shortcutKeys(accelerator, mac).join(mac ? "" : " ");
