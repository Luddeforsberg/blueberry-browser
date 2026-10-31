// Scripts for `Tab.runInPage`, which keeps them in an isolated world. They share the page's DOM, but the
// page can't see or change their variables, so it can't swap what a ref points to.

const MAX_NAME_LENGTH = 80;
const MAX_ADDRESS_LENGTH = 500;
const MAX_OPTIONS = 50;

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
  const isSecret = (el) => el.type === "password" || /password/i.test(el.autocomplete ?? "");
  const optionLabels = (options) => [...options].map((option) => clip(option.text));
  // A page can hide a control and label it anything, so one nobody can see always counts as risky.
  const isTransparent = (el) => getComputedStyle(el).opacity === "0";
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
  const SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true]';
  const LOOSE_SELECTOR = '[onclick],[tabindex]:not([tabindex="-1"])';
  // A plain query stops at a shadow root. A closed one can't be entered at all.
  const allElements = (root, found = []) => {
    for (const el of root.querySelectorAll("*")) {
      found.push(el);
      if (el.shadowRoot) allElements(el.shadowRoot, found);
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
  const parentOf = (el) => el.parentElement ?? el.getRootNode().host ?? null;
  const looksClickable = (el) => {
    const declared = el.matches(LOOSE_SELECTOR);
    if (!declared && !hasPointer(el)) return false;
    const parent = parentOf(el);
    if (!declared && parent && hasPointer(parent)) return false;
    return !el.parentElement?.closest(SELECTOR) && !el.querySelector(SELECTOR) && nameOf(el) !== "";
  };
`;

export const listElements = (query: string | undefined, limit: number): string => `(() => {
  ${SHARED}
  ${LIST}
  const query = ${JSON.stringify(query?.toLowerCase() ?? "")};
  const found = allElements(document)
    .filter((el) => visible(el) && (el.matches(SELECTOR) || looksClickable(el)) && nameOf(el).toLowerCase().includes(query));
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

const DESCRIBE_FIELDS = `role: roleOf(el), name: nameOf(el), target: el.href || (el.hasAttribute("formaction") ? el.formAction : el.form?.action) || null, riskyClick: riskyClick(el), safeToType: safeToType(el)`;

export const describeElement = (ref: string): string => withElement(ref, `return { ${DESCRIBE_FIELDS} };`);

export const clickElement = (ref: string): string =>
  withElement(
    ref,
    `if (el.disabled) return "disabled";
     el.scrollIntoView({ block: "center" });
     el.click();
     return "done";`
  );

export const typeIntoElement = (ref: string, text: string, submit: boolean): string =>
  withElement(
    ref,
    `const text = ${JSON.stringify(text)};
     if (el.tagName === "SELECT") return "dropdown";
     if (["checkbox", "radio", "button", "submit", "reset", "image", "file"].includes(el.type)) return "not-a-field";
     if (el.disabled || el.readOnly) return "disabled";
     const editable = el.isContentEditable || "value" in el;
     if (!editable) return "not-a-field";
     el.scrollIntoView({ block: "center" });
     el.focus();
     if (el.isContentEditable) {
       document.getSelection().selectAllChildren(el);
     } else if (el.select) {
       el.select();
     }
     if (!document.execCommand("insertText", false, text) || (!el.isContentEditable && el.value !== text)) {
       if (el.isContentEditable) el.textContent = text;
       else el.value = text;
       el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
     }
     el.dispatchEvent(new Event("change", { bubbles: true }));
     if (!el.isContentEditable && el.value !== text) return "not-kept";
     if (${submit}) {
       const options = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
       const proceed = el.dispatchEvent(new KeyboardEvent("keydown", options));
       el.dispatchEvent(new KeyboardEvent("keyup", options));
       if (proceed && el.form) el.form.requestSubmit();
     }
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
