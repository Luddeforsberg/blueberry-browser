import { sendToRenderer } from "./ipc";
import type { CdpTab } from "./CdpTab";
import type { Tab } from "./Tab";
import type { WorkOutcome, WorkTab, WorkTabState, WorkView } from "../shared/library";
import type { WebContents } from "electron";

// A picture every this often while the bird is doing something, and it can really be seen flying and pecking.
const LIVELY_MS = 80;
const CURRENT_MS = 500;
// A page that hasn't changed for a while gets looked at less.
const STILL_MS = 1000;
const STILL_AFTER = 4;
const OTHER_TAB_MS = 3000;
const THUMBNAIL_WIDTH = 240;
// Twice what's on screen is sharp on any display, and this much is the most a picture can use.
const MAX_PICTURE_WIDTH = 900;
const SHARPNESS = 2;

// What `Chats` knows about a job and its tabs.
export interface JobWork {
  mascotId: string;
  startedAt: number;
  endedAt: number | null;
  outcome: WorkOutcome | null;
  // A cloud page is never captured here: the chrome shows the cloud tab's own live view or pictures.
  tabs: Array<{ tab: Tab; cloud?: false; state: WorkTabState; site: string } | { tab: CdpTab; cloud: true; state: WorkTabState; site: string }>;
  // The tab it used last, which is where it's working now.
  currentId: string | null;
  sites: string[];
  // What a running step says, for when there's no bird to say anything.
  step: string | null;
}

interface WorkViewsDeps {
  chrome: () => WebContents;
  // Null once there's nothing about it to show.
  work: (chatId: string) => JobWork | null;
  // The chat is the tab in front, in a window that's showing.
  onScreen: (chatId: string) => boolean;
  pageWidth: () => number;
}

type LocalEntry = Extract<JobWork["tabs"][number], { tab: Tab }>;
const localTabs = (job: JobWork): LocalEntry[] => job.tabs.filter((entry): entry is LocalEntry => !entry.cloud);

interface Seen {
  at: number;
  width: number;
  picture: Buffer;
  unchanged: number;
}

// The steps are written for afterwards, and this is what's happening now. The labels are from `browserTools.ts`, and one
// not here stays as it is.
const NOW: Array<[string, string]> = [
  ["Read ", "Reading "],
  ["Looked ", "Looking "],
  ["Clicked ", "Clicking "],
  ["Double-clicked ", "Double-clicking "],
  ["Typed ", "Typing "],
  ["Went ", "Going "],
  ["Opened ", "Opening "],
  ["Scrolled", "Scrolling"],
  ["Chose ", "Choosing "],
  ["Checked ", "Checking "],
  ["Moved ", "Moving "],
  ["Searched ", "Searching "],
  ["Dragged ", "Dragging "],
  ["Pressed ", "Pressing "],
  ["Closed ", "Closing "],
  ["Waited ", "Waiting "],
];

export const stepInPresentTense = (step: string): string => {
  const found = NOW.find(([past]) => step.startsWith(past));
  return found ? found[1] + step.slice(found[0].length) : step;
};

const clampWidth = (width: unknown): number => (typeof width === "number" && Number.isFinite(width) ? Math.max(0, Math.min(width, MAX_PICTURE_WIDTH / SHARPNESS)) : 0);

// The working view on the main chat: what a job is doing in its tabs, with small pictures of them. Pictures exist only
// here for a moment, and in the chrome renderer while they're on screen. Nothing else gets them, and they never touch a
// chat, a tool or the disk. Captures run only while that view is on screen, and only of tabs the job is using.
export class WorkViews {
  private watching: { chatId: string; width: number } | null = null;
  private readonly seen = new Map<string, Seen>();
  private startedAt = 0;
  private lastView = "null";
  private timer: NodeJS.Timeout | null = null;
  private capturing = false;
  private readonly pictured = new Set<Tab>();
  private destroyed = false;

  constructor(private readonly deps: WorkViewsDeps) {}

  watch(chatId: string | null, width: number): void {
    const next = typeof chatId === "string" ? { chatId, width: clampWidth(width) } : null;
    if (next?.chatId !== this.watching?.chatId) this.seen.clear();
    this.watching = next;
    // A chat coming back to the screen has to hear where things are, even if it's what was last said.
    this.lastView = "";
    this.sync();
  }

  private get job(): JobWork | null {
    const { watching } = this;
    return watching && this.deps.onScreen(watching.chatId) ? this.deps.work(watching.chatId) : null;
  }

  // Anything a view depends on may have changed. Everything that stops a picture calls this, as well as the next capture
  // checking for itself.
  sync(): void {
    // A capture or a reply can end after the window and its views have gone.
    if (this.destroyed) return;
    const { watching } = this;
    const job = this.job;
    if (job && job.startedAt !== this.startedAt) {
      this.startedAt = job.startedAt;
      this.seen.clear();
    }
    this.setScales(job);
    job?.tabs.forEach(({ tab, state }) => {
      if (state !== "picture") this.seen.delete(tab.id);
    });
    // A job that ended with no picture taken of it has nothing to settle on, so it isn't brought up again. A cloud page
    // still shows in its cloud tab, so it's something to settle on.
    const settled = this.seen.size > 0 || !!job?.tabs.some((entry) => entry.cloud && entry.state === "picture");
    const view = watching && job && (job.outcome === null || settled) ? this.viewOf(watching.chatId, job) : null;
    const said = JSON.stringify(view);
    if (said !== this.lastView) {
      this.lastView = said;
      sendToRenderer(this.deps.chrome(), "work:updated", view);
    }
    this.schedule();
  }

  private viewOf(chatId: string, job: JobWork): WorkView | null {
    const tabs: WorkTab[] = job.tabs.map((entry) => ({
      id: entry.tab.id,
      site: entry.site,
      title: entry.tab.title,
      favicon: entry.cloud ? null : entry.tab.favicon,
      state: entry.state,
      current: entry.tab.id === job.currentId,
      ...(entry.cloud ? { cloud: true } : {}),
    }));
    if (tabs.length === 0) return null;
    const current = localTabs(job).find(({ tab }) => tab.id === job.currentId);
    const saying = current?.state === "picture" ? current.tab.actor.saying : "";
    return {
      chatId,
      mascotId: job.mascotId,
      tabs,
      doing: job.outcome ? null : saying || (job.step && stepInPresentTense(job.step)),
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      outcome: job.outcome,
      sites: job.sites,
    };
  }

  // Which tabs count as watched, for the bird: only the big picture, as there's one bird. It moves as soon as the job
  // does, before anything is drawn, because using a tab makes it the current one.
  private setScales(job: JobWork | null): void {
    const width = this.watching?.width ?? 0;
    const pageWidth = this.deps.pageWidth();
    const scale = width > 0 && pageWidth > 0 ? width / pageWidth : null;
    const live = new Set(
      job && scale !== null ? localTabs(job).filter(({ state, tab }) => state === "picture" && (job.outcome === null ? tab.id === job.currentId : tab.isLeaving)).map(({ tab }) => tab) : []
    );
    this.pictured.forEach((tab) => {
      if (!live.has(tab)) {
        tab.setPictureScale(null);
        this.pictured.delete(tab);
      }
    });
    live.forEach((tab) => {
      if (tab.pictureScale !== scale) tab.setPictureScale(scale);
      this.pictured.add(tab);
    });
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const job = this.job;
    // Words with no pictures still need to keep up with what the job is doing.
    if (job && (job.outcome === null || localTabs(job).some(({ tab }) => tab.isLeaving))) this.timer = setTimeout(() => void this.tick(), this.nextDelay(job));
  }

  private widthFor(current: boolean): number {
    return current ? Math.round((this.watching?.width ?? 0) * SHARPNESS) : THUMBNAIL_WIDTH;
  }

  private intervalOf(tab: Tab, current: boolean): number {
    // One that has just become the main picture is only as sharp as a thumbnail until it's taken again.
    if (this.seen.has(tab.id) && this.seen.get(tab.id)?.width !== this.widthFor(current)) return 0;
    if (!current) return OTHER_TAB_MS;
    if (tab.actor.lively) return LIVELY_MS;
    return (this.seen.get(tab.id)?.unchanged ?? 0) >= STILL_AFTER ? STILL_MS : CURRENT_MS;
  }

  private due(job: JobWork): Array<{ tab: Tab; current: boolean; wait: number }> {
    const now = Date.now();
    return localTabs(job)
      .filter(({ state, tab }) => state === "picture" && tab.isParked)
      .map(({ tab }) => {
        const current = tab.id === job.currentId;
        return { tab, current, wait: (this.seen.get(tab.id)?.at ?? 0) + this.intervalOf(tab, current) - now };
      });
  }

  private nextDelay(job: JobWork): number {
    if (!this.watching?.width) return CURRENT_MS;
    return Math.max(16, Math.min(CURRENT_MS, ...this.due(job).map(({ wait }) => wait)));
  }

  private async tick(): Promise<void> {
    if (this.capturing) return;
    const job = this.job;
    if (job && this.watching?.width) {
      this.capturing = true;
      try {
        await Promise.all(this.due(job).filter(({ wait }) => wait <= 0).map(({ tab, current }) => this.capture(tab, current)));
      } finally {
        this.capturing = false;
      }
    }
    this.sync();
  }

  private async capture(tab: Tab, current: boolean): Promise<void> {
    const { watching } = this;
    if (!watching) return;
    const before = this.seen.get(tab.id);
    const width = this.widthFor(current);
    const picture = await tab.picture(width);
    // The user may have gone elsewhere or taken the tab while that was on its way, and it goes no further if so.
    const job = this.watching?.chatId === watching.chatId ? this.job : null;
    if (!picture || job?.tabs.find((entry) => entry.tab === tab)?.state !== "picture") return;
    const same = !!before?.picture?.equals(picture);
    this.seen.set(tab.id, { at: Date.now(), width, picture, unchanged: same ? (before?.unchanged ?? 0) + 1 : 0 });
    if (same) return;
    sendToRenderer(this.deps.chrome(), "work:frame", {
      chatId: watching.chatId,
      tabId: tab.id,
      picture: `data:image/jpeg;base64,${picture.toString("base64")}`,
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.watching = null;
    this.seen.clear();
  }
}
