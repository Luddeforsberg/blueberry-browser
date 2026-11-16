import { describe, expect, it } from "vitest";
import { SHORTCUTS, shortcutWords } from "./shortcuts";

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
