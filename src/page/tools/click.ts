import { expectPressOn, hitAt, pointOn, reaches } from "../lib/aim";
import type { Point } from "../lib/dom";
import { nameOf } from "../lib/names";
import { elementOf, state, withElement } from "../lib/state";

export interface Aim {
  // "scrolled" means it wasn't in the open and now should be, so give the page a moment and aim again.
  status: "aimed" | "disabled" | "scripted" | "covered" | "scrolled";
  x?: number;
  y?: number;
  // What's in the way, when something is.
  by?: string;
  // The watch `watchPress` set, to end once what happened has been read.
  watch?: string;
}

// Scrolled to it and ready for a real click. A dropdown opens a native menu and a file field the Mac's file
// picker, which nobody here can answer, so those are never really clicked.
// Pages often move when they're scrolled, so it only scrolls if it has to, and never in the same step as aiming.
export const aimClick = ({ ref, mayScroll }: { ref: string; mayScroll: boolean }): Aim | null =>
  withElement(ref, (el): Aim => {
    if (el.matches(":disabled")) return { status: "disabled" };
    if (el.tagName === "SELECT" || el.type === "file") return { status: "scripted" };
    const point = pointOn(el);
    const hit = point && hitAt(point);
    if (!point || !reaches(hit, el)) {
      if (mayScroll) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        return { status: "scrolled" };
      }
      if (!point) return { status: "scripted" };
      return { status: "covered", by: (hit && nameOf(hit)) || hit?.tagName.toLowerCase() || "nothing" };
    }
    return { status: "aimed", ...point };
  });

// Just before each press: whether a press at the point would still land on the element, and only then a watch for
// it, which lasts until main ends it by its id. Anything else is reported and nothing should be pressed.
export const watchPress = ({ ref, x, y, pressOnly }: { ref: string; pressOnly: boolean } & Point): Aim | null =>
  withElement(ref, (el): Aim => {
    if (el.matches(":disabled")) return { status: "disabled" };
    const hit = hitAt({ x, y });
    if (!reaches(hit, el)) return { status: "covered", by: (hit && nameOf(hit)) || hit?.tagName.toLowerCase() || "nothing" };
    return { status: "aimed", x, y, watch: expectPressOn(el, { pressOnly }) };
  });

// What became of the press the watch `id` was set for, ending the watch as soon as it's known, so it never stops one of
// the user's own clicks after Berry's. "ended" if that watch is no longer on, ended by its backstop or by another
// watch, so the answer here isn't its. A new page has no record, so null means the input took the page somewhere.
export const pressLanded = ({ id }: { id: string }): boolean | "missed" | "cut" | "ended" | null => {
  const { landed, watch } = state;
  if (landed === undefined) return null;
  if (watch !== id) return "ended";
  if (landed !== false) state.stopWatching?.();
  return landed;
};

// Main is done with the press, however it went. Only the watch it set, so it never ends one set since.
export const endWatch = ({ id }: { id: string }): void => {
  if (state.watch === id) state.stopWatching?.();
};

// For a frame from another origin, and when real input can't get there. Pages can tell this from a person.
export const scriptedClick = ({ ref, clicks }: { ref: string; clicks: 1 | 2 }): "disabled" | "done" | null =>
  withElement(ref, (el) => {
    if (el.matches(":disabled")) return "disabled";
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const box = el.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    };
    for (let count = 1; count <= clicks; count++) {
      const times = { ...at, detail: count };
      el.dispatchEvent(new PointerEvent("pointerdown", times));
      el.dispatchEvent(new MouseEvent("mousedown", times));
      el.focus?.();
      el.dispatchEvent(new PointerEvent("pointerup", times));
      el.dispatchEvent(new MouseEvent("mouseup", times));
      el.click();
    }
    if (clicks === 2) el.dispatchEvent(new MouseEvent("dblclick", { ...at, detail: 2 }));
    return "done";
  });

export const aimHover = ({ ref, mayScroll }: { ref: string; mayScroll: boolean }): Aim | null =>
  withElement(ref, (el): Aim => {
    const point = pointOn(el);
    if (point) return { status: "aimed", ...point };
    if (!mayScroll) return { status: "scripted" };
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return { status: "scrolled" };
  });

export const isHovered = ({ ref }: { ref: string }): boolean | null => withElement(ref, (el) => el.matches(":hover"));

const HOVER_EVENTS: [new (type: string, init: MouseEventInit) => MouseEvent, string][] = [
  [PointerEvent, "pointerover"],
  [PointerEvent, "pointerenter"],
  [MouseEvent, "mouseover"],
  [MouseEvent, "mouseenter"],
  [MouseEvent, "mousemove"],
];

// Enough for a page's own menus. CSS can't be fooled this way, so the tool says when this is all it did.
export const scriptedHover = ({ ref }: { ref: string }): "done" | null =>
  withElement(ref, (el) => {
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const box = el.getBoundingClientRect();
    const at = { bubbles: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    for (const [Type, name] of HOVER_EVENTS) {
      el.dispatchEvent(new Type(name, at));
    }
    return "done";
  });

export interface DragPlan {
  status: "native" | "aimed" | "out-of-view" | "covered" | "disabled";
  from?: Point;
  to?: Point;
}

// A browser's own drag-and-drop, for anything `draggable`, hands over to the Mac as soon as it starts. Real input
// can't carry it on from there and it would catch the user's real pointer, so that kind is played as events,
// which is also how the page hears of it. Anything else listens to the mouse, so it gets a real one.
export const planDrag = ({ ref, toRef }: { ref: string; toRef: string }): DragPlan | null =>
  withElement(ref, (el): DragPlan | null => {
    const to = elementOf(toRef);
    if (!to) return null;
    if (el.matches(":disabled")) return { status: "disabled" };
    const source = el.closest?.("[draggable=true]") ?? (el.draggable ? el : null);
    if (source) {
      const data = new DataTransfer();
      const box = (target: Element): { clientX: number; clientY: number } => {
        const { left, top, width, height } = target.getBoundingClientRect();
        return { clientX: left + width / 2, clientY: top + height / 2 };
      };
      const fire = (target: Element, name: string): boolean =>
        target.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, composed: true, dataTransfer: data, ...box(target) }));
      source.scrollIntoView({ block: "nearest", behavior: "instant" });
      fire(source, "dragstart");
      fire(source, "drag");
      fire(to, "dragenter");
      fire(to, "dragover");
      fire(to, "drop");
      fire(source, "dragend");
      return { status: "native" };
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    to.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const from = pointOn(el);
    const onto = pointOn(to);
    if (!from || !onto) return { status: "out-of-view" };
    if (!reaches(hitAt(from), el) || !reaches(hitAt(onto), to)) return { status: "covered" };
    return { status: "aimed", from, to: onto };
  });
