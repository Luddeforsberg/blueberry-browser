import { expectKey } from "../lib/aim";
import { activeNear, isFrame, type AnyElement, type PageElement } from "../lib/dom";
import { nameOf, roleOf } from "../lib/names";
import { state, withElement } from "../lib/state";

export interface FocusInfo {
  // Null when the focus is on the page itself.
  role: string | null;
  name: string | null;
  // The key can't get there: real keys don't reach a frame from another origin.
  foreignFrame: boolean;
}

// The element with the focus inside this one, through a shadow root or a frame this world can reach.
const focusInside = (el: AnyElement | null): Element | null | undefined =>
  el?.shadowRoot?.activeElement || (el && isFrame(el) ? el.contentDocument?.activeElement : null);

// Where a key would go, and set up to notice that it did.
export const aimKey = (): FocusInfo => {
  let at: AnyElement | null = document.activeElement;
  for (let inner = focusInside(at); inner; inner = focusInside(at)) at = inner;
  if (isFrame(at)) return { role: null, name: null, foreignFrame: true };
  expectKey(at?.ownerDocument.defaultView ?? window);
  if (!at || at === at.ownerDocument.body || at === at.ownerDocument.documentElement)
    return { role: null, name: null, foreignFrame: false };
  return { role: roleOf(at), name: nameOf(at), foreignFrame: false };
};

// False until the key `aimKey` set up for arrives, then true. A new page has no record, so null means the key took
// the page somewhere.
export const keyLanded = (): boolean | null => state.keyed ?? null;

const NOT_A_FIELD: (string | undefined)[] = ["checkbox", "radio", "button", "submit", "reset", "image", "file"];

// Text as a rich editor shows it: a new line may come back as a block, which reads as one or more, a space as one that
// doesn't break, an empty line held open by a character with no width, and an empty editor as a single line break.
const asShown = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\n+/g, "\n")
    .replace(/\n$/, "");

// Whether the field holds exactly what was typed, and nothing it had before.
const holds = (el: PageElement, text: string): boolean =>
  el.isContentEditable ? asShown(el.innerText) === asShown(text) : el.value === text;

export const typeIntoElement = ({ ref, text }: { ref: string; text: string }): string | null =>
  withElement(ref, (el) => {
    if (el.tagName === "SELECT") return "dropdown";
    if (NOT_A_FIELD.includes(el.type)) return "not-a-field";
    if (el.disabled || el.readOnly) return "disabled";
    const editable = el.isContentEditable || "value" in el;
    if (!editable) return "not-a-field";
    const doc = el.ownerDocument;
    el.scrollIntoView({ block: "center" });
    doc.defaultView?.focus();
    el.focus();
    if (el.isContentEditable) {
      doc.getSelection()?.selectAllChildren(el);
    } else if (el.select) {
      el.select();
    }
    if (!doc.execCommand("insertText", false, text) || (!el.isContentEditable && el.value !== text)) {
      if (el.isContentEditable) el.textContent = text;
      else el.value = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (!holds(el, text)) return "not-kept";
    return "done";
  });

// The same as `typeIntoElement`, a piece at a time, while someone is watching. Ends in `finishTyping`, which falls back
// on `typeIntoElement` if what's there isn't what was meant, so a page gets the same result either way.
export const beginTyping = ({ ref }: { ref: string }): string | null =>
  withElement(ref, (el) => {
    if (el.tagName === "SELECT") return "dropdown";
    if (NOT_A_FIELD.includes(el.type)) return "not-a-field";
    if (el.disabled || el.readOnly) return "disabled";
    if (!el.isContentEditable && !("value" in el)) return "not-a-field";
    const doc = el.ownerDocument;
    el.scrollIntoView({ block: "center" });
    doc.defaultView?.focus();
    el.focus();
    if (el.isContentEditable) doc.getSelection()?.selectAllChildren(el);
    else el.select?.();
    return "ready";
  });

// Never takes the focus back, because it may be the user who moved it.
export const typeChunk = ({ ref, chunk }: { ref: string; chunk: string }): boolean | null =>
  withElement(ref, (el) => {
    if (activeNear(el) !== el) return false;
    return el.ownerDocument.execCommand("insertText", false, chunk);
  });

export const finishTyping = ({ ref, text }: { ref: string; text: string }): "again" | "done" | null =>
  withElement(ref, (el) => {
    if (!holds(el, text)) return "again";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    // A page's own listener can change it, and what comes next mustn't go ahead on something else.
    return holds(el, text) ? "done" : "again";
  });

// A real key goes wherever the focus is, and a page can move that after typing.
export const hasFocus = ({ ref }: { ref: string }): boolean | null => withElement(ref, (el) => activeNear(el) === el);

// Enter for a field that's just been typed into, where real keys can't reach it.
export const scriptedEnter = ({ ref }: { ref: string }): "done" | null =>
  withElement(ref, (el) => {
    const options = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const proceed = el.dispatchEvent(new KeyboardEvent("keydown", options));
    el.dispatchEvent(new KeyboardEvent("keyup", options));
    if (proceed && el.form) el.form.requestSubmit();
    return "done";
  });
