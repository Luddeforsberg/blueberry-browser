import { describe, expect, it, vi } from "vitest";
import type React from "react";
import { isEnter, sendOnEnter } from "./keys";

const press = (key: { key?: string; shiftKey?: boolean; repeat?: boolean; ctrlKey?: boolean; isComposing?: boolean } = {}) => {
  const event = {
    key: "Enter",
    shiftKey: false,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    ...key,
    nativeEvent: { isComposing: key.isComposing ?? false },
    preventDefault: vi.fn(),
  };
  return event as unknown as React.KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
};

describe("Enter in a prompt box", () => {
  it("leaves an Enter that chooses an input method's words to the text, and sends on the next one, once", () => {
    const send = vi.fn();
    const choosing = press({ isComposing: true });
    expect(sendOnEnter(choosing, send)).toBe(false);
    expect(choosing.preventDefault).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    const pressed = press();
    expect(sendOnEnter(pressed, send)).toBe(true);
    expect(pressed.preventDefault).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(false);
  });

  it("makes a new line with Shift, asks with Ctrl, and never sends for a key held down", () => {
    const send = vi.fn();
    expect(sendOnEnter(press({ shiftKey: true }), send)).toBe(false);
    const held = press({ repeat: true });
    expect(sendOnEnter(held, send)).toBe(true);
    expect(held.preventDefault).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    sendOnEnter(press({ ctrlKey: true }), send);
    expect(send).toHaveBeenCalledWith(true);
  });

  it("reads a DOM key event as well as React's", () => {
    const dom = (isComposing: boolean) => ({ key: "Enter", isComposing }) as KeyboardEvent;
    expect(isEnter(dom(true))).toBe(false);
    expect(isEnter(dom(false))).toBe(true);
    expect(isEnter(press({ key: "a" }))).toBe(false);
  });
});
