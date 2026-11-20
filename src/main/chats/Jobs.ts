import { siteOf } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import type { MascotProfile, UsedPage } from "../../shared/library";
import { BERRY, permissionsInWords, siteAllowed } from "../../shared/mascots";
import type { TabChoice } from "../../shared/attachments";
import { addressToKeep, replyPointsTo } from "./jobTabs";
import type { Approvals } from "./Approvals";
import type { ChatParts, Run } from "./chatTypes";
import type { Handoffs } from "./Handoffs";

// What a chat or task has to do with tabs. It outlasts a reply, so the next message can go on where the last one left off.
export interface Job {
  // The tabs it opened, which are all it can reach when it can't see the user's page.
  own: Set<string>;
  // Tabs it opened that the user has taken, with the address each was at.
  takenOver: Map<string, string>;
  // Where a call that names no tab goes. Fixed by the job, so the user's browsing can't redirect it.
  current: string | null;
  // Tabs the user attached to a message in this chat, which its tools reach from then on, unless the user has been
  // handed one or another job has it. The job never closes them.
  attached: Set<string>;
  // Their sites as they were attached, which count as ones the job has been on, as a page sent with a message does, and
  // nothing more: not as named, so a new subdomain there still asks.
  attachedSites: Set<string>;
}

const newJob = (): Job => ({ own: new Set(), takenOver: new Map(), current: null, attached: new Set(), attachedSites: new Set() });

// Every chat's and task's job, by its id, and which tabs are whose: what a job owns, what the user may give it, and the
// tabs it closes when its reply ends.
export class Jobs extends Map<string, Job> {
  readonly taskPopups = new Map<string, Set<string>>();

  private readonly runs: ChatParts["runs"];
  private readonly store: ChatParts["store"];
  private readonly browser: ChatParts["browser"];
  private readonly cloud: ChatParts["cloud"];
  private readonly mascotOf: ChatParts["mascotOf"];
  private readonly publishWorkingTabs: ChatParts["publishWorkingTabs"];
  private readonly withoutCodes: ChatParts["withoutCodes"];
  private readonly handoffs: Handoffs;
  private readonly decide: Approvals["decide"];

  constructor(
    parts: Pick<ChatParts, "runs" | "store" | "browser" | "cloud" | "mascotOf" | "publishWorkingTabs" | "withoutCodes"> & {
      handoffs: Handoffs;
      decide: Approvals["decide"];
    },
  ) {
    super();
    this.runs = parts.runs;
    this.store = parts.store;
    this.browser = parts.browser;
    this.cloud = parts.cloud;
    this.mascotOf = parts.mascotOf;
    this.publishWorkingTabs = parts.publishWorkingTabs;
    this.withoutCodes = parts.withoutCodes;
    this.handoffs = parts.handoffs;
    this.decide = parts.decide;
  }

  // Nothing's left to wait for once a handed-over tab has gone.
  tabClosed(tabId: string): void {
    this.handoffs.handedOver.delete(tabId);
    // An attached tab that's gone is simply no longer there to reach. Its site stays one the job has been on.
    this.forEach((job) => job.attached.delete(tabId));
    this.handoffs.handedBack.forEach((tab) => {
      if (tab.id === tabId) this.handoffs.handedBack.delete(tab);
    });
    this.runs.forEach((run, id) => {
      if (run.approval?.handoff?.tabId === tabId) this.decide(id, run.approval.id, false);
    });
  }

  // A page in a task's tab opened another. Nobody allowed that, so the task can't reach it, but it's cleared up with
  // the task's own.
  notePopup(openerId: string, tabId: string): void {
    this.taskPopups.forEach((popups, id) => {
      if (popups.has(openerId) || this.get(id)?.own.has(openerId)) popups.add(tabId);
    });
  }

  // Whether a chat or task is still using this tab as its own.
  isOwnTab(tabId: string): boolean {
    return [...this.values()].some(({ own }) => own.has(tabId));
  }

  jobOf(chatId: string): Job {
    const job = this.get(chatId) ?? newJob();
    this.set(chatId, job);
    return job;
  }

  // The tabs the user attached to a message in this chat, which its tools reach from then on.
  attach(chatId: string, tabs: readonly Tab[]): void {
    const job = this.jobOf(chatId);
    tabs.forEach((tab) => {
      job.attached.add(tab.id);
      if (/^https?:/.test(tab.url)) job.attachedSites.add(siteOf(tab.url));
      // Attaching a tab is the user sharing it, as sending the page in front is.
      job.takenOver.delete(tab.id);
      this.handoffs.letGo(tab);
    });
  }

  // Another job opened this tab, or another reply is working in it right now.
  inOtherHands(tabId: string, chatId: string | null): boolean {
    return (
      [...this].some(([id, job]) => id !== chatId && job.own.has(tabId)) ||
      [...this.runs].some(([id, run]) => id !== chatId && [...run.tabs].some((tab) => tab.id === tabId))
    );
  }

  // Why this tab can't go with a message in this chat, as this mascot, or null if it can. The one judge of it, for the
  // list the + menu shows and for the message itself. A tab a job opened isn't the user's to give, and isn't listed.
  tabProblem(tab: Tab, chatId: string | null, mascot: MascotProfile): string | null {
    if (!/^(https?|file):/.test(tab.url)) return "Nothing here can be read";
    const held = this.handoffs.handedOver.get(tab.id);
    if (held?.asking) {
      const need = [...this.runs.values()].find((run) => run.approval?.handoff?.tabId === tab.id)?.approval?.handoff?.need;
      return need === "code"
        ? "You’re entering a code there, so it stays yours"
        : need === "captcha"
          ? "You’re solving a captcha there, so it stays yours"
          : "You’re signing in there, so it stays yours";
    }
    if (this.isOwnTab(tab.id)) return "A job opened it, so it isn’t yours to give";
    const working = [...this.runs.entries()].find(
      ([id, run]) => id !== chatId && [...run.tabs].some(({ id: used }) => used === tab.id),
    )?.[1];
    if (working)
      return `${working.mascot.id === BERRY.id ? (this.browser.assistantName?.() ?? BERRY.name) : working.mascot.name} is working in it`;
    if (!siteAllowed(tab.url, mascot.sites)) {
      const [where] = permissionsInWords(mascot);
      return `${mascot.name} ${where.text.charAt(0).toLowerCase()}${where.text.slice(1)}`;
    }
    if (tab.trouble === "crashed") return "This page has crashed";
    return null;
  }

  // The user's own web pages, newest first, each with why it can't be added if it can't. Not the one in front, which is
  // This page, not internal pages, and not a tab a job opened. For a mascot limited to sites, only tabs on them.
  attachableTabs(chatId: string | null, mascotId: string | null): TabChoice[] {
    const chat = chatId ? this.store.chat(chatId) : null;
    if (chatId && !chat) return [];
    const mascot = this.mascotOf(chat ? chat.mascotId : typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null);
    if (mascot.deletedAt !== null) return [];
    const front = this.browser.activeTab()?.id;
    return [...this.browser.allTabs()]
      .reverse()
      .filter((tab) => tab.id !== front && !this.isOwnTab(tab.id) && siteAllowed(tab.url, mascot.sites))
      .map((tab) => ({
        id: tab.id,
        title: this.withoutCodes(tab.title || siteOf(tab.url)),
        site: siteOf(tab.url),
        favicon: tab.favicon,
        problem: this.tabProblem(tab, chatId, mascot),
      }));
  }

  // The chat whose running reply opened this tab and still has it. The sidebar shows it there, not with the user's tabs.
  jobChatOf(tabId: string): string | null {
    for (const [id, job] of this) {
      // A task has no chat to show it under.
      if (job.own.has(tabId) && this.runs.has(id) && !this.runs.get(id)?.onChange) return id;
    }
    return null;
  }

  // A reply is over, so the pages its job opened close, and the reply keeps their addresses to open again. The one the
  // reply sends the user to stays, as theirs. One that can't close, such as the one they're looking at, stays the job's,
  // since looking isn't taking over. One held for the user, or that another job is using, is left alone.
  closeJobTabs(chatId: string, run: Run): UsedPage[] {
    const job = this.get(chatId);
    if (!job || job.own.size === 0) return [];
    const open = run.cloud ? [...(run.usedInCloud ?? [])].filter((tab) => this.cloud?.page(tab.id) === tab) : this.browser.allTabs();
    const tabOf = (id: string) => open.find((tab) => tab.id === id) ?? null;
    const usedNow = new Set(
      [...this.runs.values()].flatMap((other) => [...other.tabs, ...(other.sentPage ? [other.sentPage] : [])].map((tab) => tab.id)),
    );
    const used = run.cloud ? [...(run.usedInCloud ?? [])] : [...run.used];
    const pages = new Map<string, UsedPage>();
    used.forEach((tab) => {
      if (!job.own.has(tab.id)) return;
      const url = addressToKeep(tab.url, {
        handedBack: this.handoffs.everHandedOver.has(tab.id),
        codeTyped: "noScreenshotsUntil" in tab && tab.noScreenshotsUntil > 0,
      });
      if (url) pages.set(url, { url: this.withoutCodes(url), title: this.withoutCodes(tab.title || siteOf(url)) });
    });
    const current = job.current ? tabOf(job.current) : null;
    const pointed = current && job.own.has(current.id) && replyPointsTo(run.partial, current.url) ? current.id : null;
    [...job.own].forEach((id) => {
      const tab = tabOf(id);
      if (!tab || this.handoffs.handedOver.has(id) || usedNow.has(id)) return;
      if (id === pointed) {
        job.own.delete(id);
        job.takenOver.set(id, this.withoutCodes(tab.url));
        this.browser.giveToUser?.(id);
        // A cloud page's tab in the window closes it too.
      } else if (this.browser.closeTab(id)) job.own.delete(id);
    });
    return [...pages.values()];
  }

  // The user clicked or typed in this tab, or sent it somewhere. Looking at it isn't enough. From here on it may hold
  // anything, so the job that opened it can't reach it, and the model is told why. A tab the user attached to a chat is
  // the same: it was shared as it stood, and once they use it again the chat has it only if they attach it again.
  releaseTab(tabId: string): void {
    this.taskPopups.forEach((popups) => popups.delete(tabId));
    const held = this.handoffs.handedOver.get(tabId);
    if (held) held.touched = true;
    // This runs on every click and key press in every tab, so most of the time it has nothing to do.
    if (!this.isOwnTab(tabId) && ![...this.values()].some(({ attached }) => attached.has(tabId))) return;
    const tab = this.browser.allTabs().find((candidate) => candidate.id === tabId);
    this.forEach((job, id) => {
      const opened = job.own.delete(tabId);
      const lent = job.attached.delete(tabId);
      if (!opened && !lent) return;
      // Said to the model later, when the tab may be somewhere else, so it's cleaned now.
      const url = tab?.url ?? this.cloud?.page(tabId)?.url;
      job.takenOver.set(tabId, url ? this.withoutCodes(url) : "an earlier page");
      if (tab) this.runs.get(id)?.tabs.delete(tab);
    });
    this.publishWorkingTabs();
  }
}
