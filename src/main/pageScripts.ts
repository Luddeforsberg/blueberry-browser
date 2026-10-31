// Scripts for `Tab.runInPage`, which keeps them in an isolated world. They share the page's DOM, but the
// page can't see or change their variables, so it can't swap what a ref points to.

const MAX_NAME_LENGTH = 80;
const MAX_ADDRESS_LENGTH = 500;
const MAX_OPTIONS = 50;
const MAX_PLAIN = 40;
// Long enough for a click to arrive, and short enough not to catch one of the user's own.
const WATCH_PRESS_MS = 1500;

const SHARED = `
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

const DESCRIBE_FIELDS = `role: roleOf(el), name: nameOf(el), target: el.href || (el.hasAttribute("formaction") ? el.formAction : el.form?.action) || null, riskyClick: riskyClick(el), safeToType: safeToType(el), frameUrl: el.ownerDocument !== document ? el.ownerDocument.URL : null`;

export const describeElement = (ref: string): string => withElement(ref, `return { ${DESCRIBE_FIELDS} };`);

// Where real input should go for this element, in the top page's pixels, or null if it can't go there: it's off
// screen, or inside a frame from another origin, where the top page can't measure it and real input doesn't reach.
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
  // Real input is checked by whether it arrives, because nothing says when it goes astray.
  const expect = (win, type) => {
    state.landed = false;
    win.addEventListener(type, () => { state.landed = true; }, { capture: true, once: true });
  };
  // A page can move between aiming and pressing, or put something new under the pointer once pressed, and the card
  // named this element and nothing else. So whatever arrives on anything else is stopped before the page's own
  // listeners, for the whole click. A drag only guards its press, because it's meant to let go somewhere else.
  const expectPressOn = (el, { pressOnly = false } = {}) => {
    state.stopWatching?.();
    state.landed = false;
    const targets = new Set([window, el.ownerDocument.defaultView]);
    const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"];
    const watch = (event) => {
      if (!event.isTrusted) return;
      const onIt = reaches(event.composedPath()[0], el);
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
export const aimClick = (ref: string, mayScroll: boolean): string =>
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
     expectPressOn(el);
     return { status: "aimed", ...point };`
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

export const scrollPage = (direction: "up" | "down"): string => `(() => {
  window.scrollBy({ top: ${direction === "up" ? -1 : 1} * window.innerHeight * 0.9, behavior: "instant" });
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
})()`;
