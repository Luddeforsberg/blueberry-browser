import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { MascotProfile, Routine, RoutineRun, Suggestion, SuggestionKind } from "../shared/library";
import { buildDigest, type Digest, type DigestChat, type Feedback } from "./suggestionDigest";
import { findPatterns, topPatterns, type Pattern, type PatternChat, type PatternVisit } from "./suggestionPatterns";
import { SUGGESTION_PROMPT, alreadyThere, fallbackWords, feedbackOf, verifyProposals, type Existing, type Proposal } from "./suggestionProposals";

const HOUR_MS = 3_600_000;
// A failed call doesn't count, but being offline mustn't mean a model call on every new tab.
const RETRY_MS = 300_000;
const SHOWN = 3;
const KIND_ORDER: SuggestionKind[] = ["prompt", "routine", "mascot"];
const MAX_FEEDBACK = 40;

interface SavedSuggestions {
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

export type SuggestionChat = PatternChat & { outcome: DigestChat["outcome"] };

export interface SuggestionSources {
  enabled: () => boolean;
  visits: () => PatternVisit[];
  chats: () => SuggestionChat[];
  routines: () => Routine[];
  // A routine's runs, newest first.
  runs: (routineId: string) => RoutineRun[];
  mascots: () => MascotProfile[];
  hasModel: () => boolean;
  // Sends the prompt and the data, and returns what the model wrote.
  write: (system: string, data: string) => Promise<string>;
  onChanged: () => void;
  now?: () => number;
}

// One of each kind if there is one, in the same order every time.
const pickShown = (cards: Suggestion[]): Suggestion[] => {
  const first = KIND_ORDER.flatMap((kind) => cards.find((card) => card.kind === kind) ?? []);
  const rest = cards.filter((card) => !first.includes(card));
  const shown = [...first, ...rest].slice(0, SHOWN);
  return [...shown].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
};

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

// What the new tab page offers. The model reads a digest of what the user did and proposes jobs, each citing the
// digest's ids, and code checks every one. Without a model, or with nothing that checks out, the old rules find what's
// repeated and code words it. A new tab never waits for a model or pays for one: what was checked is saved and reused.
export class Suggestions {
  private saved: SavedSuggestions = { proposals: [], dismissed: [], feedback: [], askedAt: 0, seen: 0 };
  private asking = false;
  // Only in memory, so a relaunch can try again straight away.
  private triedAt = 0;
  private freshTry = false;

  constructor(
    private readonly file: string,
    private readonly sources: SuggestionSources
  ) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SavedSuggestions>;
      this.saved = {
        proposals: asList<Proposal>(raw.proposals).filter((proposal) => proposal?.card && Array.isArray(proposal.sources) && Array.isArray(proposal.sites)),
        dismissed: asList<string>(raw.dismissed),
        feedback: asList<Feedback>(raw.feedback),
        askedAt: typeof raw.askedAt === "number" ? raw.askedAt : 0,
        seen: typeof raw.seen === "number" ? raw.seen : 0,
      };
    } catch {
      // A missing or unreadable file only means asking again.
    }
  }

  private get now(): number {
    return this.sources.now?.() ?? Date.now();
  }

  private get liveMascots(): MascotProfile[] {
    return this.sources.mascots().filter(({ deletedAt }) => deletedAt === null);
  }

  private digest(): Digest {
    const routines = this.sources.routines();
    return buildDigest({
      visits: this.sources.visits(),
      chats: this.sources.chats(),
      routines: routines.map(({ id, name, schedule, sites }) => ({
        id,
        name,
        schedule,
        sites,
        runs: this.sources.runs(id).flatMap(({ status, startedAt }) => (status === "running" || status === "needs-approval" ? [] : [{ status, startedAt }])),
      })),
      mascots: this.liveMascots.map(({ name, sites }) => ({ name, sites })),
      feedback: this.saved.feedback,
      now: this.now,
    });
  }

  private get existing(): Existing {
    return {
      routines: this.sources.routines().map(({ name, instructions, sites }) => ({ name, instructions, sites })),
      mascots: this.liveMascots.map(({ name, sites }) => ({ name, sites })),
      feedback: this.saved.feedback,
    };
  }

  // The model's cards that still stand: everything they cite is still in the history, and nothing like them has been set up since.
  private proposalsNow(digest: Digest): Proposal[] {
    const present = new Set([...digest.evidence.values()].flatMap(({ sources }) => sources));
    const existing = this.existing;
    return this.saved.proposals.filter(
      (proposal) => proposal.sources.every((source) => present.has(source)) && !alreadyThere(proposal, existing)
    );
  }

  // The old rules' cards, worded in code.
  private fallback(): Array<{ pattern: Pattern; card: Suggestion }> {
    const chats = this.sources.chats();
    const open = findPatterns(this.sources.visits(), chats, this.now).filter((pattern) => this.isOpen(pattern));
    return topPatterns(open).flatMap((pattern) => {
      const chatIds = pattern.ids.flatMap((id) => (id.startsWith("chat:") ? [id.slice(5)] : []));
      const recent = chats.find(({ id }) => chatIds.includes(id))?.firstMessage ?? null;
      const words = fallbackWords(pattern, recent);
      return words ? [{ pattern, card: { ...words, why: pattern.why } }] : [];
    });
  }

  // Not dismissed, and not something they've already set up.
  private isOpen({ ids, sites }: Pattern): boolean {
    if (ids.some((id) => this.saved.dismissed.includes(id))) return false;
    const routines = this.sources.routines();
    const mascots = this.liveMascots;
    return !sites.some(({ host, label }) =>
      routines.some(({ name, instructions }) => `${name} ${instructions}`.toLowerCase().includes(host) || name.toLowerCase().includes(label.toLowerCase())) ||
      mascots.some((mascot) => mascot.sites.includes(host))
    );
  }

  list(): Suggestion[] {
    if (!this.sources.enabled()) return [];
    const digest = this.digest();
    void this.refresh(digest);
    const proposals = this.proposalsNow(digest);
    if (proposals.length > 0) return pickShown(proposals.map(({ card, why }) => ({ ...card, why })));
    return pickShown(this.fallback().map(({ card }) => card));
  }

  // It stays gone, and the model is told not to suggest anything like it again.
  dismiss(id: unknown): Suggestion[] {
    this.settle(id, "dismissed");
    return this.list();
  }

  // Sending its prompt or saving its form. It goes, and the model is told it was wanted.
  used(id: unknown): Suggestion[] {
    this.settle(id, "used");
    return this.list();
  }

  private settle(id: unknown, verdict: Feedback["verdict"]): void {
    if (typeof id !== "string") return;
    const feedback = (entry: Feedback) => [...this.saved.feedback, entry].slice(-MAX_FEEDBACK);
    const proposal = this.saved.proposals.find(({ card }) => card.id === id);
    if (proposal) {
      // Turning one down also keeps the old rules off what it was about.
      const ruledOut = verdict === "dismissed" ? proposal.sources.filter((source) => source.startsWith("site:") || source.startsWith("chat:")) : [];
      this.save({
        ...this.saved,
        proposals: this.saved.proposals.filter(({ card }) => card.id !== id),
        dismissed: [...new Set([...this.saved.dismissed, ...ruledOut])],
        feedback: feedback(feedbackOf(proposal, verdict, this.now)),
      });
      return;
    }
    const found = this.fallback().find(({ card }) => card.id === id);
    const ids = found?.pattern.ids ?? id.split("+").filter((part) => part.startsWith("site:") || part.startsWith("chat:"));
    if (ids.length === 0) return;
    this.save({
      ...this.saved,
      dismissed: [...new Set([...this.saved.dismissed, ...ids])],
      feedback: found ? feedback(feedbackOf({ card: found.card, sites: found.pattern.sites.map(({ host }) => host) }, verdict, this.now)) : this.saved.feedback,
    });
  }

  // Imported visits can be older than anything seen, and can come within the hour, so the next try is let through. Only
  // that one: the limit holds again after it.
  historyImported(): void {
    this.freshTry = true;
  }

  // At most once an hour, and only when there's more to go on.
  private async refresh(digest: Digest): Promise<void> {
    if (this.asking) return;
    const fresh = this.freshTry;
    this.freshTry = false;
    const { askedAt, seen } = this.saved;
    const limited = (this.triedAt > 0 && this.now - this.triedAt < RETRY_MS) || (askedAt > 0 && (this.now - askedAt < HOUR_MS || digest.newest <= seen));
    if (limited && !fresh) return;
    if (digest.evidence.size === 0 || !this.sources.hasModel()) return;

    this.asking = true;
    this.triedAt = this.now;
    try {
      // Tagged, so the model reads all of it as data.
      const reply = await this.sources.write(SUGGESTION_PROMPT, `<browsing_digest>\n${JSON.stringify(digest.data)}\n</browsing_digest>`);
      const proposals = verifyProposals(reply, digest, this.existing);
      // An answer with nothing that checks out still counts for the hour, and the old cards or rules stay.
      this.save({ ...this.saved, askedAt: this.now, seen: digest.newest, proposals: proposals.length > 0 ? proposals : this.saved.proposals });
      if (proposals.length > 0) this.sources.onChanged();
    } catch (error) {
      // There just aren't any new cards until the next try.
      console.error("Failed to write suggestions:", error);
    } finally {
      this.asking = false;
    }
  }

  private save(next: SavedSuggestions): void {
    this.saved = next;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(next, null, 2));
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save suggestions:", error);
    }
  }
}
