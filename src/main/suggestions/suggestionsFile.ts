import type { SuggestionWords } from "../../shared/library";
import { parseMascotDraft } from "../../shared/mascots";
import { entriesOf, fieldsOf } from "../../shared/fields";
import { readJsonFile, savedEntries } from "../library/savedFile";
import { parseDraft } from "../routines/routineSchedule";
import type { Feedback } from "./suggestionDigest";
import type { Proposal } from "./suggestionProposals";

// What `suggestions.json` holds, read back one entry at a time: an entry that doesn't check out is left out, and the
// rest are kept, since every new tab reads them.

export interface SavedSuggestions {
  // What the model proposed last, as checked by code.
  proposals: Proposal[];
  // Ruled out for the old rules, as `site:host` or `chat:id`.
  dismissed: string[];
  // Cards they dismissed or used, which the model reads as "not this again" and "more like this".
  feedback: Feedback[];
  // When the model last answered, and the newest visit, chat or run it had then.
  askedAt: number;
  seen: number;
}

export const NOTHING_SAVED: SavedSuggestions = { proposals: [], dismissed: [], feedback: [], askedAt: 0, seen: 0 };

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const texts = (value: unknown): string[] | null => {
  const { entries, dropped } = entriesOf(value, text);
  return Array.isArray(value) && dropped === 0 ? entries : null;
};

const savedFeedback = (entry: unknown): Feedback | null => {
  const { verdict, kind, line, body, sites, at } = fieldsOf(entry);
  const siteList = texts(sites);
  if ((verdict !== "dismissed" && verdict !== "used") || typeof kind !== "string" || typeof line !== "string") return null;
  if (typeof body !== "string" || !siteList || typeof at !== "number") return null;
  return { verdict, kind, line, body, sites: siteList, at };
};

// A draft is read again, since one saved by an older version can have a mascot's look under a palette's old id.
const savedCard = (value: unknown): SuggestionWords | null => {
  const { id, title, kind, prompt, draft } = fieldsOf(value);
  if (typeof id !== "string" || typeof title !== "string") return null;
  if (kind === "prompt") return typeof prompt === "string" ? { id, title, kind, prompt } : null;
  if (kind === "routine") {
    const parsed = parseDraft(draft);
    return "error" in parsed ? null : { id, title, kind, draft: { ...parsed.draft, mascotId: null } };
  }
  if (kind === "mascot") {
    const parsed = parseMascotDraft(draft);
    return "error" in parsed ? null : { id, title, kind, draft: parsed.draft };
  }
  return null;
};

const savedProposal = (entry: unknown): Proposal | null => {
  const { card, why, sources, sites } = fieldsOf(entry);
  const words = savedCard(card);
  const sourceList = texts(sources);
  const siteList = texts(sites);
  return words && typeof why === "string" && sourceList && siteList ? { card: words, why, sources: sourceList, sites: siteList } : null;
};

export const readSuggestions = (file: string): SavedSuggestions => {
  const raw = readJsonFile(file);
  if (raw === undefined) return NOTHING_SAVED;
  const { proposals, dismissed, feedback, askedAt, seen } = fieldsOf(raw);
  return {
    proposals: savedEntries(file, proposals, savedProposal),
    dismissed: savedEntries(file, dismissed, text),
    feedback: savedEntries(file, feedback, savedFeedback),
    askedAt: typeof askedAt === "number" ? askedAt : 0,
    seen: typeof seen === "number" ? seen : 0,
  };
};
