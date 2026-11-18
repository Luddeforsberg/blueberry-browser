import { describe, expect, it } from "vitest";
import { menuShortcut, SHORTCUTS, shortcutKeys, shortcutWords } from "./shortcuts";

describe("shortcutWords", () => {
  it("writes a shortcut the way each platform does", () => {
    expect(shortcutWords(SHORTCUTS.settings, true)).toBe("⌘,");
    expect(shortcutWords(SHORTCUTS.downloads, true)).toBe("⇧⌘J");
    expect(shortcutWords(SHORTCUTS.settings, false)).toBe("Ctrl+,");
    expect(shortcutWords(SHORTCUTS.downloads, false)).toBe("Ctrl+Shift+J");
  });

  it("puts a Mac's modifiers in its own order, whatever order they're written in", () => {
    expect(shortcutWords("Shift+Alt+CmdOrCtrl+Ctrl+K", true)).toBe("⌃⌥⇧⌘K");
  });
});

describe("menuShortcut", () => {
  it("writes the keys apart off a Mac and together on one", () => {
    expect(menuShortcut("CmdOrCtrl+C", false)).toBe("Ctrl C");
    expect(menuShortcut("CmdOrCtrl+Shift+R", false)).toBe("Ctrl Shift R");
    expect(menuShortcut("CmdOrCtrl+C", true)).toBe("⌘C");
  });
});

describe("shortcutKeys", () => {
  it("gives each key on its own, as a tooltip shows them", () => {
    expect(shortcutKeys(SHORTCUTS.newTab, false)).toEqual(["Ctrl", "T"]);
    expect(shortcutKeys(SHORTCUTS.newTab, true)).toEqual(["⌘", "T"]);
    expect(shortcutKeys(SHORTCUTS.downloads, false)).toEqual(["Ctrl", "Shift", "J"]);
    expect(shortcutKeys(SHORTCUTS.downloads, true)).toEqual(["⇧", "⌘", "J"]);
    expect(shortcutKeys(SHORTCUTS.desktop, true)).toEqual(["⌥", "Space"]);
  });

  it("reads the other names Electron takes, and puts the modifiers in one order off a Mac too", () => {
    expect(shortcutKeys("Shift+CmdOrCtrl+Z", false)).toEqual(["Ctrl", "Shift", "Z"]);
    expect(shortcutKeys("Alt+Command+I", true)).toEqual(["⌥", "⌘", "I"]);
    expect(shortcutKeys("Ctrl+Command+F", true)).toEqual(["⌃", "⌘", "F"]);
    expect(shortcutKeys("F11", false)).toEqual(["F11"]);
  });

  it("writes arrows as arrows", () => {
    expect(shortcutKeys(SHORTCUTS.back, false)).toEqual(["Ctrl", "←"]);
    expect(shortcutKeys(SHORTCUTS.forward, true)).toEqual(["⌘", "→"]);
  });
});
