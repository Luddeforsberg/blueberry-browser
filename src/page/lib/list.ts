import type { AnyElement, PageElement } from "./dom";
import { isTransparent, nameOf, parentOf } from "./names";

export const SELECTOR =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[draggable=true],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true]';
const LOOSE_SELECTOR = '[onclick],[tabindex]:not([tabindex="-1"])';

// Custom checkboxes often draw over a real input that's fully transparent. Anything else that transparent is hidden.
export const visible = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && (style.opacity !== "0" || el.tagName === "INPUT");
};

// A plain query stops at a shadow root, and at a frame. A closed root can't be entered at all, and a frame from
// another origin gives no document, so `browserTools` runs this in those frames separately. A frame nobody can
// see is left out, so a page can't use one to get a click its user never sees.
export const allElements = (root: Document | ShadowRoot, descend: boolean, found: PageElement[] = []): PageElement[] => {
  for (const el of root.querySelectorAll<PageElement>("*")) {
    found.push(el);
    if (el.shadowRoot) allElements(el.shadowRoot, descend, found);
    if (descend && (el.tagName === "IFRAME" || el.tagName === "FRAME") && el.contentDocument && visible(el) && !isTransparent(el)) {
      allElements(el.contentDocument, descend, found);
    }
  }
  return found;
};

// A page's click listeners can't be seen from here, so a pointer cursor is the sign one is there. Children
// inherit it, so only the outermost element that has it counts.
const hasPointer = (el: Element): boolean => getComputedStyle(el).cursor === "pointer";

export const looksClickable = (el: AnyElement): boolean => {
  const declared = el.matches(LOOSE_SELECTOR);
  if (!declared && !hasPointer(el)) return false;
  const parent = parentOf(el);
  if (!declared && parent && hasPointer(parent)) return false;
  return !el.parentElement?.closest(SELECTOR) && !el.querySelector(SELECTOR) && nameOf(el) !== "";
};

// Not made to be clicked, but something to hover over or double-click: a picture, or a piece of text.
export const isPlain = (el: Element): boolean =>
  el.tagName === "IMG" || (el.tagName !== "BODY" && [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()));
