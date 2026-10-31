// The decisions behind a reply from the phone, as plain functions, whichever channel it came through.

const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 12;

// The code to type, without its space or dash, or null if this can't be one. A word such as "thanks" isn't: a code
// has a digit in it or is all capitals. Length and shape are all that's checked, so a short password can still pass,
// which is why Settings says passwords are never sent this way.
export const plausibleCode = (text: string): string | null => {
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)?$/.test(trimmed)) return null;
  const code = trimmed.replace(/[ -]/g, "");
  if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) return null;
  return /\d/.test(code) || code === code.toUpperCase() ? code : null;
};

// Every way a code could show up again in what a page says, for taking it back out.
export const codeSpellings = (text: string): string[] => {
  const code = plausibleCode(text);
  return code === null ? [] : [...new Set([text.trim(), code])];
};

export type RequestKind = "approval" | "question" | "code" | "computer";

export interface OpenRequest {
  // What the channel calls the message it sent.
  handle: string;
  kind: RequestKind;
}

export type ReplyTarget<T> =
  | { to: T }
  // Said to the wrong thing, or to nothing, and accepted by nothing.
  | { refused: "closed" | "not-by-reply" | "nothing-waiting" | "which-one" | "looks-like-a-code" };

const takesReply = ({ kind }: OpenRequest) => kind === "question" || kind === "code";

// Which open request a message is for. A code must never reach the model by landing on the wrong request. So with more
// than one that takes a reply, only replying to that request's message counts, and a question never takes what looks
// like a code, even as a reply to it, which is one slip of the thumb away. Such an answer can be typed at the computer.
export const bindReply = <T extends OpenRequest>(text: string, replyTo: string | null, open: readonly T[]): ReplyTarget<T> => {
  const takers = open.filter(takesReply);
  const named = replyTo === null ? null : open.find(({ handle }) => handle === replyTo);
  if (named === undefined) return { refused: "closed" };
  if (named && !takesReply(named)) return { refused: "not-by-reply" };
  if (named === null && takers.length === 0) return { refused: open.length > 0 ? "not-by-reply" : "nothing-waiting" };
  if (named === null && takers.length > 1) return { refused: "which-one" };
  const target = named ?? takers[0];
  return target.kind === "question" && plausibleCode(text) !== null ? { refused: "looks-like-a-code" } : { to: target };
};

// What the page says about each visible field that could be typed in.
export interface CodeField {
  autocomplete: string;
  // Its name, id, label and placeholder together.
  words: string;
  type: string;
  // -1 when it has none.
  maxLength: number;
}

export type CodeTarget = { kind: "one"; index: number } | { kind: "boxes"; indexes: number[] } | null;

const NAMED_FOR_A_CODE = /one.?time|\botp\b|2fa|mfa|two.?factor|verif|security.?code|auth\w*.?code|\bcode\b|\bpin\b|\btoken\b|\bkod(en)?\b|engångskod/i;
const OTHER_THINGS = /promo|coupon|discount|gift|voucher|zip|postal|post.?code|country|area.?code|search|sök|\bquery\b|\bq\b|e-?mail|user|login|phone|address|name/i;
const OTHER_AUTOCOMPLETE = /username|email|name|tel|address|postal|country|cc-/i;

// Exactly one place the code goes, or null, and then nothing is typed. In order: the field marked for one-time codes,
// a field named for one, a row of one-character boxes as long as the code, or the only field a page with no password
// on it has.
export const chooseCodeField = (fields: readonly CodeField[], code: string, hasPasswordField: boolean): CodeTarget => {
  const canHold = ({ type, maxLength }: CodeField) => (maxLength < 0 || maxLength >= code.length) && (type !== "number" || /^\d+$/.test(code));
  const box = ({ maxLength }: CodeField) => maxLength === 1;
  const indexed = fields.map((field, index) => ({ field, index }));
  const boxesIn = (tier: typeof indexed): CodeTarget =>
    tier.length === code.length && tier.every(({ field }) => box(field)) ? { kind: "boxes", indexes: tier.map(({ index }) => index) } : null;
  const oneOf = (tier: typeof indexed): CodeTarget => (tier.length === 1 && canHold(tier[0].field) ? { kind: "one", index: tier[0].index } : null);

  const otherThing = ({ field }: (typeof indexed)[number]) => OTHER_THINGS.test(field.words) || OTHER_AUTOCOMPLETE.test(field.autocomplete);
  const marked = indexed.filter(({ field }) => field.autocomplete.split(/\s+/).includes("one-time-code"));
  const named = indexed.filter((entry) => NAMED_FOR_A_CODE.test(entry.field.words) && !otherThing(entry));
  for (const tier of [marked, named]) {
    if (tier.length === 0) continue;
    const found = oneOf(tier) ?? boxesIn(tier);
    if (found) return found;
    // Some pages only mark or name the first box, so a box still goes on to look at the row. Anything else is unclear.
    if (!tier.every(({ field }) => box(field))) return null;
  }
  const boxes = indexed.filter(({ field }) => box(field));
  if (boxes.length > 1) return boxesIn(boxes);
  if (hasPasswordField) return null;
  return indexed.some(otherThing) ? null : oneOf(indexed);
};
