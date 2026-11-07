// Scripts for `Tab.runInPage`, which keeps them in an isolated world. They share the page's DOM, but the
// page can't see or change their variables, so it can't swap what a ref points to.

const MAX_NAME_LENGTH = 80;
const MAX_ADDRESS_LENGTH = 500;
const MAX_OPTIONS = 50;
const MAX_PLAIN = 40;
// Long enough for a click to arrive, and short enough not to catch one of the user's own.
const WATCH_PRESS_MS = 1500;
const MAX_SMOOTH_SCROLL_MS = 700;
const SMOOTH_SCROLL_START_MS = 120;

export const SHARED = `
  const state = (globalThis.__berry ??= { next: 1, byRef: new Map(), refs: new WeakMap() });
  const clip = (text) => {
    const clean = (text ?? "").replace(/\\s+/g, " ").trim();
    return clean.length > ${MAX_NAME_LENGTH} ? clean.slice(0, ${MAX_NAME_LENGTH - 1}).trimEnd() + "…" : clean;
  };
  const roleOf = (el) => {
    const role = el.getAttribute("role");
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "input") return el.type === "checkbox" || el.type === "radio" || el.type === "button" || el.type === "submit" ? el.type : "field";
    if (tag === "textarea") return "field";
    if (tag === "select") return "dropdown";
    if (tag === "img") return "image";
    if (el.isContentEditable) return "field";
    return tag === "button" ? "button" : "element";
  };
  // A dropdown inside its label would give every option as part of the name.
  const labelOf = (el) => {
    const label = el.labels?.[0];
    if (!label || el.tagName !== "SELECT") return label?.innerText;
    const copy = label.cloneNode(true);
    copy.querySelectorAll("select").forEach((inner) => inner.remove());
    return copy.textContent;
  };
  const nameOf = (el) => {
    const labelled = el.getAttribute("aria-labelledby");
    const byId = labelled && el.getRootNode().getElementById?.(labelled)?.innerText;
    // A dropdown's own text is every option it has, which says nothing about what it's for.
    return clip(
      el.getAttribute("aria-label") || byId || labelOf(el) || (el.tagName === "SELECT" ? "" : el.innerText) ||
      (el.type === "submit" || el.type === "button" ? el.value : "") || el.placeholder || el.title ||
      el.querySelector?.("img")?.alt || el.name || ""
    );
  };
  const isSecret = (el) =>
    el.type === "password" || /password|one-time-code|cc-/i.test(el.autocomplete ?? "") ||
    /otp|2fa|mfa|one.?time|verification|cvc|cvv|captcha|(?<!post|zip)code/i.test((el.name ?? "") + " " + (el.id ?? ""));
  const optionLabels = (options) => [...options].map((option) => clip(option.text));
  // A page can hide a control and label it anything, so one nobody can see always counts as risky.
  const isTransparent = (el) => getComputedStyle(el).opacity === "0";
  const parentOf = (el) => el.parentElement ?? el.getRootNode().host ?? null;
`;

// Words that mean a click changes or sends something, in English and Swedish. Pages choose their own labels,
// so this only spots ordinary sites doing ordinary things. It's what decides when to ask, and it's meant to
// err towards asking.
const RISKY_WORDS = [
  "delete", "remove", "discard", "erase", "trash", "clear", "reset", "archive", "cancel", "close account", "deactivate",
  "send", "post", "publish", "submit", "share", "reply", "comment", "invite", "merge", "deploy", "transfer", "upload",
  "buy", "pay", "order", "purchase", "checkout", "subscribe", "unsubscribe", "donate", "book", "confirm", "accept",
  "agree", "approve", "save", "update", "edit", "rename", "install", "sign out", "log out", "logout",
  "radera", "ta bort", "töm", "avbryt", "skicka", "publicera", "dela", "svara", "kommentera", "köp", "betala",
  "beställ", "boka", "prenumerera", "bekräfta", "godkänn", "acceptera", "spara", "uppdatera", "ändra", "logga ut",
];

const ASSESS = `
  const riskyWord = new RegExp("(^|[^\\p{L}])(" + ${JSON.stringify(RISKY_WORDS.join("|"))} + ")([^\\p{L}]|$)", "iu");
  const sendsForm = (form) => !!form && (form.method === "post" || !!form.querySelector("input[type=password]"));
  // A plain link only goes somewhere. A button with no label could do anything, so it counts as risky.
  const riskyClick = (el) => {
    const name = nameOf(el);
    if (!name || riskyWord.test(name) || isSecret(el) || isTransparent(el)) return true;
    const role = roleOf(el);
    if (role === "checkbox" || role === "switch") return true;
    const submits = el.form && (el.type === "submit" || el.type === "image");
    return !!submits && (el.formMethod === "post" || sendsForm(el.form));
  };
  const isSearch = (el) =>
    el.type === "search" || el.getAttribute("role") === "searchbox" || !!el.closest?.("[role=search]") ||
    /search|sök/i.test(nameOf(el));
  const safeToType = (el) => !isSecret(el) && !isTransparent(el) && !el.isContentEditable && isSearch(el) && !sendsForm(el.form);
`;

const LIST = `
  const SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[draggable=true],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true]';
  const LOOSE_SELECTOR = '[onclick],[tabindex]:not([tabindex="-1"])';
  // A plain query stops at a shadow root, and at a frame. A closed root can't be entered at all, and a frame from
  // another origin gives no document, so \`browserTools\` runs this in those frames separately. A frame nobody can
  // see is left out, so a page can't use one to get a click its user never sees.
  const allElements = (root, found = []) => {
    for (const el of root.querySelectorAll("*")) {
      found.push(el);
      if (el.shadowRoot) allElements(el.shadowRoot, found);
      if (DESCEND && (el.tagName === "IFRAME" || el.tagName === "FRAME") && el.contentDocument && visible(el) && !isTransparent(el)) {
        allElements(el.contentDocument, found);
      }
    }
    return found;
  };
  // Custom checkboxes often draw over a real input that's fully transparent. Anything else that transparent is hidden.
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && (style.opacity !== "0" || el.tagName === "INPUT");
  };
  // A page's click listeners can't be seen from here, so a pointer cursor is the sign one is there. Children
  // inherit it, so only the outermost element that has it counts.
  const hasPointer = (el) => getComputedStyle(el).cursor === "pointer";
  const looksClickable = (el) => {
    const declared = el.matches(LOOSE_SELECTOR);
    if (!declared && !hasPointer(el)) return false;
    const parent = parentOf(el);
    if (!declared && parent && hasPointer(parent)) return false;
    return !el.parentElement?.closest(SELECTOR) && !el.querySelector(SELECTOR) && nameOf(el) !== "";
  };
  // Not made to be clicked, but something to hover over or double-click: a picture, or a piece of text.
  const isPlain = (el) =>
    el.tagName === "IMG" || (el.tagName !== "BODY" && [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()));
`;

export interface ListOptions {
  query?: string;
  limit: number;
  // Also pictures and text, which are left out otherwise unless the query names them.
  everything?: boolean;
  // False in a frame `browserTools` runs this in by itself, which gets the frames inside it the same way.
  descend: boolean;
}

export const listElements = ({ query, limit, everything = false, descend }: ListOptions): string => `(() => {
  const DESCEND = ${descend};
  ${SHARED}
  ${LIST}
  const query = ${JSON.stringify(query?.toLowerCase() ?? "")};
  const named = (el) => nameOf(el).toLowerCase().includes(query);
  const seen = allElements(document).filter((el) => visible(el));
  const active = seen.filter((el) => (el.matches(SELECTOR) || looksClickable(el)) && named(el));
  const plain = ${everything} || query
    ? seen.filter((el) => !active.includes(el) && !el.closest(SELECTOR) && isPlain(el) && named(el)).slice(0, ${MAX_PLAIN})
    : [];
  const found = [...active, ...plain];
  const elements = found.slice(0, ${limit}).map((el) => {
    let ref = state.refs.get(el);
    if (!ref) {
      ref = "e" + state.next++;
      state.refs.set(el, ref);
      state.byRef.set(ref, el);
    }
    const dropdown = el.tagName === "SELECT";
    return {
      ref,
      role: roleOf(el),
      name: nameOf(el),
      ...("value" in el && !isSecret(el) && !dropdown && el.value ? { value: clip(el.value) } : {}),
      ...(el.tagName === "A" && typeof el.href === "string" && el.href ? { address: el.href.slice(0, ${MAX_ADDRESS_LENGTH}) } : {}),
      ...(dropdown ? { selected: optionLabels(el.selectedOptions), options: optionLabels(el.options).slice(0, ${MAX_OPTIONS}), optionCount: el.options.length } : {}),
      ...(isTransparent(el) ? { transparent: true } : {}),
      ...(el.disabled ? { disabled: true } : {}),
      ...(el.ownerDocument !== document ? { inFrame: true } : {}),
    };
  });
  return { total: found.length, elements };
})()`;

const withElement = (ref: string, body: string): string => `(() => {
  ${SHARED}
  ${ASSESS}
  const el = state.byRef.get(${JSON.stringify(ref)});
  if (!el || !el.isConnected) return null;
  ${body}
})()`;

const DESCRIBE_FIELDS = `role: roleOf(el), name: nameOf(el), target: el.href || (el.hasAttribute("formaction") ? el.formAction : el.form?.action) || null, riskyClick: riskyClick(el), safeToType: safeToType(el), secret: isSecret(el), frameUrl: el.ownerDocument !== document ? el.ownerDocument.URL : null`;

export const describeElement = (ref: string): string => withElement(ref, `return { ${DESCRIBE_FIELDS} };`);

// Where real input should go for this element, in the top page's pixels, or null if it can't go there: it's off
// screen, or inside a frame from another origin, where the top page can't measure it and real input doesn't reach.
// For a click allowed for a card's runs, only the element itself counts, or something inside it with nothing a person
// could click on its own in between: never a link or button inside it, anything around it, or a frame. Exported so the
// rule can be tested on its own.
export const PRESS_RULE = `
  const INTERACTIVE = "a, button, input, select, textarea, [role=button], [role=link], [onclick], [tabindex], iframe, frame";
  const onlyIt = (hit, el) => {
    for (let at = hit; at; at = parentOf(at)) {
      if (at === el) return true;
      if (at.matches?.(INTERACTIVE)) return false;
    }
    return false;
  };
`;

const AIM = `
  const isFrame = (el) => el?.tagName === "IFRAME" || el?.tagName === "FRAME";
  const pointOn = (el) => {
    const box = el.getClientRects()[0];
    if (!box || window.top !== window) return null;
    let x = box.left + box.width / 2;
    let y = box.top + box.height / 2;
    for (let win = el.ownerDocument.defaultView; win !== window; win = win.parent) {
      const owner = win.frameElement;
      if (!owner) return null;
      const outer = owner.getBoundingClientRect();
      x += outer.left + owner.clientLeft;
      y += outer.top + owner.clientTop;
    }
    return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? { x, y } : null;
  };
  // What a person's click there would land on, through shadow roots and same-origin frames.
  const hitAt = ({ x, y }) => {
    let hit = document.elementFromPoint(x, y);
    let left = 0;
    let top = 0;
    for (;;) {
      const inner = hit?.shadowRoot?.elementFromPoint(x - left, y - top);
      if (inner && inner !== hit) {
        hit = inner;
      } else if (isFrame(hit) && hit.contentDocument) {
        const outer = hit.getBoundingClientRect();
        left += outer.left + hit.clientLeft;
        top += outer.top + hit.clientTop;
        hit = hit.contentDocument.elementFromPoint(x - left, y - top);
      } else {
        return hit;
      }
    }
  };
  const isInside = (el, outer) => {
    for (let at = el; at; at = parentOf(at)) if (at === outer) return true;
    return false;
  };
  // A label counts as the field it's for. The page's body doesn't count as anything, because it means the
  // element lets clicks through to nothing in particular.
  const reaches = (hit, el) => {
    if (!hit || hit === hit.ownerDocument.body || hit === hit.ownerDocument.documentElement) return false;
    return isInside(hit, el) || isInside(el, hit) || [...(el.labels ?? [])].some((label) => isInside(hit, label));
  };
  ${PRESS_RULE}
  // Real input is checked by whether it arrives, because nothing says when it goes astray.
  const expect = (win, type) => {
    state.landed = false;
    win.addEventListener(type, () => { state.landed = true; }, { capture: true, once: true });
  };
  // A page can move between aiming and pressing, or put something new under the pointer once pressed, and the card
  // named this element and nothing else. So whatever arrives on anything else is stopped before the page's own
  // listeners, for the whole click. A drag only guards its press, because it's meant to let go somewhere else.
  const expectPressOn = (el, { pressOnly = false, strict = false } = {}) => {
    state.stopWatching?.();
    state.landed = false;
    const targets = new Set([window, el.ownerDocument.defaultView]);
    const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"];
    const watch = (event) => {
      if (!event.isTrusted) return;
      const onIt = strict ? onlyIt(event.composedPath()[0], el) : reaches(event.composedPath()[0], el);
      if (state.landed === false) state.landed = onIt ? true : "missed";
      // The press arrived but the rest of the click is about to be stopped, so it didn't happen.
      else if (state.landed === true && !onIt && !pressOnly) state.landed = "missed";
      if (onIt || (pressOnly && state.landed === true)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const timer = setTimeout(() => state.stopWatching?.(), ${WATCH_PRESS_MS});
    state.stopWatching = () => {
      clearTimeout(timer);
      targets.forEach((win) => types.forEach((type) => win.removeEventListener(type, watch, true)));
      state.stopWatching = null;
    };
    targets.forEach((win) => types.forEach((type) => win.addEventListener(type, watch, true)));
  };
`;

export interface Aim {
  // "scrolled" means it wasn't in the open and now should be, so give the page a moment and aim again.
  status: "aimed" | "disabled" | "scripted" | "covered" | "scrolled";
  x?: number;
  y?: number;
  // What's in the way, when something is.
  by?: string;
}

// Scrolled to it and ready for a real click. A dropdown opens a native menu and a file field the Mac's file
// picker, which nobody here can answer, so those are never really clicked.
// Pages often move when they're scrolled, so it only scrolls if it has to, and never in the same step as aiming.
// `arm: false` is only for finding out where it is, with no watch set on the page.
// `strict` is only for a click allowed for a card's runs: the press then counts only on the element itself (`onlyIt`).
export const aimClick = (ref: string, mayScroll: boolean, arm = true, strict = false): string =>
  withElement(
    ref,
    `${AIM}
     if (el.matches(":disabled")) return { status: "disabled" };
     if (el.tagName === "SELECT" || el.type === "file") return { status: "scripted" };
     const point = pointOn(el);
     const hit = point && hitAt(point);
     if (!point || !reaches(hit, el)) {
       if (${mayScroll}) {
         el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
         return { status: "scrolled" };
       }
       if (!point) return { status: "scripted" };
       return { status: "covered", by: (hit && nameOf(hit)) || hit?.tagName.toLowerCase() || "nothing" };
     }
     ${arm ? `expectPressOn(el${strict ? ", { strict: true }" : ""});` : ""}
     return { status: "aimed", ...point };`
  );

// Whether a press at this point, as a person's would, lands on the element itself, by the same rule as a strict aim. For a
// click allowed for a card's runs, just before it's pressed.
export const pressLandsOn = (ref: string, x: number, y: number): string =>
  withElement(
    ref,
    `${AIM}
     return onlyIt(hitAt({ x: ${Number(x)}, y: ${Number(y)} }), el);`
  );

// False until the input arrives, then true, or "missed" for a press that was stopped. A new page has no record, so
// null means the input took the page somewhere.
export const inputLanded = `(() => {
  ${SHARED}
  if (state.landed === true || state.landed === "missed") state.stopWatching?.();
  return state.landed ?? null;
})()`;

// For a frame from another origin, and when real input can't get there. Pages can tell this from a person.
export const scriptedClick = (ref: string, clicks: 1 | 2): string =>
  withElement(
    ref,
    `if (el.matches(":disabled")) return "disabled";
     el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
     const box = el.getBoundingClientRect();
     const at = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
     for (let count = 1; count <= ${clicks}; count++) {
       const times = { ...at, detail: count };
       el.dispatchEvent(new PointerEvent("pointerdown", times));
       el.dispatchEvent(new MouseEvent("mousedown", times));
       el.focus?.();
       el.dispatchEvent(new PointerEvent("pointerup", times));
       el.dispatchEvent(new MouseEvent("mouseup", times));
       el.click();
     }
     if (${clicks} === 2) el.dispatchEvent(new MouseEvent("dblclick", { ...at, detail: 2 }));
     return "done";`
  );

export const aimHover = (ref: string, mayScroll: boolean): string =>
  withElement(
    ref,
    `${AIM}
     const point = pointOn(el);
     if (point) return { status: "aimed", ...point };
     if (!${mayScroll}) return { status: "scripted" };
     el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
     return { status: "scrolled" };`
  );

// Where an element is, for drawing only. Its name is the label a person reads beside it, never what's in a field.
export const spotOf = (ref: string): string =>
  withElement(
    ref,
    `const box = el.getBoundingClientRect();
     let left = box.left;
     let top = box.top;
     for (let win = el.ownerDocument.defaultView; win !== window; win = win.parent) {
       const owner = win.frameElement;
       if (!owner) return null;
       const outer = owner.getBoundingClientRect();
       left += outer.left + owner.clientLeft;
       top += outer.top + owner.clientTop;
     }
     const secret = isSecret(el);
     // A label can wrap the box, and a box's own text may be what someone wrote, so it's left out of that.
     const labelWithoutBox = () => {
       const copy = el.labels?.[0]?.cloneNode(true);
       copy?.querySelectorAll("textarea,[contenteditable]").forEach((inner) => inner.remove());
       return copy?.textContent ?? "";
     };
     const holdsText = el.isContentEditable || el.tagName === "TEXTAREA";
     const name = secret ? "" : holdsText ? clip(el.getAttribute("aria-label") || labelWithoutBox() || el.placeholder || "") : nameOf(el);
     return { left, top, width: box.width, height: box.height, x: left + box.width / 2, y: top + box.height / 2, viewWidth: innerWidth, viewHeight: innerHeight, name, secret };`
  );

export const isHovered = (ref: string): string => withElement(ref, `return el.matches(":hover");`);

// Enough for a page's own menus. CSS can't be fooled this way, so the tool says when this is all it did.
export const scriptedHover = (ref: string): string =>
  withElement(
    ref,
    `el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
     const box = el.getBoundingClientRect();
     const at = { bubbles: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
     for (const [Type, name] of [[PointerEvent, "pointerover"], [PointerEvent, "pointerenter"], [MouseEvent, "mouseover"], [MouseEvent, "mouseenter"], [MouseEvent, "mousemove"]]) {
       el.dispatchEvent(new Type(name, at));
     }
     return "done";`
  );

export interface DragPlan {
  status: "native" | "aimed" | "out-of-view" | "covered" | "disabled";
  from?: { x: number; y: number };
  to?: { x: number; y: number };
}

// A browser's own drag-and-drop, for anything `draggable`, hands over to the Mac as soon as it starts. Real input
// can't carry it on from there and it would catch the user's real pointer, so that kind is played as events,
// which is also how the page hears of it. Anything else listens to the mouse, so it gets a real one.
export const planDrag = (ref: string, toRef: string): string =>
  withElement(
    ref,
    `${AIM}
     const to = state.byRef.get(${JSON.stringify(toRef)});
     if (!to || !to.isConnected) return null;
     if (el.matches(":disabled")) return { status: "disabled" };
     const source = el.closest?.("[draggable=true]") ?? (el.draggable ? el : null);
     if (source) {
       const data = new DataTransfer();
       const box = (target) => {
         const { left, top, width, height } = target.getBoundingClientRect();
         return { clientX: left + width / 2, clientY: top + height / 2 };
       };
       const fire = (target, name) =>
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
     expectPressOn(el, { pressOnly: true });
     return { status: "aimed", from, to: onto };`
  );

export interface FocusInfo {
  // Null when the focus is on the page itself.
  role: string | null;
  name: string | null;
  // The key can't get there: real keys don't reach a frame from another origin.
  foreignFrame: boolean;
}

// Where a key would go, and set up to notice that it did.
export const aimKey = `(() => {
  ${SHARED}
  ${AIM}
  let at = document.activeElement;
  while (at?.shadowRoot?.activeElement || (isFrame(at) && at.contentDocument?.activeElement)) {
    at = at.shadowRoot?.activeElement ?? at.contentDocument.activeElement;
  }
  if (isFrame(at)) return { role: null, name: null, foreignFrame: true };
  expect(at?.ownerDocument.defaultView ?? window, "keydown");
  const onPage = !at || at === at.ownerDocument.body || at === at.ownerDocument.documentElement;
  return { role: onPage ? null : roleOf(at), name: onPage ? null : nameOf(at), foreignFrame: false };
})()`;

export const typeIntoElement = (ref: string, text: string): string =>
  withElement(
    ref,
    `const text = ${JSON.stringify(text)};
     if (el.tagName === "SELECT") return "dropdown";
     if (["checkbox", "radio", "button", "submit", "reset", "image", "file"].includes(el.type)) return "not-a-field";
     if (el.disabled || el.readOnly) return "disabled";
     const editable = el.isContentEditable || "value" in el;
     if (!editable) return "not-a-field";
     const doc = el.ownerDocument;
     el.scrollIntoView({ block: "center" });
     doc.defaultView.focus();
     el.focus();
     if (el.isContentEditable) {
       doc.getSelection().selectAllChildren(el);
     } else if (el.select) {
       el.select();
     }
     if (!doc.execCommand("insertText", false, text) || (!el.isContentEditable && el.value !== text)) {
       if (el.isContentEditable) el.textContent = text;
       else el.value = text;
       el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
     }
     el.dispatchEvent(new Event("change", { bubbles: true }));
     if (el.isContentEditable ? !el.innerText.includes(text) : el.value !== text) return "not-kept";
     return "done";`
  );

// The same as `typeIntoElement`, a piece at a time, while someone is watching. Ends in `finishTyping`, which falls back
// on `typeIntoElement` if what's there isn't what was meant, so a page gets the same result either way.
export const beginTyping = (ref: string): string =>
  withElement(
    ref,
    `if (el.tagName === "SELECT") return "dropdown";
     if (["checkbox", "radio", "button", "submit", "reset", "image", "file"].includes(el.type)) return "not-a-field";
     if (el.disabled || el.readOnly) return "disabled";
     if (!el.isContentEditable && !("value" in el)) return "not-a-field";
     const doc = el.ownerDocument;
     el.scrollIntoView({ block: "center" });
     doc.defaultView.focus();
     el.focus();
     if (el.isContentEditable) doc.getSelection().selectAllChildren(el);
     else el.select?.();
     return "ready";`
  );

export const typeChunk = (ref: string, chunk: string): string =>
  withElement(
    ref,
    // Never takes the focus back, because it may be the user who moved it.
    `if (el.getRootNode().activeElement !== el) return false;
     return el.ownerDocument.execCommand("insertText", false, ${JSON.stringify(chunk)});`
  );

export const finishTyping = (ref: string, text: string): string =>
  withElement(
    ref,
    `const text = ${JSON.stringify(text)};
     const isThere = () => (el.isContentEditable ? el.innerText.includes(text) : el.value === text);
     if (!isThere()) return "again";
     el.dispatchEvent(new Event("change", { bubbles: true }));
     // A page's own listener can change it, and what comes next mustn't go ahead on something else.
     return isThere() ? "done" : "again";`
  );

// A real key goes wherever the focus is, and a page can move that after typing.
export const hasFocus = (ref: string): string => withElement(ref, `return el.getRootNode().activeElement === el;`);

// Enter for a field that's just been typed into, where real keys can't reach it.
export const scriptedEnter = (ref: string): string =>
  withElement(
    ref,
    `const options = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
     const proceed = el.dispatchEvent(new KeyboardEvent("keydown", options));
     el.dispatchEvent(new KeyboardEvent("keyup", options));
     if (proceed && el.form) el.form.requestSubmit();
     return "done";`
  );

// By its text first, because that's what the user sees and what the card says, then by its value. More than one
// match isn't a match.
const FIND_OPTION = `
  const findOption = (wanted) => {
    const text = clip(wanted);
    const options = [...el.options];
    const tiers = [
      options.filter((option) => clip(option.text) === text),
      options.filter((option) => clip(option.text).toLowerCase() === text.toLowerCase()),
      options.filter((option) => option.value === wanted),
    ];
    const matches = tiers.find((tier) => tier.length > 0) ?? [];
    return matches.length === 1 ? matches[0] : null;
  };
`;

export const describeOption = (ref: string, option: string): string =>
  withElement(
    ref,
    `${FIND_OPTION}
     const found = el.tagName === "SELECT" ? findOption(${JSON.stringify(option)}) : null;
     return { ${DESCRIBE_FIELDS}, option: found && clip(found.text), optionValue: found?.value ?? null };`
  );

export const chooseOption = (ref: string, option: string): string =>
  withElement(
    ref,
    `${FIND_OPTION}
     if (el.tagName !== "SELECT") return { status: "not-a-dropdown" };
     if (el.matches(":disabled")) return { status: "disabled" };
     const found = findOption(${JSON.stringify(option)});
     if (!found) return { status: "no-match", options: optionLabels(el.options).slice(0, ${MAX_OPTIONS}) };
     if (found.matches(":disabled")) return { status: "disabled" };
     el.scrollIntoView({ block: "center" });
     el.focus();
     found.selected = true;
     el.dispatchEvent(new Event("input", { bubbles: true }));
     el.dispatchEvent(new Event("change", { bubbles: true }));
     return { status: "done", chosen: clip(found.text) };`
  );

export const selectedOptions = (ref: string): string =>
  withElement(ref, `return el.tagName === "SELECT" ? optionLabels(el.selectedOptions) : null;`);

// `smooth` is for someone watching, so the page slides rather than jumps. It answers when that's over, or straight away if
// the page didn't move.
export const scrollPage = (direction: "up" | "down", smooth = false): string => `(async () => {
  const before = window.scrollY;
  window.scrollBy({ top: ${direction === "up" ? -1 : 1} * window.innerHeight * 0.9, behavior: ${smooth ? '"smooth"' : '"instant"'} });
  ${
    smooth
      ? `await new Promise((resolve) => {
    addEventListener("scrollend", resolve, { once: true });
    setTimeout(resolve, ${MAX_SMOOTH_SCROLL_MS});
    setTimeout(() => window.scrollY === before && resolve(), ${SMOOTH_SCROLL_START_MS});
  });`
      : ""
  }
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
})()`;

// For typing a code from the phone, which `codeEntry.ts` does. These scripts never hold the code. The elements stay in
// this isolated world, where the page can't change which ones they are.
const CODE_SHARED = `
  const code = (globalThis.__berryCode ??= { fields: [], submitted: false });
  const activeOf = () => {
    let at = document.activeElement;
    while (at?.shadowRoot?.activeElement || at?.contentDocument?.activeElement) {
      at = at.shadowRoot?.activeElement ?? at.contentDocument.activeElement;
    }
    return at;
  };
`;

export const listCodeFields = `(() => {
  const DESCEND = true;
  ${SHARED}
  ${LIST}
  ${CODE_SHARED}
  const inView = (el) => {
    const box = el.getBoundingClientRect();
    return box.right > 0 && box.bottom > 0;
  };
  const inputs = allElements(document).filter((el) => el.tagName === "INPUT" && visible(el) && inView(el));
  code.fields = inputs.filter((el) => ["text", "tel", "number"].includes(el.type) && !el.disabled && !el.readOnly);
  return {
    fields: code.fields.map((el) => ({
      autocomplete: el.autocomplete ?? "",
      words: [el.name, el.id, nameOf(el), el.placeholder].filter(Boolean).join(" "),
      type: el.type,
      maxLength: el.maxLength,
    })),
    hasPasswordField: inputs.some((el) => el.type === "password"),
  };
})()`;

export const focusCodeField = (index: number, keepValue = false): string => `(() => {
  ${CODE_SHARED}
  const el = code.fields[${index}];
  if (!el?.isConnected || el.disabled) return false;
  el.scrollIntoView({ block: "center" });
  el.ownerDocument.defaultView.focus();
  el.focus();
  ${keepValue ? "" : "el.select?.();"}
  return activeOf() === el;
})()`;

// Which field has the focus, or -1.
export const codeFieldFocus = `(() => {
  ${CODE_SHARED}
  return code.fields.indexOf(activeOf());
})()`;

// Whether each field took what was typed in it. Only how much, as this answer needn't hold the code.
export const codeFieldsFilled = (indexes: number[], length: number): string => `(() => {
  ${CODE_SHARED}
  const fields = ${JSON.stringify(indexes)}.map((index) => code.fields[index]);
  const typed = fields.reduce((sum, el) => sum + (el?.value ?? "").replace(/[\\s-]/g, "").length, 0);
  return typed === ${length} || !fields.every((el) => el?.isConnected && !el.disabled);
})()`;

export const watchCodeSubmit = `(() => {
  ${CODE_SHARED}
  code.submitted = false;
  if (!code.watching) {
    code.watching = true;
    document.addEventListener("submit", () => (code.submitted = true), true);
  }
})()`;

// Whether the page has done something about the code: a form went, or the fields are gone or locked while it checks.
export const codeFieldsChanged = (indexes: number[]): string => `(() => {
  ${CODE_SHARED}
  return code.submitted || ${JSON.stringify(indexes)}.some((index) => {
    const el = code.fields[index];
    return !el?.isConnected || el.disabled || el.readOnly || el.getBoundingClientRect().width === 0;
  });
})()`;

export const pressCodeSubmit = (indexes: number[]): string => `(() => {
  ${CODE_SHARED}
  const el = code.fields[${indexes[indexes.length - 1]}];
  const root = el?.form ?? el?.ownerDocument;
  if (!root) return "none";
  const shown = (button) => button.getBoundingClientRect().width > 0 && !button.disabled;
  const inForm = el.form ? [...root.querySelectorAll('button:not([type=button]):not([type=reset]), input[type=submit]')].filter(shown) : [];
  if (inForm.length === 1) {
    inForm[0].click();
    return "clicked";
  }
  if (el.form) {
    el.form.requestSubmit();
    return "submitted";
  }
  const words = /verify|submit|continue|confirm|next|sign in|log in|fortsätt|bekräfta|verifiera|logga in|nästa/i;
  const named = [...root.querySelectorAll('button, input[type=submit], [role=button]')].filter((button) => shown(button) && words.test(button.innerText || button.value || ""));
  if (named.length !== 1) return "none";
  named[0].click();
  return "clicked";
})()`;

// Through the value's own setter, so a page's framework notices too.
export const clearCodeFields = (indexes: number[]): string => `(() => {
  ${CODE_SHARED}
  for (const index of ${JSON.stringify(indexes)}) {
    const el = code.fields[index];
    if (!el?.isConnected || !el.value) continue;
    Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, "value").set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
})()`;
