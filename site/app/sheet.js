import { el, icon, region } from "./dom.js";
import { followLive, placeLive } from "./live.js";

// A sheet over the screen: starting a job, being asked, Settings. One at a time, rising from the bottom over a dimmed
// screen, which can't be reached while it's up. Escape, the cross, tapping outside or dragging it down puts it away.

/** @typedef {"start" | "ask" | "settings"} SheetKind */
/**
 * @type {{ kind: SheetKind, node: HTMLElement, veil: HTMLElement, body: HTMLElement, onClose?: () => void, returnTo: Element | null } | null}
 */
let current = null;

export const sheetKind = () => current?.kind ?? null;
export const sheetBody = () => current?.body ?? null;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Dragging the top of a sheet down takes it with the finger, and far enough puts it away.
/** @param {HTMLElement} handle @param {HTMLElement} node */
const draggable = (handle, node) => {
  /** @type {number | null} */
  let from = null;
  let moved = 0;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    from = event.clientY;
    moved = 0;
    handle.setPointerCapture(event.pointerId);
    node.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (from === null) return;
    moved = Math.max(0, event.clientY - from);
    node.style.transform = `translateY(${moved}px)`;
    placeLive();
  });
  const end = () => {
    if (from === null) return;
    from = null;
    node.classList.remove("dragging");
    node.style.transform = "";
    if (moved > 90) closeSheet();
    else followLive(300);
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
};

// `top` is what sits in the draggable top of the sheet, under its handle.
/** @param {{ kind: SheetKind, label: string, top?: Node[], onClose?: () => void }} sheet */
export const openSheet = ({ kind, label, top = [], onClose }) => {
  if (current) closeSheet({ instant: true });
  const returnTo = document.activeElement;
  const cross = el(
    "button",
    { type: "button", className: "round soft sheet-close", ariaLabel: "Close", onclick: () => closeSheet() },
    icon("close"),
  );
  const handle = el("div", { className: "sheet-top" }, el("i", { className: "grab", ariaHidden: "true" }), ...top);
  const body = el("div", { className: "sheet-body", dataClip: "" });
  const node = el(
    "section",
    { className: `sheet ${kind}`, role: "dialog", ariaModal: "true", ariaLabel: label, tabIndex: -1, dataLayer: "2" },
    handle,
    cross,
    body,
  );
  const veil = el("div", { className: "veil", ariaHidden: "true", onclick: () => closeSheet() });
  region("sheets").append(veil, node);
  region("app").inert = true;
  draggable(handle, node);
  current = { kind, node, veil, body, onClose, returnTo };
  // Drawn once out of sight, then risen, so it slides.
  node.getBoundingClientRect();
  node.classList.add("in");
  veil.classList.add("in");
  followLive();
  // The keyboard goes to the sheet itself, not to a button in it, so Enter never answers by accident.
  node.focus({ preventScroll: true });
  return current;
};

export const closeSheet = ({ instant = false } = {}) => {
  if (!current) return;
  const { node, veil, onClose, returnTo } = current;
  current = null;
  node.dataset.closing = "1";
  node.classList.remove("in");
  veil.classList.remove("in");
  region("app").inert = false;
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    node.remove();
    veil.remove();
    placeLive();
  };
  if (instant || reduced()) remove();
  else {
    node.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 400);
  }
  followLive();
  onClose?.();
  if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus({ preventScroll: true });
};

// The keyboard stays in the sheet while it's up, and Escape puts it away.
document.addEventListener("keydown", (event) => {
  if (!current) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== "Tab") return;
  const inside = [...current.node.querySelectorAll(FOCUSABLE)].filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
  const first = inside[0];
  const last = inside.at(-1);
  if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === current.node)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Sheets sit on the keyboard rather than under it.
const keyboard = () => {
  const view = visualViewport;
  const covered = view ? Math.max(0, innerHeight - view.height - view.offsetTop) : 0;
  document.documentElement.style.setProperty("--keyboard", `${Math.round(covered)}px`);
};
visualViewport?.addEventListener("resize", keyboard);
visualViewport?.addEventListener("scroll", keyboard);
keyboard();
