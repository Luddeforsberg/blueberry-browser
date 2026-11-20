import { deepActive, isInput, type PageElement } from "../lib/dom";
import { allElements, visible } from "../lib/list";
import { nameOf } from "../lib/names";

// For typing a code from the phone, which `codeEntry.ts` does. These scripts never hold the code. The elements stay in
// this isolated world, where the page can't change which ones they are.

interface CodeState {
  fields: HTMLInputElement[];
  submitted: boolean;
  watching?: boolean;
}

declare global {
  var __berryCode: CodeState | undefined;
}

const code = (globalThis.__berryCode ??= { fields: [], submitted: false });

interface CodeField {
  autocomplete: string;
  words: string;
  type: string;
  maxLength: number;
}

export const listCodeFields = (): { fields: CodeField[]; hasPasswordField: boolean } => {
  const inView = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    return box.right > 0 && box.bottom > 0;
  };
  const inputs = allElements(document, true)
    .filter(isInput)
    .filter((el) => visible(el) && inView(el));
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
};

export const focusCodeField = ({ index, keepValue }: { index: number; keepValue: boolean }): boolean => {
  const el = code.fields[index];
  if (!el?.isConnected || el.disabled) return false;
  el.scrollIntoView({ block: "center" });
  el.ownerDocument.defaultView?.focus();
  el.focus();
  if (!keepValue) el.select?.();
  return deepActive() === el;
};

// Which field has the focus, or -1.
export const codeFieldFocus = (): number => {
  const at = deepActive();
  return code.fields.findIndex((el) => el === at);
};

// Whether each field took what was typed in it. Only how much, as this answer needn't hold the code.
export const codeFieldsFilled = ({ indexes, length }: { indexes: number[]; length: number }): boolean => {
  const fields = indexes.map((index): HTMLInputElement | undefined => code.fields[index]);
  const typed = fields.reduce((sum, el) => sum + (el?.value ?? "").replace(/[\s-]/g, "").length, 0);
  return typed === length || !fields.every((el) => el?.isConnected && !el.disabled);
};

export const watchCodeSubmit = (): void => {
  code.submitted = false;
  if (!code.watching) {
    code.watching = true;
    document.addEventListener("submit", () => (code.submitted = true), true);
  }
};

// Whether the page has done something about the code: a form went, or the fields are gone or locked while it checks.
export const codeFieldsChanged = ({ indexes }: { indexes: number[] }): boolean =>
  code.submitted ||
  indexes.some((index) => {
    const el: HTMLInputElement | undefined = code.fields[index];
    return !el?.isConnected || el.disabled || el.readOnly || el.getBoundingClientRect().width === 0;
  });

const SUBMIT_WORDS = /verify|submit|continue|confirm|next|sign in|log in|fortsätt|bekräfta|verifiera|logga in|nästa/i;

export const pressCodeSubmit = ({ indexes }: { indexes: number[] }): "none" | "clicked" | "submitted" => {
  const last = indexes.at(-1);
  const el = last === undefined ? undefined : code.fields[last];
  const root = el?.form ?? el?.ownerDocument;
  if (!el || !root) return "none";
  const shown = (button: PageElement): boolean => button.getBoundingClientRect().width > 0 && !button.disabled;
  const inForm = el.form
    ? [...root.querySelectorAll<PageElement>("button:not([type=button]):not([type=reset]), input[type=submit]")].filter(shown)
    : [];
  const [onlyInForm] = inForm;
  if (onlyInForm && inForm.length === 1) {
    onlyInForm.click();
    return "clicked";
  }
  if (el.form) {
    el.form.requestSubmit();
    return "submitted";
  }
  const named = [...root.querySelectorAll<PageElement>("button, input[type=submit], [role=button]")].filter(
    (button) => shown(button) && SUBMIT_WORDS.test(button.innerText || button.value || ""),
  );
  const [onlyNamed] = named;
  if (!onlyNamed || named.length !== 1) return "none";
  onlyNamed.click();
  return "clicked";
};

// Through the value's own setter, so a page's framework notices too.
export const clearCodeFields = ({ indexes }: { indexes: number[] }): void => {
  for (const index of indexes) {
    const el: HTMLInputElement | undefined = code.fields[index];
    if (!el?.isConnected || !el.value) continue;
    const view = el.ownerDocument.defaultView;
    if (view) Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
