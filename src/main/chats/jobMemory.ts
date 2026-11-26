import { siteOf } from "../../shared/sites";
import { memoryNote } from "./mascotNote";
import { relevantFacts, worthRemembering } from "../memory/mascotMemory";
import type { MemoryToOffer } from "../memory/MemoryStore";
import type { MemoryFact } from "../../shared/library";
import type { ChatParts, Run } from "./chatTypes";
import type { Handoffs } from "./Handoffs";
import type { Job } from "./Jobs";

// What a job needs of a mascot's memory. No tool can reach any of this.
export interface ChatMemory {
  factsOf: (mascotId: string) => MemoryFact[];
  propose: (job: MemoryToOffer) => Promise<void>;
  dropOffers: (sourceId: string) => void;
}

// What a mascot remembers going into a job, and what it may offer to remember once the job is over.
export class JobMemory {
  private readonly store: ChatParts["store"];
  private readonly browser: ChatParts["browser"];
  private readonly mascotOf: ChatParts["mascotOf"];
  private readonly memory: ChatParts["memory"];
  private readonly publish: ChatParts["publish"];
  private readonly withoutCodes: ChatParts["withoutCodes"];
  private readonly jobs: ReadonlyMap<string, Job>;
  private readonly handoffs: Handoffs;

  constructor(
    parts: Pick<ChatParts, "store" | "browser" | "mascotOf" | "memory" | "publish" | "withoutCodes"> & {
      jobs: ReadonlyMap<string, Job>;
      handoffs: Handoffs;
    },
  ) {
    this.store = parts.store;
    this.browser = parts.browser;
    this.mascotOf = parts.mascotOf;
    this.memory = parts.memory;
    this.publish = parts.publish;
    this.withoutCodes = parts.withoutCodes;
    this.jobs = parts.jobs;
    this.handoffs = parts.handoffs;
  }

  // What the user typed in this chat, which is saved without any page that went with it.
  userWords(chatId: string): string[] {
    return (this.store.chat(chatId)?.messages ?? []).filter(({ role }) => role === "user").map(({ content }) => content);
  }

  // What this mascot remembers that's about this job, which goes into its prompt and shows on the reply.
  recall(id: string, run: Run, text: string): void {
    const facts = this.memory?.factsOf(run.mascot.id) ?? [];
    if (facts.length === 0) return;
    const job = this.jobs.get(id);
    const tabs = this.browser.allTabs().filter((tab) => tab.id === job?.current || job?.own.has(tab.id));
    const sites = [...run.mascot.sites, ...run.earlierSites, ...tabs.flatMap((tab) => siteOf(tab.url) ?? [])];
    const relevant = relevantFacts(facts, { sites, text, allowed: run.mascot.sites });
    run.memoryIds = relevant.map((fact) => fact.id);
    run.memoryNote = memoryNote(relevant);
    this.publish(id, run);
  }

  // The model only gets what the user typed, any question they answered, and the names of the sites used, never a page or
  // the reply. A site's name and a question's wording are as close as a page can get, and whatever comes back goes through
  // `parseProposals` and waits for the user, so nothing is kept until they press Remember.
  offerToRemember(sourceId: string, run: Run, failed: boolean, job: Pick<MemoryToOffer, "said" | "routine" | "stillWanted">): void {
    const handedOver =
      run.handedOver ||
      [...run.used].some(
        (tab) => this.handoffs.handedBack.has(tab) || this.handoffs.handedOver.has(tab.id) || tab.heldForUser || tab.mayShowCode,
      );
    const sites = [...run.sites].filter((site) => site.includes("."));
    // A routine's words were written earlier, so what's new is only what the user said during this run.
    if (
      !this.memory ||
      this.mascotOf(run.mascot.id).deletedAt !== null ||
      !worthRemembering({
        stopped: run.controller.signal.aborted,
        failed,
        replied: !!run.partial,
        handedOver,
        said: job.said.at(-1),
        answers: run.answers,
      })
    )
      return;
    void this.memory.propose({
      ...job,
      sourceId,
      mascotId: run.mascot.id,
      said: job.said.map((text) => this.withoutCodes(text)),
      routine: job.routine && this.withoutCodes(job.routine),
      answers: run.answers.map(({ question, answer }) => ({ question: this.withoutCodes(question), answer: this.withoutCodes(answer) })),
      sites,
    });
  }
}
