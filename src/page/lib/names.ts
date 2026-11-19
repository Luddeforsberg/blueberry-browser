import { byIdNear, copyOf, hostOf, type AnyElement } from "./dom";

// What every script reads an element by: its role, its name, and whether it's a secret.

const MAX_NAME_LENGTH = 80;

export const clip = (text: string | null | undefined): string => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > MAX_NAME_LENGTH ? clean.slice(0, MAX_NAME_LENGTH - 1).trimEnd() + "…" : clean;
};

export const roleOf = (el: AnyElement): string => {
  const role = el.getAttribute("role");
  if (role) return role;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "input")
    return el.type === "checkbox" || el.type === "radio" || el.type === "button" || el.type === "submit" ? el.type : "field";
  if (tag === "textarea") return "field";
  if (tag === "select") return "dropdown";
  if (tag === "img") return "image";
  if (el.isContentEditable) return "field";
  return tag === "button" ? "button" : "element";
};

// A dropdown inside its label would give every option as part of the name.
export const labelOf = (el: AnyElement): string | null | undefined => {
  const label = el.labels?.[0];
  if (!label || el.tagName !== "SELECT") return label?.innerText;
  const copy = copyOf(label);
  copy.querySelectorAll("select").forEach((inner) => inner.remove());
  return copy.textContent;
};

export const nameOf = (el: AnyElement): string => {
  const labelled = el.getAttribute("aria-labelledby");
  const byId = labelled && byIdNear(el, labelled)?.innerText;
  // A dropdown's own text is every option it has, which says nothing about what it's for.
  return clip(
    el.getAttribute("aria-label") ||
      byId ||
      labelOf(el) ||
      (el.tagName === "SELECT" ? "" : el.innerText) ||
      (el.type === "submit" || el.type === "button" ? el.value : "") ||
      el.placeholder ||
      el.title ||
      el.querySelector?.("img")?.alt ||
      el.name ||
      "",
  );
};

export const isSecret = (el: AnyElement): boolean =>
  el.type === "password" ||
  /password|one-time-code|cc-/i.test(el.autocomplete ?? "") ||
  /otp|2fa|mfa|one.?time|verification|cvc|cvv|captcha|(?<!post|zip)code/i.test((el.name ?? "") + " " + (el.id ?? ""));

export const optionLabels = (options: Iterable<HTMLOptionElement>): string[] => [...options].map((option) => clip(option.text));

// A page can hide a control and label it anything, so one nobody can see always counts as risky.
export const isTransparent = (el: Element): boolean => getComputedStyle(el).opacity === "0";

export const parentOf = (el: Element): Element | null => el.parentElement ?? hostOf(el) ?? null;
