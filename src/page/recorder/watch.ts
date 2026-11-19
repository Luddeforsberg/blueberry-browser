import { byIdNear, isElement, isIFrame, isNode, isSelect, type AnyElement } from "../lib/dom";
import { clip, isSecret, labelOf, nameOf, roleOf } from "../lib/names";

// What watches the user while they show Berry something. It runs in a world of its own, apart from the tools' and the
// page's, so no tool can reach it and no page can see it. It stops existing at Stop, and nothing here touches the disk.
//
// Secret fields are decided before any value is read, and `secretKind` returning anything means `.value` is never touched
// for that field. Keys are looked at only for being Enter or Tab, so what's typed is only ever read from a field, once, when
// the user has finished with it. A secret has no label either, because a page chooses its labels. The clipboard is never
// read: a copy is what's selected on the page, and a paste is only noted as happening.

const MAX_VALUE_LENGTH = 200;
const MAX_QUEUE = 40;
// Longer than this, the text of something with no role is the page's content rather than a name for it.
const MAX_PLAIN_NAME = 60;

type Secret = "password" | "card" | "code" | "sign-in";

export type Note =
  | { type: "secret"; secret: Secret; copied?: true }
  | { type: "typed"; label: string; value: string }
  | { type: "copied"; value: string }
  | { type: "enter"; secret: Secret }
  | { type: "enter"; label: string }
  | { type: "chose"; label: string; value: string }
  | { type: "ticked"; label: string; checked: boolean | undefined }
  | { type: "file"; label: string }
  | { type: "pasted"; label: string }
  | { type: "click"; label: string; role: string }
  | { type: "frame"; host: string };

export interface Watching {
  next(): Promise<Note[] | null>;
  finish(): Note[];
}

declare global {
  var __watching: Watching | undefined;
  // Not in the DOM's types, but every browser this runs in has it.
  interface CSSStyleDeclaration {
    webkitTextSecurity: string;
  }
}

const ROLES =
  "a,button,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=switch],input[type=submit],input[type=button],input[type=image]";
const NOT_TEXT: (string | undefined)[] = ["checkbox", "radio", "button", "submit", "reset", "image", "file", "hidden", "range", "color"];
const holdsText = (el: AnyElement): boolean =>
  !!el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !NOT_TEXT.includes(el.type));
const realTarget = (event: Event): AnyElement | null => {
  const first = event.composedPath()[0];
  return isElement(first) ? first : isNode(first) ? first.parentElement : null;
};
// A card number in a plain field looks the same to everyone, whatever the page calls the field.
const looksLikeCard = (value: string): boolean => /^\d[\d -]{11,22}\d$/.test(value.trim());
const shortValue = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, MAX_VALUE_LENGTH);

const fieldName = (el: AnyElement): string => {
  const labelled = el.getAttribute("aria-labelledby");
  const byId = labelled && byIdNear(el, labelled)?.innerText;
  return clip(el.getAttribute("aria-label") || byId || labelOf(el) || el.placeholder || el.title || el.getAttribute("name") || "");
};

const kindOf = (el: AnyElement): Secret | null => {
  const named = (el.getAttribute?.("name") ?? "") + " " + (el.id ?? "");
  const filled = el.getAttribute?.("autocomplete") ?? "";
  const form = el.form ?? el.closest?.("form");
  return el.type === "password" || /password/i.test(filled) || /pass|pwd/i.test(named) || getComputedStyle(el).webkitTextSecurity !== "none"
    ? "password"
    : /cc-/i.test(filled) || /card|cc.?(num|exp|name)|cvc|cvv|iban/i.test(named)
      ? "card"
      : /one-time-code/i.test(filled) || isSecret(el)
        ? "code"
        : form?.querySelector?.("input[type=password]")
          ? "sign-in"
          : null;
};

// Starts watching this page and the frames this world can reach, until `finish`.
export const startWatching = (): Watching => {
  const queue: Note[] = [];
  let wake: ((notes: Note[] | null) => void) | null = null;
  const push = (note: Note): void => {
    if (queue.length >= MAX_QUEUE) return;
    queue.push(note);
    if (wake) {
      const answer = wake;
      wake = null;
      answer(queue.splice(0));
    }
  };

  // Once a secret, always one: a page's "show password" turns the field into plain text.
  const secrets = new WeakMap<Node, Secret>();
  const secretKind = (el: AnyElement): Secret | null => {
    const known = secrets.get(el);
    if (known) return known;
    const kind = kindOf(el);
    if (kind) secrets.set(el, kind);
    return kind;
  };

  const dirty = new Set<AnyElement>();
  const sent = new WeakMap<Element, string | symbol>();
  const SAW_CARD = Symbol();
  // The only place a text field's value is read, and only after it's been ruled out as a secret.
  const finishField = (el: AnyElement): void => {
    const wasDirty = dirty.delete(el);
    const secret = secretKind(el);
    if (secret) {
      if (wasDirty) push({ type: "secret", secret });
      return;
    }
    const value = (el.isContentEditable ? el.innerText : el.value) ?? "";
    if (!value.trim() || sent.get(el) === value) return;
    // A field that doesn't say it's for a card can only be told by reading it. The number goes no further than this line.
    if (looksLikeCard(value)) {
      if (sent.get(el) !== SAW_CARD) push({ type: "secret", secret: "card" });
      sent.set(el, SAW_CARD);
      return;
    }
    sent.set(el, value);
    push({ type: "typed", label: fieldName(el), value: shortValue(value) });
  };
  // A secret copied here makes the field it's next pasted into one too. Nothing of it is kept but its kind.
  let copiedSecret: Secret | null = null;
  // What's being copied, from the field it's in or from the page, and only after the field is ruled out as a secret.
  const copied = (el: AnyElement | null): void => {
    copiedSecret = null;
    if (el && holdsText(el)) {
      const secret = secretKind(el);
      if (secret) {
        copiedSecret = secret;
        return push({ type: "secret", secret, copied: true });
      }
    }
    const field = el && holdsText(el) && !el.isContentEditable ? el : null;
    let text = "";
    try {
      text = field
        ? (field.value ?? "").slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)
        : String(el?.ownerDocument.getSelection() ?? "");
    } catch {
      // A field with no selection to speak of, such as an email address.
    }
    if (!text.trim()) return;
    if (looksLikeCard(text)) copiedSecret = "card";
    push(copiedSecret ? { type: "secret", secret: copiedSecret, copied: true } : { type: "copied", value: shortValue(text) });
  };
  const finishAll = (): void => [...dirty].forEach(finishField);

  const stopping = new AbortController();
  const on = <K extends keyof WindowEventMap>(where: Window, type: K, listen: (event: WindowEventMap[K]) => void): void =>
    where.addEventListener(type, listen, { capture: true, signal: stopping.signal });
  const trusted =
    <E extends Event>(listen: (event: E) => void) =>
    (event: E): void => {
      if (event.isTrusted) listen(event);
    };

  // A field that stops being a password is still one, even if nobody had touched it yet.
  const rememberPasswords = (root: Document): void => {
    root.querySelectorAll("input[type=password]").forEach((el) => secrets.set(el, "password"));
    const seeing = new MutationObserver((changes) => {
      changes.forEach(({ target, oldValue }) => {
        if (oldValue?.toLowerCase() === "password") secrets.set(target, "password");
      });
    });
    seeing.observe(root, { subtree: true, attributes: true, attributeFilter: ["type"], attributeOldValue: true });
    stopping.signal.addEventListener("abort", () => seeing.disconnect());
  };

  const watch = (where: Window): void => {
    rememberPasswords(where.document);
    on(
      where,
      "focusin",
      trusted((event) => {
        const el = realTarget(event);
        if (el && holdsText(el)) secretKind(el);
      }),
    );
    on(
      where,
      "input",
      trusted((event) => {
        const el = realTarget(event);
        if (el && holdsText(el)) dirty.add(el);
      }),
    );
    on(
      where,
      "focusout",
      trusted((event) => {
        const el = realTarget(event);
        if (el && dirty.has(el)) finishField(el);
      }),
    );
    on(where, "keydown", trusted(onKey));
    on(where, "change", trusted(onChange));
    on(
      where,
      "copy",
      trusted((event) => copied(realTarget(event))),
    );
    on(
      where,
      "paste",
      trusted((event) => {
        const el = realTarget(event);
        if (!el || !holdsText(el)) return;
        // What's pasted is read from the field like anything typed, once the user has finished with it.
        if (copiedSecret && !secretKind(el)) secrets.set(el, copiedSecret);
        const secret = secretKind(el);
        push(secret ? { type: "secret", secret } : { type: "pasted", label: fieldName(el) });
      }),
    );
    on(where, "click", trusted(onClick));
    on(where, "pagehide", trusted(finishAll));
    // A frame this world can reach is watched the same way.
    on(
      where,
      "load",
      trusted((event) => {
        if (isElement(event.target) && isIFrame(event.target)) watchFrame(event.target);
      }),
    );
  };

  const onKey = (event: KeyboardEvent): void => {
    if ((event.key !== "Enter" && event.key !== "Tab") || event.isComposing) return;
    const el = realTarget(event);
    if (!el || !holdsText(el) || el.tagName === "TEXTAREA") return;
    // An editor like a spreadsheet's keeps the keyboard and empties itself on Enter or Tab, so what's in it is read
    // before the page gets the key. Shift and Enter is a new line.
    if (el.isContentEditable) {
      if (!dirty.has(el) || (event.key === "Enter" && event.shiftKey)) return;
      finishField(el);
      // The same words in the next cell are a note of their own.
      sent.delete(el);
      return;
    }
    if (event.key !== "Enter") return;
    finishField(el);
    const secret = secretKind(el);
    push(secret ? { type: "enter", secret } : { type: "enter", label: fieldName(el) });
  };

  const onChange = (event: Event): void => {
    const el = realTarget(event);
    if (!el) return;
    if (holdsText(el)) return finishField(el);
    // A choice can be as private as anything typed, such as a card's expiry month.
    const secret = (el.tagName === "SELECT" || el.type === "radio") && secretKind(el);
    if (secret) push({ type: "secret", secret });
    else if (isSelect(el))
      push({ type: "chose", label: fieldName(el), value: clip([...el.selectedOptions].map((option) => option.text).join(", ")) });
    else if (el.type === "checkbox") push({ type: "ticked", label: nameOf(el), checked: el.checked });
    else if (el.type === "radio") push({ type: "chose", label: fieldName(el.closest("fieldset") ?? el), value: nameOf(el) });
    else if (el.type === "file") push({ type: "file", label: fieldName(el) });
  };

  const onClick = (event: Event): void => {
    const el = realTarget(event);
    if (!el || el.closest("input,textarea,select,[contenteditable=true],[contenteditable='']")) return;
    // Dragging over text or clicking twice on it selects it, and that isn't pressing it.
    const selected = el.ownerDocument.getSelection();
    if (selected && !selected.isCollapsed && selected.toString().trim() && selected.containsNode(el, true)) return;
    const control: AnyElement | null = el.closest(ROLES);
    // A label for a box is reported by the box.
    if (control?.tagName === "LABEL" && control.control) return;
    if (control) {
      push({ type: "click", label: nameOf(control), role: roleOf(control) });
      return;
    }
    const text = (el.innerText ?? "").trim();
    if (el !== document.body && el !== document.documentElement && text && text.length <= MAX_PLAIN_NAME)
      push({ type: "click", label: clip(text), role: "element" });
  };

  // A frame is here when this starts and then says it has loaded, and it's only to be watched once.
  const watching = new WeakSet<Document>();
  const watchFrame = (frame: HTMLIFrameElement): void => {
    try {
      const inside = frame.contentWindow;
      if (!inside) return;
      if (watching.has(inside.document)) return;
      watching.add(inside.document);
      watch(inside);
    } catch {
      // Another origin can't be reached from here. It's only ever noted as being used, below.
    }
  };
  watch(window);
  document.querySelectorAll("iframe").forEach(watchFrame);
  // Focus moving into a frame from another origin is all anyone outside it can see, and that's all that's noted.
  on(
    window,
    "blur",
    trusted(() => {
      const frame = document.activeElement;
      if (!isIFrame(frame)) return;
      try {
        if (frame.contentWindow?.document) return;
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
    }),
  );

  const watcher: Watching = {
    next: () => (queue.length > 0 ? Promise.resolve(queue.splice(0)) : new Promise((answer) => (wake = answer))),
    // Whoever's waiting hears nothing but that it's over, or it would ask again and start all this up again.
    finish: () => {
      const waiting = wake;
      wake = null;
      finishAll();
      stopping.abort();
      Reflect.deleteProperty(globalThis, "__watching");
      waiting?.(null);
      return queue.splice(0);
    },
  };
  globalThis.__watching = watcher;
  return watcher;
};
