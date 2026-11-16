// Shortcuts main registers that the chrome also shows, such as in the account menu, so the two can't disagree.
export const SHORTCUTS = {
  settings: "CmdOrCtrl+,",
  history: "CmdOrCtrl+Y",
  downloads: "CmdOrCtrl+Shift+J",
  // The desktop mascot's, from any app.
  desktop: "Alt+Space",
} as const;

// An Electron accelerator as the platform writes it: "⇧⌘J" on a Mac, "Ctrl+Shift+J" elsewhere.
export const shortcutWords = (accelerator: string, mac: boolean): string => {
  const keys = accelerator.split("+");
  const key = keys.pop() ?? "";
  if (!mac) return [...keys.map((each) => (each === "CmdOrCtrl" ? "Ctrl" : each)), key].join("+");
  // The Mac's own order: Control, Option, Shift, Command.
  const symbols = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", CmdOrCtrl: "⌘" } as const;
  const order = ["Ctrl", "Alt", "Shift", "CmdOrCtrl"] as const;
  return order.filter((each) => keys.includes(each)).map((each) => symbols[each]).join("") + key;
};
