import type { CDPSession } from "playwright-core";
import type { AgentInput } from "./pageTarget";

// Real input for a page reached over CDP, with `Input.dispatch*`: what `pageInput.ts` sends, as the window's own tabs
// get it from `sendInputEvent`.

// What `pageInput.ts` names keys, and what CDP needs to know about each.
const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  Up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  Down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  Left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  Right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  Home: { key: "Home", code: "Home", keyCode: 36 },
  End: { key: "End", code: "End", keyCode: 35 },
  PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
  PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
};

const keyOf = (name: string) => {
  const known = KEYS[name] ?? (name === " " ? KEYS.Space : undefined);
  if (known) return known;
  const upper = name.toUpperCase();
  return { key: name, code: "", keyCode: /^[A-Z0-9]$/.test(upper) ? upper.charCodeAt(0) : 0, text: name };
};

const SHIFT = 8;

export class CdpInput {
  private pressed = false;

  constructor(private readonly session: CDPSession) {}

  async send(event: AgentInput): Promise<void> {
    if (!("keyCode" in event)) {
      if (event.type === "mouseDown") this.pressed = true;
      const held = this.pressed;
      if (event.type === "mouseUp") this.pressed = false;
      await this.session.send("Input.dispatchMouseEvent", {
        type: event.type === "mouseMove" ? "mouseMoved" : event.type === "mouseDown" ? "mousePressed" : "mouseReleased",
        x: event.x,
        y: event.y,
        button: event.type === "mouseMove" && !held ? "none" : "left",
        buttons: event.type === "mouseUp" || !held ? 0 : 1,
        clickCount: event.type === "mouseMove" ? 0 : (event.clickCount ?? 1),
      });
      return;
    }
    const { key, code, keyCode, text } = keyOf(event.keyCode);
    const modifiers = event.modifiers?.includes("shift") ? SHIFT : 0;
    if (event.type === "char") {
      // Only a key that types something has a character. Enter's is what submits a form.
      if (!text) return;
      const typed = modifiers && text.length === 1 ? text.toUpperCase() : text;
      await this.session.send("Input.dispatchKeyEvent", { type: "char", text: typed, unmodifiedText: text, key, modifiers });
      return;
    }
    await this.session.send("Input.dispatchKeyEvent", {
      type: event.type === "keyDown" ? "rawKeyDown" : "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers,
    });
  }
}
