// The DOM's types tell kinds of element apart, and these scripts read any element the same way, finding nothing where
// its kind has no such property. These types say that: what one kind of element has, any element may have.
type Some<T, K extends keyof T> = { [P in K]?: T[P] };

type Extras = Some<
  HTMLInputElement,
  | "type"
  | "value"
  | "name"
  | "placeholder"
  | "form"
  | "labels"
  | "disabled"
  | "readOnly"
  | "autocomplete"
  | "formMethod"
  | "formAction"
  | "checked"
  | "selectionStart"
  | "selectionEnd"
  | "maxLength"
  | "select"
> &
  Some<HTMLSelectElement, "options" | "selectedOptions"> &
  Some<HTMLAnchorElement, "href"> &
  Some<HTMLIFrameElement, "contentDocument" | "contentWindow" | "src"> &
  Some<HTMLImageElement, "alt"> &
  Some<HTMLLabelElement, "control">;

// Any element at all, such as one under a point.
export type AnyElement = Element &
  Some<HTMLElement, "innerText" | "isContentEditable" | "title" | "draggable" | "focus" | "click"> &
  Extras;

// One the tools list and act on, which they treat as an HTML element, as a page's own scripts do.
export type PageElement = HTMLElement & Extras;

export interface Point {
  x: number;
  y: number;
}

export const isElement = (target: EventTarget | null | undefined): target is Element =>
  !!target && "nodeType" in target && target.nodeType === 1;

export const isNode = (target: EventTarget | null | undefined): target is Node => !!target && "nodeType" in target;

export const isSelect = (el: Element): el is HTMLSelectElement => el.tagName === "SELECT";

export const isInput = (el: Element): el is HTMLInputElement => el.tagName === "INPUT";

export const isIFrame = (el: Element | null | undefined): el is HTMLIFrameElement => el?.tagName === "IFRAME";

export const isFrame = (el: Element | null | undefined): boolean => el?.tagName === "IFRAME" || el?.tagName === "FRAME";

// An element's root is its document, a shadow root, a fragment, or the element itself when it's in none of them. Only
// some of those have each of these.
const canFind = (root: Node): root is Document | DocumentFragment => "getElementById" in root;
const hasFocus = (root: Node): root is Document | ShadowRoot => "activeElement" in root;
const hasHost = (root: Node): root is ShadowRoot => "host" in root;

export const byIdNear = (el: Element, id: string): HTMLElement | null | undefined => {
  const root = el.getRootNode();
  return canFind(root) ? root.getElementById(id) : undefined;
};

export const activeNear = (el: Element): Element | null | undefined => {
  const root = el.getRootNode();
  return hasFocus(root) ? root.activeElement : undefined;
};

export const hostOf = (el: Element): Element | undefined => {
  const root = el.getRootNode();
  return hasHost(root) ? root.host : undefined;
};

// The same as `cloneNode(true)`, which makes the copy in the element's own document, but typed as what it copies.
export const copyOf = <T extends Element>(el: T): T => el.ownerDocument.importNode(el, true);

// The element with the focus, through shadow roots and the frames this world can reach.
export const deepActive = (): AnyElement | null => {
  const inside = (el: AnyElement | null): Element | null | undefined => el?.shadowRoot?.activeElement || el?.contentDocument?.activeElement;
  let at: AnyElement | null = document.activeElement;
  for (let inner = inside(at); inner; inner = inside(at)) at = inner;
  return at;
};
