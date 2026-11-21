import { siteName } from "../../shared/sites";
import type { Tab } from "../tabs/Tab";
import type { CdpTab } from "../tools/CdpTab";
import type { WorkTabState } from "../../shared/library";
import { siteAllowed } from "../../shared/mascots";
import type { JobWork } from "../window/WorkViews";
import type { ChatParts, EndedRun } from "./chatTypes";
import type { Jobs } from "./Jobs";

// What the working view needs of a reply, running or over.
type Shown = Pick<EndedRun, "mascot" | "startedAt" | "withPage" | "cloud" | "tabIds" | "sites">;

// What a chat's working view shows of its latest reply. Only ever a read: nothing here changes a run or what it's been on.
export class WorkView {
  private readonly runs: ChatParts["runs"];
  private readonly finished: ChatParts["finished"];
  private readonly browser: ChatParts["browser"];
  private readonly cloud: ChatParts["cloud"];
  private readonly pageAccess: ChatParts["pageAccess"];
  private readonly jobs: Jobs;

  constructor(parts: Pick<ChatParts, "runs" | "finished" | "browser" | "cloud" | "pageAccess"> & { jobs: Jobs }) {
    this.runs = parts.runs;
    this.finished = parts.finished;
    this.browser = parts.browser;
    this.cloud = parts.cloud;
    this.pageAccess = parts.pageAccess;
    this.jobs = parts.jobs;
  }

  // What a chat's working view shows: the tabs its latest reply has used, and whether each may be pictured.
  work(chatId: string): JobWork | null {
    const run = this.runs.get(chatId);
    if (run) {
      const shown: Shown = {
        mascot: run.mascot,
        startedAt: run.startedAt,
        withPage: run.withPage,
        cloud: !!run.cloud,
        tabIds: [...(run.cloud ? (run.usedInCloud ?? []) : run.used)].map((tab) => tab.id),
        sites: [...run.sites],
      };
      return this.workOf(chatId, shown, {
        endedAt: null,
        outcome: null,
        step: run.steps.filter((step) => !step.done).at(-1)?.text ?? null,
      });
    }
    const ended = this.finished.get(chatId);
    return ended ? this.workOf(chatId, ended, { endedAt: ended.endedAt, outcome: ended.outcome, step: null }) : null;
  }

  private workOf(chatId: string, shown: Shown, now: Pick<JobWork, "endedAt" | "outcome" | "step">): JobWork {
    const tabs = shown.cloud ? this.cloudTabsOf(chatId, shown) : this.tabsOf(chatId, shown);
    return {
      mascotId: shown.mascot.id,
      startedAt: shown.startedAt,
      ...now,
      tabs,
      currentId: tabs.at(-1)?.tab.id ?? null,
      sites: [...shown.sites].reverse(),
    };
  }

  private tabsOf(chatId: string, shown: Shown): JobWork["tabs"] {
    const open = this.browser.allTabs();
    const state = (tab: Tab): WorkTabState => {
      const holder = this.jobs.holderOf(chatId, tab, shown.withPage);
      if (holder !== "job") return holder;
      if (!siteAllowed(tab.url, shown.mascot.sites)) return "off-limits";
      if (shown.withPage && !this.pageAccess()) return "no-access";
      return tab.mayShowCode || tab.trouble || tab.loadError ? "none" : "picture";
    };
    return shown.tabIds
      .flatMap((id) => open.filter((tab) => tab.id === id))
      .map((tab) => ({ tab, state: state(tab), site: siteName(tab.url) }));
  }

  // A job in the cloud's pages are only ever its own. The chrome shows them from the cloud tab's own live view or
  // pictures, so nothing of them is captured here.
  private cloudTabsOf(chatId: string, shown: Shown): JobWork["tabs"] {
    const state = (tab: CdpTab): WorkTabState => {
      const holder = this.jobs.holderOf(chatId, tab, false);
      if (holder !== "job") return holder;
      if (!siteAllowed(tab.url, shown.mascot.sites)) return "off-limits";
      return tab.trouble || tab.loadError ? "none" : "picture";
    };
    return shown.tabIds
      .flatMap((id) => this.cloud?.page(id) ?? [])
      .map((tab) => ({ tab, cloud: true as const, state: state(tab), site: siteName(tab.url) }));
  }
}
