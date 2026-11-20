import { randomUUID } from "crypto";
import type { MemoryFact, MemoryOffer, MemoryResult, MemoryState } from "../../shared/library";
import { normaliseSite } from "../../shared/mascots";
import { factProblem, MAX_FACTS_PER_MASCOT } from "../../shared/memory";
import { cleanLine } from "../../shared/publishing";
import { readJsonFile, savedEntries, saveFile, type Saved } from "../library/savedFile";
import { MEMORY_PROMPT, parseProposals, proposalData, covers, type KnownFact, type JobToRemember } from "./mascotMemory";

// Waiting offers are only worth so much, and a new one matters more than an old one nobody answered.
const MAX_OFFERS = 20;
const NOT_SAVED = "This couldn't be saved. Check that there's space on your disk and try again.";

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
  // Counts each mascot's clearing, so an answer that was on its way when it happened isn't offered afterwards.
  private readonly cleared = new Map<string, number>();

  constructor(
    private readonly file: string,
    private readonly sources: MemorySources,
  ) {
    // A missing or unreadable file means nothing is remembered yet, like settings.
    for (const fact of savedEntries(file, readJsonFile(file), parseStored)) {
      if (this.factsOf(fact.mascotId).length < MAX_FACTS_PER_MASCOT) this.facts.push(fact);
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
      const proposals = parseProposals(reply, { sites: job.sites, kept: known, declined: this.declined.get(mascotId) ?? [] }).filter(
        ({ text }) => this.sources.isClean(text),
      );
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
      return { ok: false, error: `This mascot already remembers ${MAX_FACTS_PER_MASCOT} things. Forget one on its page first.` };
    }
    const { text, site, mascotId } = offer;
    const known = this.factsOf(mascotId).some((fact) => covers(fact, text, site));
    // The offer stays, so the user can say yes again.
    if (!known && !this.write([...this.facts, { id: randomUUID(), mascotId, text, site, savedAt: Date.now() }])) {
      return { ok: false, error: NOT_SAVED };
    }
    this.dropOffer(offerId);
    return { ok: true };
  }

  private dropOffer(offerId: string): void {
    this.offers = this.offers.filter(({ id }) => id !== offerId);
    this.sources.onChanged();
  }

  // A mascot asks once, right after the job it's about.
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
    return this.write(this.facts.map((one) => (one.id === factId ? { ...one, text } : one)))
      ? { ok: true }
      : { ok: false, error: NOT_SAVED };
  }

  // False if there was nothing to forget, or it couldn't be saved, so it's still remembered.
  forget(factId: string): boolean {
    if (!this.facts.some(({ id }) => id === factId)) return false;
    return this.write(this.facts.filter(({ id }) => id !== factId));
  }

  // Everything about one mascot, waiting offers too. Also what deleting that mascot does. False if its facts couldn't be
  // saved as gone, so they're still remembered.
  clear(mascotId: string): boolean {
    this.cleared.set(mascotId, (this.cleared.get(mascotId) ?? 0) + 1);
    this.offers = this.offers.filter((offer) => offer.mascotId !== mascotId);
    this.declined.delete(mascotId);
    return this.write(this.facts.filter((fact) => fact.mascotId !== mascotId));
  }

  // Only what was saved is remembered.
  private write(facts: MemoryFact[]): Saved {
    const saved = saveFile(this.file, JSON.stringify(facts, null, 2));
    if (saved) {
      this.facts = facts;
      this.sources.onChanged();
    }
    return saved;
  }
}
