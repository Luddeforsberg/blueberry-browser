import type { AnyElement } from "./dom";
import { isSecret, isTransparent, nameOf, roleOf } from "./names";

// Words that mean a click changes or sends something, in English and Swedish. Pages choose their own labels,
// so this only spots ordinary sites doing ordinary things. It's what decides when to ask, and it's meant to
// err towards asking.
const RISKY_WORDS = [
  "delete",
  "remove",
  "discard",
  "erase",
  "trash",
  "clear",
  "reset",
  "archive",
  "cancel",
  "close account",
  "deactivate",
  "send",
  "post",
  "publish",
  "submit",
  "share",
  "reply",
  "comment",
  "invite",
  "merge",
  "deploy",
  "transfer",
  "upload",
  "buy",
  "pay",
  "order",
  "purchase",
  "checkout",
  "subscribe",
  "unsubscribe",
  "donate",
  "book",
  "confirm",
  "accept",
  "agree",
  "approve",
  "save",
  "update",
  "edit",
  "rename",
  "install",
  "sign out",
  "log out",
  "logout",
  "radera",
  "ta bort",
  "töm",
  "avbryt",
  "skicka",
  "publicera",
  "dela",
  "svara",
  "kommentera",
  "köp",
  "betala",
  "beställ",
  "boka",
  "prenumerera",
  "bekräfta",
  "godkänn",
  "acceptera",
  "spara",
  "uppdatera",
  "ändra",
  "logga ut",
];

// Exactly as it ran from a template string, where `\p` lost its backslash, so a word counts after or before anything
// but p, l, { or }, not only after or before a letter. Making it letters means fewer clicks ask, so it waits for that call.
const riskyWord = new RegExp("(^|[^p{L}])(" + RISKY_WORDS.join("|") + ")([^p{L}]|$)", "iu");

// The reasons from src/shared/asking.ts that a page's element can give.
export type ElementRisk = {
  reason: "unnamed" | "risky-word" | "secret-field" | "hidden" | "toggle" | "sends-form" | "not-search";
  mark?: string;
} | null;

const sendsForm = (form: HTMLFormElement | null | undefined): boolean =>
  !!form && (form.method === "post" || !!form.querySelector("input[type=password]"));

// Why a click asks, or null if it needn't. A plain link only goes somewhere. A button with no label could do anything,
// so it counts as risky.
const clickRisk = (el: AnyElement): ElementRisk => {
  const name = nameOf(el);
  if (!name) return { reason: "unnamed" };
  // The word is the second group, which takes part in every match.
  const mark = name.match(riskyWord)?.[2];
  if (mark !== undefined) return { reason: "risky-word", mark };
  if (isSecret(el)) return { reason: "secret-field" };
  if (isTransparent(el)) return { reason: "hidden" };
  const role = roleOf(el);
  if (role === "checkbox" || role === "switch") return { reason: "toggle" };
  const submits = el.form && (el.type === "submit" || el.type === "image");
  return submits && (el.formMethod === "post" || sendsForm(el.form)) ? { reason: "sends-form" } : null;
};

const isSearch = (el: AnyElement): boolean =>
  el.type === "search" || el.getAttribute("role") === "searchbox" || !!el.closest?.("[role=search]") || /search|sök/i.test(nameOf(el));

// The same for typing in it. Only a search box is safe.
const typeRisk = (el: AnyElement): ElementRisk => {
  if (isSecret(el)) return { reason: "secret-field" };
  if (isTransparent(el)) return { reason: "hidden" };
  if (sendsForm(el.form)) return { reason: "sends-form" };
  return el.isContentEditable || !isSearch(el) ? { reason: "not-search" } : null;
};

export interface Described {
  role: string;
  name: string;
  target: string | null;
  clickRisk: ElementRisk;
  typeRisk: ElementRisk;
  frameUrl: string | null;
}

export const describe = (el: AnyElement): Described => ({
  role: roleOf(el),
  name: nameOf(el),
  target: el.href || (el.hasAttribute("formaction") ? el.formAction : el.form?.action) || null,
  clickRisk: clickRisk(el),
  typeRisk: typeRisk(el),
  frameUrl: el.ownerDocument !== document ? el.ownerDocument.URL : null,
});
