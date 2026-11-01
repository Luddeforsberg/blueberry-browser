import { SHARED } from "./pageScripts";

// What watches the user while they show Berry something. It runs in a world of its own, apart from the tools' and the
// page's, so no tool can reach it and no page can see it. It stops existing at Stop, and nothing here touches the disk.
//
// Secret fields are decided before any value is read, and `secretKind` returning anything means `.value` is never touched
// for that field. Keys are looked at only for being Enter, so what's typed is only ever read from a field, once, when the
// user has finished with it. A secret has no label either, because a page chooses its labels.

const MAX_VALUE_LENGTH = 200;
const MAX_QUEUE = 40;
// Longer than this, the text of something with no role is the page's content rather than a name for it.
const MAX_PLAIN_NAME = 60;

const SCRIPT = `
  ${SHARED}
  const queue = [];
  let wake = null;
  const push = (note) => {
    if (queue.length >= ${MAX_QUEUE}) return;
    queue.push(note);
    if (wake) {
      const answer = wake;
      wake = null;
      answer(queue.splice(0));
    }
  };

  const ROLES = "a,button,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=switch],input[type=submit],input[type=button],input[type=image]";
  const NOT_TEXT = ["checkbox", "radio", "button", "submit", "reset", "image", "file", "hidden", "range", "color"];
  const holdsText = (el) =>
    el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !NOT_TEXT.includes(el.type));
  const realTarget = (event) => {
    const first = event.composedPath()[0];
    return first?.nodeType === 1 ? first : first?.parentElement ?? null;
  };

  // Once a secret, always one: a page's "show password" turns the field into plain text.
  const secrets = new WeakMap();
  const secretKind = (el) => {
    const known = secrets.get(el);
    if (known) return known;
    const named = (el.getAttribute?.("name") ?? "") + " " + (el.id ?? "");
    const filled = el.getAttribute?.("autocomplete") ?? "";
    const form = el.form ?? el.closest?.("form");
    const kind =
      el.type === "password" || /password/i.test(filled) || /pass|pwd/i.test(named) || getComputedStyle(el).webkitTextSecurity !== "none" ? "password"
      : /cc-/i.test(filled) || /card|cc.?(num|exp|name)|cvc|cvv|iban/i.test(named) ? "card"
      : /one-time-code/i.test(filled) || isSecret(el) ? "code"
      : form?.querySelector?.("input[type=password]") ? "sign-in"
      : null;
    if (kind) secrets.set(el, kind);
    return kind;
  };
  // A card number in a plain field looks the same to everyone, whatever the page calls the field.
  const looksLikeCard = (value) => /^\\d[\\d -]{11,22}\\d$/.test(value.trim());

  const fieldName = (el) => {
    const labelled = el.getAttribute("aria-labelledby");
    const byId = labelled && el.getRootNode().getElementById?.(labelled)?.innerText;
    return clip(el.getAttribute("aria-label") || byId || labelOf(el) || el.placeholder || el.title || el.getAttribute("name") || "");
  };

  const dirty = new Set();
  const sent = new WeakMap();
  // The only place a field's value is read, and only after it's been ruled out as a secret.
  const finishField = (el) => {
    const wasDirty = dirty.delete(el);
    const secret = secretKind(el);
    if (secret) {
      if (wasDirty) push({ type: "secret", secret });
      return;
    }
    const value = (el.isContentEditable ? el.innerText : el.value) ?? "";
    if (!value.trim() || sent.get(el) === value) return;
    sent.set(el, value);
    if (looksLikeCard(value)) push({ type: "secret", secret: "card" });
    else push({ type: "typed", label: fieldName(el), value: value.replace(/\\s+/g, " ").trim().slice(0, ${MAX_VALUE_LENGTH}) });
  };
  const finishAll = () => [...dirty].forEach(finishField);

  const stopping = new AbortController();
  const on = (where, type, listen) => where.addEventListener(type, listen, { capture: true, signal: stopping.signal });
  const trusted = (listen) => (event) => {
    if (event.isTrusted) listen(event);
  };

  const watch = (where) => {
    on(where, "focusin", trusted((event) => {
      const el = realTarget(event);
      if (el && holdsText(el)) secretKind(el);
    }));
    on(where, "input", trusted((event) => {
      const el = realTarget(event);
      if (el && holdsText(el)) dirty.add(el);
    }));
    on(where, "focusout", trusted((event) => {
      const el = realTarget(event);
      if (el && dirty.has(el)) finishField(el);
    }));
    on(where, "keydown", trusted((event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const el = realTarget(event);
      if (!el || !holdsText(el) || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      finishField(el);
      const secret = secretKind(el);
      push(secret ? { type: "enter", secret } : { type: "enter", label: fieldName(el) });
    }));
    on(where, "change", trusted((event) => {
      const el = realTarget(event);
      if (!el) return;
      if (holdsText(el)) finishField(el);
      else if (el.tagName === "SELECT") push({ type: "chose", label: fieldName(el), value: clip([...el.selectedOptions].map((option) => option.text).join(", ")) });
      else if (el.type === "checkbox") push({ type: "ticked", label: nameOf(el), checked: el.checked });
      else if (el.type === "radio") push({ type: "chose", label: fieldName(el.closest("fieldset") ?? el), value: nameOf(el) });
      else if (el.type === "file") push({ type: "file", label: fieldName(el) });
    }));
    on(where, "click", trusted((event) => {
      const el = realTarget(event);
      if (!el || el.closest("input,textarea,select,[contenteditable=true],[contenteditable='']")) return;
      const control = el.closest(ROLES);
      // A label for a box is reported by the box.
      if (control?.tagName === "LABEL" && control.control) return;
      if (control) {
        push({ type: "click", label: nameOf(control), role: roleOf(control) });
        return;
      }
      const text = (el.innerText ?? "").trim();
      if (el !== document.body && el !== document.documentElement && text && text.length <= ${MAX_PLAIN_NAME}) push({ type: "click", label: clip(text), role: "element" });
    }));
    on(where, "pagehide", trusted(finishAll));
    // A frame this world can reach is watched the same way.
    on(where, "load", trusted((event) => {
      if (event.target?.tagName === "IFRAME") watchFrame(event.target);
    }));
  };
  // A frame is here when this starts and then says it has loaded, and it's only to be watched once.
  const watching = new WeakSet();
  const watchFrame = (frame) => {
    try {
      const { document: inside } = frame.contentWindow;
      if (watching.has(inside)) return;
      watching.add(inside);
      watch(frame.contentWindow);
    } catch {
      // Another origin can't be reached from here. It's only ever noted as being used, below.
    }
  };
  watch(window);
  document.querySelectorAll("iframe").forEach(watchFrame);
  // Focus moving into a frame from another origin is all anyone outside it can see, and that's all that's noted.
  on(window, "blur", trusted(() => {
    const frame = document.activeElement;
    if (frame?.tagName !== "IFRAME") return;
    try {
      if (frame.contentWindow.document) return;
    } catch {
      // It's another origin.
    }
    let host = "";
    try {
      host = new URL(frame.src).hostname;
    } catch {
      // Nothing to name it by.
    }
    push({ type: "frame", host });
  }));

  globalThis.__watching = {
    next: () => (queue.length > 0 ? Promise.resolve(queue.splice(0)) : new Promise((answer) => (wake = answer))),
    // Whoever's waiting hears nothing but that it's over, or it would ask again and start all this up again.
    finish: () => {
      const waiting = wake;
      wake = null;
      finishAll();
      stopping.abort();
      delete globalThis.__watching;
      waiting?.(null);
      return queue.splice(0);
    },
  };
`;

// Answers with what's happened since it was last asked, as soon as there's anything. The answer leaves before a click's
// default action runs, so a click that goes to another page still gets here. A new page answers nothing, ever.
export const nextNotes = `(() => {
  if (!globalThis.__watching) {
    ${SCRIPT}
  }
  return globalThis.__watching.next();
})()`;

// Whatever's still in a field, and then nothing is left running in the page.
export const finishWatching = `globalThis.__watching?.finish() ?? []`;
