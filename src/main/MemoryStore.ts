import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { MemoryFact, MemoryOffer, MemoryResult, MemoryState } from "../shared/library";
import { normaliseSite } from "../shared/mascots";
import { factProblem, MAX_FACTS_PER_MASCOT } from "../shared/memory";
import { cleanLine } from "../shared/publishing";
import { MEMORY_PROMPT, parseProposals, proposalData, covers, type KnownFact, type JobToRemember } from "./mascotMemory";

// Waiting offers are only worth so much, and a new one matters more than an old one nobody answered.
const MAX_OFFERS = 20;

export interface MemorySources {
  onChanged: () => void;
  enabled: () => boolean;
  hasModel: () => boolean;
  // Sends the prompt and the data, and returns what the model wrote.
  write: (system: string, data: string) => Promise<string>;
  // Whether this text is free of any code a phone has entered, or a held tab's address details.
  isClean: (text: string) => boolean;
}

export interface MemoryToOffer extends JobToRemember {
  sourceId: string;
  mascotId: string;
  // False once its moment has passed, such as a new message being sent while the model was thinking.
  stillWanted: () => boolean;
}

// Read back through the same check, so a file changed by hand can't put in what the app would never keep.
const parseStored = (item: unknown): MemoryFact | null => {
  const { id, mascotId, text, site, savedAt } = (item ?? {}) as Record<string, unknown>;
  const clean = cleanLine(text);
  const cleanSite = typeof site === "string" ? normaliseSite(site) : null;
  if (typeof id !== "string" || typeof mascotId !== "string" || (site !== null && !cleanSite) || factProblem(clean, cleanSite)) return null;
  return { id, mascotId, text: clean, site: cleanSite, savedAt: typeof savedAt === "number" ? savedAt : 0 };
};

// What each mascot remembers, in a JSON file. A fact only gets here through `decide`, when the user presses Remember, or
// `edit`. No tool can reach this class, and only the chrome's channels and the job's prompt read it. Offers and what's been
// declined stay in memory, so nothing goes on disk before the user says yes.
export class MemoryStore {
  private facts: MemoryFact[] = [];
  private offers: MemoryOffer[] = [];
  private readonly declined = new Map<string, KnownFact[]>();
  // Counts each bird's clearing, so an answer that was on its way when it happened isn't offered afterwards.
  private readonly cleared = new Map<string, number>();

  constructor(private readonly file: string, private readonly sources: MemorySources) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const fact = parseStored(item);
          if (fact && this.factsOf(fact.mascotId).length < MAX_FACTS_PER_MASCOT) this.facts.push(fact);
        }
      }
    } catch {
      // A missing or unreadable file means nothing is remembered yet, like settings.
    }
  }

  get state(): MemoryState {
    return { facts: this.facts, offers: this.offers };
  }

  factsOf(mascotId: string): MemoryFact[] {
    return this.facts.filter((fact) => fact.mascotId === mascotId);
  }

  // Never rejects, and costs one call to the cheap model. Nothing it says is kept unless the user presses Remember.
  async propose({ sourceId, mascotId, stillWanted, ...job }: MemoryToOffer): Promise<void> {
    if (!this.sources.enabled() || !this.sources.hasModel()) return;
    const held = this.factsOf(mascotId);
    if (held.length >= MAX_FACTS_PER_MASCOT) return;
    const kept = held.map(({ text, site }) => ({ text, site }));
    const declined = this.declined.get(mascotId) ?? [];
    const clearedBefore = this.cleared.get(mascotId) ?? 0;
    try {
      const reply = await this.sources.write(MEMORY_PROMPT, proposalData(job, kept, declined));
      if (!stillWanted() || !this.sources.enabled() || (this.cleared.get(mascotId) ?? 0) !== clearedBefore) return;
      // As things stand now, as the user may have answered another chat's offer while this was on its way.
      const known = this.factsOf(mascotId).map(({ text, site }) => ({ text, site }));
      const proposals = parseProposals(reply, { sites: job.sites, kept: known, declined: this.declined.get(mascotId) ?? [] }).filter(({ text }) => this.sources.isClean(text));
      if (proposals.length === 0) return;
      const offers = proposals.map((proposal) => ({ ...proposal, id: randomUUID(), mascotId, sourceId }));
      this.offers = [...this.offers, ...offers].slice(-MAX_OFFERS);
      this.sources.onChanged();
    } catch (error) {
      console.error("Failed to ask what to remember:", error);
    }
  }

  // What was offered is what's kept, by its id, so nothing a renderer sends can become a fact.
  decide(offerId: string, keep: boolean): MemoryResult {
    const offer = this.offers.find(({ id }) => id === offerId);
    if (!offer) return { ok: false, error: "This offer has gone." };
    if (!keep) {
      this.declined.set(offer.mascotId, [...(this.declined.get(offer.mascotId) ?? []), { text: offer.text, site: offer.site }]);
      this.dropOffer(offerId);
      return { ok: true };
    }
    if (this.factsOf(offer.mascotId).length >= MAX_FACTS_PER_MASCOT) {
      return { ok: false, error: `This bird already remembers ${MAX_FACTS_PER_MASCOT} things. Forget one in Flock first.` };
    }
    const { text, site, mascotId } = offer;
    if (!this.factsOf(mascotId).some((fact) => covers(fact, text, site))) {
      this.write([...this.facts, { id: randomUUID(), mascotId, text, site, savedAt: Date.now() }]);
    }
    this.dropOffer(offerId);
    return { ok: true };
  }

  private dropOffer(offerId: string): void {
    this.offers = this.offers.filter(({ id }) => id !== offerId);
    this.sources.onChanged();
  }

  // A bird asks once, right after the job it's about.
  dropOffers(sourceId: string): void {
    if (!this.offers.some((offer) => offer.sourceId === sourceId)) return;
    this.offers = this.offers.filter((offer) => offer.sourceId !== sourceId);
    this.sources.onChanged();
  }

  // The user's own words, under the same rules as anything else stored.
  edit(factId: string, input: unknown): MemoryResult {
    const fact = this.facts.find(({ id }) => id === factId);
    if (!fact) return { ok: false, error: "This has already been forgotten." };
    const text = cleanLine(input);
    const problem = factProblem(text, fact.site);
    if (problem) return { ok: false, error: problem };
    this.write(this.facts.map((one) => (one.id === factId ? { ...one, text } : one)));
    return { ok: true };
  }

  forget(factId: string): boolean {
    if (!this.facts.some(({ id }) => id === factId)) return false;
    this.write(this.facts.filter(({ id }) => id !== factId));
    return true;
  }

  // Everything about one bird, waiting offers too. Also what deleting that bird does.
  clear(mascotId: string): void {
    this.cleared.set(mascotId, (this.cleared.get(mascotId) ?? 0) + 1);
    this.offers = this.offers.filter((offer) => offer.mascotId !== mascotId);
    this.declined.delete(mascotId);
    this.write(this.facts.filter((fact) => fact.mascotId !== mascotId));
  }

  private write(facts: MemoryFact[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(facts, null, 2));
    renameSync(temp, this.file);
    this.facts = facts;
    this.sources.onChanged();
  }
}
