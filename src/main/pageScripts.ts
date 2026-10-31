// Scripts for `Tab.runInPage`, which keeps them in an isolated world. They share the page's DOM, but the
// page can't see or change their variables, so it can't swap what a ref points to.

const MAX_NAME_LENGTH = 80;

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
  const nameOf = (el) => {
    const labelled = el.getAttribute("aria-labelledby");
    const byId = labelled && document.getElementById(labelled)?.innerText;
    return clip(
      el.getAttribute("aria-label") || byId || el.labels?.[0]?.innerText || el.innerText ||
      (el.type === "submit" || el.type === "button" ? el.value : "") || el.placeholder || el.title ||
      el.querySelector?.("img")?.alt || el.name || ""
    );
  };
`;

const LIST = `
  const SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true]';
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  };
`;

export const listElements = (query: string | undefined, limit: number): string => `(() => {
  ${SHARED}
  ${LIST}
  const query = ${JSON.stringify(query?.toLowerCase() ?? "")};
  const found = [...document.querySelectorAll(SELECTOR)]
    .filter((el) => visible(el) && nameOf(el).toLowerCase().includes(query));
  const elements = found.slice(0, ${limit}).map((el) => {
    let ref = state.refs.get(el);
    if (!ref) {
      ref = "e" + state.next++;
      state.refs.set(el, ref);
      state.byRef.set(ref, el);
    }
    const secret = el.type === "password";
    return { ref, role: roleOf(el), name: nameOf(el), ...("value" in el && !secret && el.value ? { value: clip(el.value) } : {}), ...(el.disabled ? { disabled: true } : {}) };
  });
  return { total: found.length, elements };
})()`;

const withElement = (ref: string, body: string): string => `(() => {
  ${SHARED}
  const el = state.byRef.get(${JSON.stringify(ref)});
  if (!el || !el.isConnected) return null;
  ${body}
})()`;

export const describeElement = (ref: string): string =>
  withElement(ref, `return { role: roleOf(el), name: nameOf(el), target: el.href || (el.hasAttribute("formaction") ? el.formAction : el.form?.action) || null };`);

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
     if (${submit}) {
       const options = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
       const proceed = el.dispatchEvent(new KeyboardEvent("keydown", options));
       el.dispatchEvent(new KeyboardEvent("keyup", options));
       if (proceed && el.form) el.form.requestSubmit();
     }
     return "done";`
  );

export const scrollPage = (direction: "up" | "down"): string => `(() => {
  window.scrollBy({ top: ${direction === "up" ? -1 : 1} * window.innerHeight * 0.9, behavior: "instant" });
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
})()`;
