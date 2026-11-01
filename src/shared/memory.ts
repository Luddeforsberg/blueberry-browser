import { SECRET_SHAPES } from "./publishing";
import { siteAllowed } from "./mascots";

// What a bird may remember, checked in plain code wherever a fact comes from: the model, the user's own edit or the file.
// Runtime code shared by main and the chrome renderer, so preloads may only `import type` from here.

export const MAX_FACT_LENGTH = 140;
export const MAX_FACTS_PER_MASCOT = 30;

const word = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, "iu");

const SECRET_WORDS = word(
  "codes?|kod|koden|koder|pass ?words?|passwd|pwd|pass ?phrases?|pass ?codes?|lösenord|lösen|pin|pin ?(?:code|kod)|one[- ]time|otp|2fa|two[- ]factor|mfa|" +
    "(?:verification|security|login|sign[- ]in|access|auth) ?codes?|verifieringskod|engångskod|säkerhetskod|bank ?id|" +
    "cvv|cvc|(?:credit|debit|bank) ?cards?|card ?(?:number|details)|kortnummer|kortuppgifter|personnummer|social security|ssn|iban|" +
    "log[- ]?ins?|sign[- ]?ins?|logga in|api ?keys?|access tokens?|tokens?|secrets?|username|användarnamn"
);
const ADDRESS_WORDS = word("addresse?s?|adress|adressen|hemadress|leveransadress|faktureringsadress|post ?codes?|postal codes?|zip ?codes?|postnummer|phone number|telefonnummer|mobilnummer");
const STREET = /[\p{L}-]+(?:gatan|vägen|gränd|gränden|torget|stigen|allén|backen)\s+\d|\b[\p{L}-]+\s+(?:street|avenue|road|boulevard|lane|drive)\s+\d|\b\d+\p{L}?\s+[\p{L}-]+(?:\s[\p{L}-]+)?\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/iu;
// A price or a share is a fair thing to prefer. Any other run of four digits may be a code, a PIN or part of a phone number.
const AMOUNT = /\d[\d\s.,]*\s*(?:kr|kronor|sek|eur|euros?|usd|dollars?|gbp|pounds?|:-|%)(?![\p{L}])|[$€£]\s*\d[\d\s.,]*/giu;
const LONG_NUMBER = /\d(?:[\s-]?\d){3,}/;
const CODE_SHAPED = /(?<![\p{L}\p{N}])(?=(?:[^\d\s]*\d){2})(?=[^\s]*\p{L})[\p{L}\p{N}-]{5,}(?![\p{L}\p{N}])/u;

// A preference is how someone likes things. Nothing here may be about what a bird is allowed to do, because that's
// decided by limits and approvals, which don't read this, and a sentence like these is what a fooled model would write.
const NOT_A_PREFERENCE = [
  /<|>/,
  /\b(?:without|no need|don'?t need|never|skip|don'?t|do not|stop)\W+(?:\w+\W+){0,3}(?:ask|asking|approval|approve|confirm|confirmation|permission|check with|checking)/i,
  /\b(?:ignore|disregard|override|bypass|forget)\b.{0,40}\b(?:rules?|instructions?|prompts?|limits?|safety|polic(?:y|ies)|previous|above)\b/i,
  /\b(?:system prompt|instructions?|you (?:may|can|are allowed)|allowed to|permission to|pre-?approved|always (?:allow|approve|accept)|auto(?:matically)? (?:approve|allow|buy|pay|confirm|submit|send|order)|go ahead)\b/i,
  /\b(?:send|sent|sending|forward|transfer|upload|post|email|mail)\b.{0,30}\b(?:to|till)\b/i,
];

const HOST = /(?<![\p{L}\p{N}@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\p{L}\p{N}-])/giu;
const NAMES_AN_ADDRESS = /https?:|www\.|[?&]\w+=/i;

// Words for the form, which also says why a proposal is dropped. Null means it can be kept.
export const factProblem = (text: string, site: string | null): string | null => {
  if (!text) return "Say what it should remember.";
  if (text.length > MAX_FACT_LENGTH) return `Keep it under ${MAX_FACT_LENGTH} characters.`;
  const digits = text.replace(AMOUNT, " ");
  if (
    SECRET_SHAPES.some(({ shape }) => shape.test(text)) ||
    SECRET_WORDS.test(text) ||
    ADDRESS_WORDS.test(text) ||
    STREET.test(text) ||
    LONG_NUMBER.test(digits) ||
    CODE_SHAPED.test(digits)
  ) {
    return "That looks like a password, a code, card details or an address, and those are never kept.";
  }
  if (NOT_A_PREFERENCE.some((shape) => shape.test(text))) {
    return "This is for how you like things done. What it may do is set by its limits and the approvals, and this can’t change those.";
  }
  const otherHost = [...text.matchAll(HOST)].some(([host]) => !site || !siteAllowed(`https://${host}`, [site]));
  if (otherHost || NAMES_AN_ADDRESS.test(text)) return "Leave out web addresses. Its site is kept beside it.";
  return null;
};
