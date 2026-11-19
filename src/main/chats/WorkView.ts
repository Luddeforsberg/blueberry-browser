import { siteOf } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import type { CdpTab } from "../tools/CdpTab";
import type { WorkTabState } from "../../shared/library";
import { siteAllowed } from "../../shared/mascots";
import type { JobWork } from "../window/WorkViews";
import type { ChatParts, Run } from "./chatTypes";
import type { Handoffs } from "./Handoffs";
import type { Job } from "./Jobs";

// What a chat's working view shows of its latest reply.
export class WorkView {
  private readonly runs: ChatParts["runs"];
  private readonly errors: ChatParts["errors"];
  private readonly finished: ChatParts["finished"];
  private readonly browser: ChatParts["browser"];
  private readonly cloud: ChatParts["cloud"];
  private readonly pageAccess: ChatParts["pageAccess"];
  private readonly jobs: ReadonlyMap<string, Job>;
  private readonly handoffs: Handoffs;

  constructor(
    parts: Pick<ChatParts, "runs" | "errors" | "finished" | "browser" | "cloud" | "pageAccess"> & {
      jobs: ReadonlyMap<string, Job>;
      handoffs: Handoffs;
    },
  ) {
    this.runs = parts.runs;
    this.errors = parts.errors;
    this.finished = parts.finished;
    this.browser = parts.browser;
    this.cloud = parts.cloud;
    this.pageAccess = parts.pageAccess;
    this.jobs = parts.jobs;
    this.handoffs = parts.handoffs;
  }

  // What a chat's working view shows: the tabs its latest reply has used, and whether each may be pictured. A tab the user
  // has is theirs, and so is any the job can't see or reach, whatever the job did there earlier.
  work(chatId: string): JobWork | null {
    const ended = this.finished.get(chatId);
    const run = this.runs.get(chatId) ?? ended?.run;
    if (!run) return null;
    const job = this.jobs.get(chatId);
    const running = this.runs.get(chatId) === run;
    const tabs = run.cloud ? this.cloudTabsOf(run, job) : this.tabsOf(run, job);
    if (running) tabs.forEach(({ tab }) => run.sites.add(siteOf(tab.url)));
    return {
      mascotId: run.mascot.id,
      startedAt: run.startedAt,
      endedAt: ended && !running ? ended.endedAt : null,
      outcome: running ? null : run.controller.signal.aborted ? "stopped" : this.errors.has(chatId) ? "failed" : "done",
      tabs,
      currentId: tabs.at(-1)?.tab.id ?? null,
      sites: [...run.sites].reverse(),
      step: run.steps.filter((step) => !step.done).at(-1)?.text ?? null,
    };
  }

  private tabsOf(run: Run, job: Job | undefined): JobWork["tabs"] {
    const open = this.browser.allTabs();
    const state = (tab: Tab): WorkTabState => {
      if (this.handoffs.handedOver.has(tab.id) || tab.heldForUser) return "held";
      if (job?.takenOver.has(tab.id) || !(run.withPage || job?.own.has(tab.id) || job?.attached.has(tab.id))) return "yours";
      if (!siteAllowed(tab.url, run.mascot.sites)) return "off-limits";
      if (run.withPage && !this.pageAccess()) return "no-access";
      return tab.mayShowCode || tab.trouble || tab.loadError ? "none" : "picture";
    };
    return [...run.used].filter((tab) => open.includes(tab)).map((tab) => ({ tab, state: state(tab), site: siteOf(tab.url) }));
  }

  // A job in the cloud's pages are only ever its own. The chrome shows them from the cloud tab's own live view or
  // pictures, so nothing of them is captured here.
  private cloudTabsOf(run: Run, job: Job | undefined): JobWork["tabs"] {
    const state = (tab: CdpTab): WorkTabState => {
      if (this.handoffs.handedOver.has(tab.id)) return "held";
      if (job?.takenOver.has(tab.id) || !job?.own.has(tab.id)) return "yours";
      if (!siteAllowed(tab.url, run.mascot.sites)) return "off-limits";
      return tab.trouble || tab.loadError ? "none" : "picture";
    };
    return [...(run.usedInCloud ?? [])]
      .filter((tab) => this.cloud?.page(tab.id) === tab)
      .map((tab) => ({ tab, cloud: true, state: state(tab), site: siteOf(tab.url) }));
  }
}
