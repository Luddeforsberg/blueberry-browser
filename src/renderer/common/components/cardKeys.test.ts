import { describe, expect, it } from "vitest";
import { ARM_MS, keyAction, keyCounts } from "./cardKeys";

describe("keys on a card", () => {
  const press = { inside: true, repeat: false, armedAt: 1000 };

  it("counts a key pressed on the card once it has been there half a second", () => {
    expect(keyCounts({ ...press, at: 1000 + ARM_MS })).toBe(true);
    expect(keyCounts({ ...press, at: 1000 + 5000 })).toBe(true);
  });

  it.each([0, 1, ARM_MS - 1])("doesn't count one %i ms after the card appeared or took the keyboard", (after) => {
    expect(keyCounts({ ...press, at: 1000 + after })).toBe(false);
  });

  it("never counts a key held down", () => {
    expect(keyCounts({ ...press, repeat: true, at: 1000 + 5000 })).toBe(false);
  });

  it("never counts a key with the keyboard outside the card", () => {
    expect(keyCounts({ ...press, inside: false, at: 1000 + 5000 })).toBe(false);
  });
});

describe("what a key on a card does", () => {
  const onAllow = { key: "Enter", modified: false, field: false, onCard: false, picks: 0, canEnter: true, canEscape: true, inside: true, repeat: false, at: 6000, armedAt: 1000 };

  it("leaves a fresh Enter on a focused button to press that button", () => {
    expect(keyAction(onAllow)).toBe("ignore");
  });

  it("allows with Enter only with the keyboard on the card itself", () => {
    expect(keyAction({ ...onAllow, onCard: true })).toBe("enter");
  });

  it.each([
    ["held down", { repeat: true }],
    ["too soon", { at: 1000 + ARM_MS - 1 }],
    ["held down with Ctrl", { repeat: true, modified: true }],
    ["too soon with Ctrl", { at: 1000 + ARM_MS - 1, modified: true }],
  ])("stops Enter on a focused button when it is %s, so the button is not pressed", (_, press) => {
    expect(keyAction({ ...onAllow, ...press })).toBe("stop");
  });

  it("stops Space the same way, and leaves it alone in a field", () => {
    expect(keyAction({ ...onAllow, key: " ", repeat: true, modified: true })).toBe("stop");
    expect(keyAction({ ...onAllow, key: " ", field: true, repeat: true })).toBe("ignore");
  });

  it("never answers with a modifier down, and leaves a copy shortcut alone", () => {
    expect(keyAction({ ...onAllow, onCard: true, modified: true })).toBe("ignore");
    expect(keyAction({ ...onAllow, key: "Escape", modified: true })).toBe("ignore");
    expect(keyAction({ ...onAllow, key: "c", picks: 3, modified: true, repeat: true })).toBe("ignore");
  });

  it("picks an offered answer by its letter, but not while typing", () => {
    expect(keyAction({ ...onAllow, key: "b", picks: 2 })).toBe(1);
    expect(keyAction({ ...onAllow, key: "c", picks: 2 })).toBe("ignore");
    expect(keyAction({ ...onAllow, key: "b", picks: 2, field: true })).toBe("ignore");
  });
});
