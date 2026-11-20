import { isElement, isFrame, type AnyElement, type Point } from "./dom";
import { parentOf } from "./names";
import { state } from "./state";

// Main ends the watch once it knows what happened, however slowly the input arrives. This only ends one a job left behind,
// so it can't keep stopping the user's own clicks.
const WATCH_BACKSTOP_MS = 60_000;
const PRESSES = new Set(["pointerdown", "mousedown"]);

// Where real input should go for this element, in the top page's pixels, or null if it can't go there: it's off
// screen, or inside a frame from another origin, where the top page can't measure it and real input doesn't reach.
export const pointOn = (el: Element): Point | null => {
  const box = el.getClientRects()[0];
  if (!box || window.top !== window) return null;
  let x = box.left + box.width / 2;
  let y = box.top + box.height / 2;
  for (let win: Window | null = el.ownerDocument.defaultView; win !== window; win = win.parent) {
    const owner = win?.frameElement;
    if (!win || !owner) return null;
    const outer = owner.getBoundingClientRect();
    x += outer.left + owner.clientLeft;
    y += outer.top + owner.clientTop;
  }
  return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? { x, y } : null;
};

// What a person's click there would land on, through shadow roots and same-origin frames.
export const hitAt = ({ x, y }: Point): AnyElement | null => {
  let hit: AnyElement | null = document.elementFromPoint(x, y);
  let left = 0;
  let top = 0;
  for (;;) {
    const inner = hit?.shadowRoot?.elementFromPoint(x - left, y - top);
    if (inner && inner !== hit) {
      hit = inner;
    } else if (hit && isFrame(hit) && hit.contentDocument) {
      const outer = hit.getBoundingClientRect();
      left += outer.left + hit.clientLeft;
      top += outer.top + hit.clientTop;
      hit = hit.contentDocument.elementFromPoint(x - left, y - top);
    } else {
      return hit;
    }
  }
};

const isInside = (el: Element, outer: Element): boolean => {
  for (let at: Element | null = el; at; at = parentOf(at)) if (at === outer) return true;
  return false;
};

// A label counts as the field it's for. The page's body doesn't count as anything, because it means the
// element lets clicks through to nothing in particular.
export const reaches = (hit: Element | null, el: AnyElement): boolean => {
  if (!hit || hit === hit.ownerDocument.body || hit === hit.ownerDocument.documentElement) return false;
  return isInside(hit, el) || isInside(el, hit) || [...(el.labels ?? [])].some((label) => isInside(hit, label));
};

// Real input is checked by whether it arrives, because nothing says when it goes astray.
export const expect = (win: Window, type: string): void => {
  state.landed = false;
  win.addEventListener(
    type,
    () => {
      state.landed = true;
    },
    { capture: true, once: true },
  );
};

// A page can move between aiming and pressing, or put something new under the pointer once pressed, and the card
// named this element and nothing else. So whatever arrives on anything else is stopped before the page's own
// listeners, for the whole click. A drag only guards its press, because it's meant to let go somewhere else.
// Returns the watch's id, which is the only way to end it.
export const expectPressOn = (el: AnyElement, { pressOnly = false } = {}): string => {
  state.stopWatching?.();
  state.landed = false;
  const id = Math.random().toString(36).slice(2);
  const targets = new Set([window, el.ownerDocument.defaultView ?? window]);
  const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"];
  const watch = (event: Event): void => {
    if (!event.isTrusted) return;
    const first = event.composedPath()[0];
    const onIt = reaches(isElement(first) ? first : null, el);
    // A press that reaches it counts whatever came before, since the user may have pressed somewhere else meanwhile,
    // so "missed" only ever means that no press reached it.
    if (onIt && PRESSES.has(event.type) && state.landed !== "cut") state.landed = true;
    else if (state.landed === false) state.landed = onIt ? true : "missed";
    // The press reached it but the rest of the click is about to be stopped, so it may or may not have counted.
    else if (state.landed === true && !onIt && !pressOnly) state.landed = "cut";
    if (onIt || (pressOnly && state.landed === true)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const timer = setTimeout(() => state.stopWatching?.(), WATCH_BACKSTOP_MS);
  state.watch = id;
  state.stopWatching = () => {
    clearTimeout(timer);
    targets.forEach((win) => types.forEach((type) => win.removeEventListener(type, watch, true)));
    state.stopWatching = null;
    state.watch = null;
  };
  targets.forEach((win) => types.forEach((type) => win.addEventListener(type, watch, true)));
  return id;
};
