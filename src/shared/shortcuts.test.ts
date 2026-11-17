import { describe, expect, it } from "vitest";
import { SHORTCUTS, shortcutKeys, shortcutWords } from "./shortcuts";

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

describe("shortcutKeys", () => {
  it("gives each key on its own, as a tooltip shows them", () => {
    expect(shortcutKeys(SHORTCUTS.newTab, false)).toEqual(["Ctrl", "T"]);
    expect(shortcutKeys(SHORTCUTS.newTab, true)).toEqual(["⌘", "T"]);
    expect(shortcutKeys(SHORTCUTS.downloads, false)).toEqual(["Ctrl", "Shift", "J"]);
    expect(shortcutKeys(SHORTCUTS.downloads, true)).toEqual(["⇧", "⌘", "J"]);
    expect(shortcutKeys(SHORTCUTS.desktop, true)).toEqual(["⌥", "Space"]);
  });

  it("writes arrows as arrows", () => {
    expect(shortcutKeys(SHORTCUTS.back, false)).toEqual(["Ctrl", "←"]);
    expect(shortcutKeys(SHORTCUTS.forward, true)).toEqual(["⌘", "→"]);
  });
});
