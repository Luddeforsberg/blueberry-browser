import { firecrawlSearch } from "../tools/webSearch";
import { firecrawlFetch } from "../tools/webFetch";
import { createPageTools, siteOf, type PageTool } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import type { CdpTab } from "../tools/CdpTab";
import type { MascotProfile } from "../../shared/library";
import { BERRY, siteAllowed } from "../../shared/mascots";
import type { Approvals } from "./Approvals";
import type { ChatParts, Run } from "./chatTypes";
import type { Handoffs } from "./Handoffs";
import type { Job, Jobs } from "./Jobs";

// The cloud browser does one job at a time, and this reply came while it was on another.
export class CloudBusyError extends Error {
  constructor() {
    super("The cloud browser is working on another job. Try again when that's done, or end it in Settings > Cloud.");
  }
}

// Berry as it comes, with nothing taken away, needs no limits at all.
const unlimited = (mascot: MascotProfile): boolean =>
  mascot.id === BERRY.id && mascot.sites.length === 0 && BERRY.tools.every((tool) => mascot.tools.includes(tool));

// The tools a reply gets, in the window's tabs or the cloud browser's pages, reaching only what its job may.
export class JobTools {
  private readonly browser: ChatParts["browser"];
  private readonly cloud: ChatParts["cloud"];
  private readonly pageAccess: ChatParts["pageAccess"];
  private readonly publishWorkingTabs: ChatParts["publishWorkingTabs"];
  private readonly withoutCodes: ChatParts["withoutCodes"];
  private readonly jobs: Jobs;
  private readonly handoffs: Handoffs;
  private readonly approvals: Approvals;

  constructor(
    parts: Pick<ChatParts, "browser" | "cloud" | "pageAccess" | "publishWorkingTabs" | "withoutCodes"> & {
      jobs: Jobs;
      handoffs: Handoffs;
      approvals: Approvals;
    },
  ) {
    this.browser = parts.browser;
    this.cloud = parts.cloud;
    this.pageAccess = parts.pageAccess;
    this.publishWorkingTabs = parts.publishWorkingTabs;
    this.withoutCodes = parts.withoutCodes;
    this.jobs = parts.jobs;
    this.handoffs = parts.handoffs;
    this.approvals = parts.approvals;
  }

  // The same tools on the cloud browser's pages. Only what this job opened there, and nothing in the window, so the
  // user's own tabs are out of reach. Approvals, limits, takeovers and handing a page to the user work as they do here.
  private cloudTools(chatId: string, run: Run, job: Job, asked: string): PageTool[] {
    const cloud = this.cloud;
    if (!cloud?.available()) throw new Error("The cloud browser is off.");
    if (!cloud.claim(chatId)) throw new CloudBusyError();
    const mine = () => cloud.pagesOf(chatId).filter((tab) => job.own.has(tab.id));
    const limits = unlimited(run.mascot) ? undefined : run.mascot;
    return createPageTools<CdpTab>({
      allTabs: mine,
      activeTab: () => mine().find((tab) => tab.id === job.current) ?? null,
      openTab: async (url) => {
        const tab = await cloud.open(chatId, url, limits && ((address) => siteAllowed(address, limits.sites)));
        job.own.add(tab.id);
        job.current = tab.id;
        return tab;
      },
      canSee: () => true,
      onUse: (tab) => {
        run.usedInCloud ??= new Set();
        run.usedInCloud.delete(tab);
        run.usedInCloud.add(tab);
        run.sites.delete(siteOf(tab.url));
        run.sites.add(siteOf(tab.url));
      },
      stopped: () => run.controller.signal.aborted,
      ownsEveryTab: true,
      ownsTab: (id) => job.own.has(id),
      takenOver: job.takenOver,
      limits,
      asked,
      beenTo: run.earlierSites,
      search: firecrawlSearch(),
      fetchPage: firecrawlFetch(),
      closeTab: (tab) => cloud.close(tab.id),
      heldByUser: (id) => this.handoffs.handedOver.has(id),
      handOver: (tab, need) => this.handoffs.handOverInCloud(chatId, run, job, tab, need),
      ask: (question, answers) => this.approvals.askQuestion(chatId, run, question, answers),
    });
  }

  // Tabs always open behind the user, so the approval cards, the reply and whatever they're doing stay in front. With
  // `page`, the page sent with this message, the tools also reach every open tab. Without it, only the job's own.
  // `asked` is what the user typed for this job, which names sites it may go to without asking. `attachedNow` are the tabs
  // attached to this message, the first place a call that names no tab goes when there's no page.
  jobTools(chatId: string, run: Run, page: Tab | null, asked: string, attachedNow: readonly Tab[] = []): PageTool[] {
    const job = this.jobs.jobOf(chatId);
    if (page) {
      job.current = page.id;
      // Sending the page with a message is the user handing it over.
      job.takenOver.delete(page.id);
    } else if (attachedNow.length > 0) {
      job.current = attachedNow[attachedNow.length - 1].id;
    } else if (job.current && !job.own.has(job.current) && !job.takenOver.has(job.current) && !job.attached.has(job.current)) {
      // That was the page from an earlier message. This one came without it, so it's out of reach.
      job.current = [...job.own].at(-1) ?? null;
    }
    // Its own tabs, and the ones the user attached to this chat while no other job has them.
    const lent = (tab: Tab) => !page && !job.own.has(tab.id) && job.attached.has(tab.id) && this.jobs.inOtherHands(tab.id, chatId);
    const reaches = (tab: Tab) => !!page || job.own.has(tab.id) || (job.attached.has(tab.id) && !lent(tab));
    const tools = run.cloud
      ? this.cloudTools(chatId, run, job, asked)
      : createPageTools<Tab>({
          allTabs: () => this.browser.allTabs().filter(reaches),
          // The tools say why a tab the user took or was handed is out of reach, so only one another job has goes unsaid.
          activeTab: () => this.browser.allTabs().find((tab) => tab.id === job.current && !lent(tab)) ?? null,
          openTab: (url) => {
            const tab = this.browser.openBackgroundTab(url);
            job.own.add(tab.id);
            job.current = tab.id;
            return tab;
          },
          canSee: () => !page || this.pageAccess(),
          onUse: (tab) => {
            run.tabs.add(tab);
            run.used.delete(tab);
            run.used.add(tab);
            run.sites.delete(siteOf(tab.url));
            run.sites.add(siteOf(tab.url));
            this.publishWorkingTabs();
          },
          stopped: () => run.controller.signal.aborted,
          ownsEveryTab: !page,
          ownsTab: (id) => job.own.has(id),
          takenOver: job.takenOver,
          heldByUser: (id) => this.handoffs.handedOver.has(id),
          handOver: (tab, need) => this.handoffs.handOver(chatId, run, job, tab, need),
          limits: unlimited(run.mascot) ? undefined : run.mascot,
          asked,
          beenTo: [...run.earlierSites, ...job.attachedSites],
          attached: (id) => job.attached.has(id),
          search: firecrawlSearch(),
          fetchPage: firecrawlFetch(),
          closeTab: (tab) => this.closeRunTab(run, tab),
          ask: (question, answers) => this.approvals.askQuestion(chatId, run, question, answers),
        });
    // A picture can't be gone through, so `Tab` refuses to take one instead. A refusal goes straight to the model too.
    return tools.map((tool) => ({
      ...tool,
      run: async (args) => {
        const result = await tool.run(args);
        return tool.returnsImage && result.startsWith("data:image/") ? result : this.withoutCodes(result);
      },
      refuses: async (args) => {
        const refused = (await tool.refuses?.(args)) ?? null;
        return refused && { ...refused, message: this.withoutCodes(refused.message) };
      },
    }));
  }

  private closeRunTab(run: Run, tab: Tab): boolean {
    const closed = this.browser.closeTab(tab.id);
    if (closed) {
      run.tabs.delete(tab);
      this.publishWorkingTabs();
    }
    return closed;
  }
}
