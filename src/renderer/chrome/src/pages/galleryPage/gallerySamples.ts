import type { GalleryMascot, MascotProfile, MemoryFact, NeedsYouItem, Suggestion, WorkTab, WorkView } from "@shared/library";
import type { DownloadInfo } from "@shared/ipc";
import { MOOD_LABELS, type Mood } from "@common/components/moods";
import type { PipPattern } from "@common/components/pipPatterns";
import type { AddMenuOptions } from "../../components/AddMenu";
import type { TabChoice } from "@shared/attachments";
import type { AskCard, MenuEntry } from "@shared/ipc";
import { BERRY_ID } from "@shared/mascots";
import type { SuggestionRow } from "../../newTabSuggestions";
import type { WorkFrames } from "../../components/useWorkView";
import type { RoutineRun } from "@shared/library";

// Part of the component gallery (GalleryPage.tsx): the sample data its sections show.

export const MOODS = Object.keys(MOOD_LABELS) as Mood[];

export const PIP_WORDS: Record<PipPattern, string> = {
  think: "Thinking..",
  reading: "Reading..",
  scanning: "Scanning..",
  clicking: "Clicking..",
  typing: "Typing..",
  searching: "Searching..",
  waiting: "Waiting for you",
};

// What the + menu shows, in each state.
export const SAMPLE_TABS: TabChoice[] = [
  { id: "g-1", title: "Flights to Lisbon · KLM", site: "klm.com", favicon: null, problem: null },
  { id: "g-2", title: "Inbox · Linear", site: "linear.app", favicon: null, problem: null },
  { id: "g-3", title: "Mail", site: "mail.example", favicon: null, problem: "You’re signing in there, so it stays yours" },
];
export const MANY_TABS: TabChoice[] = [
  ...SAMPLE_TABS,
  ...["Hotels in Alfama", "Lisbon, next ten days", "Trains to Sintra"].map((title, n) => ({
    id: `g-more-${n}`,
    title,
    site: "example.com",
    favicon: null,
    problem: null,
  })),
];
export const sampleAdd = (overrides: Partial<AddMenuOptions> = {}): AddMenuOptions => ({
  tabs: { problem: null, note: null, load: async () => SAMPLE_TABS, added: [], onChoose: () => undefined },
  files: { problem: null, onChoose: () => undefined },
  ...overrides,
});

export const SAMPLE_FACTS: MemoryFact[] = [
  { id: "gallery-fact-1", mascotId: "gallery", text: "You want prices in kronor.", site: null, savedAt: 1 },
  { id: "gallery-fact-2", mascotId: "gallery", text: "You always choose the cheapest option that’s in stock.", site: null, savedAt: 2 },
];

export const SAMPLE_MASCOT: MascotProfile = {
  id: "gallery-mascot",
  name: "Scout",
  look: { palette: "blueberry", accessory: "cap" },
  instructions: "Reads pull requests and tells me what needs me.",
  sites: ["github.com"],
  tools: ["visit"],
  deletedAt: null,
};

export const SAMPLE_GALLERY_ENTRY: GalleryMascot = {
  id: "gallery-entry",
  author: "Blueberry",
  category: "Work",
  description: "Tells you which pull requests need you, and why.",
  draft: SAMPLE_MASCOT,
};

const SAMPLE_STEPS = [
  { text: "Opened norrskenair.com", done: true },
  { text: "Read norrskenair.com", done: true },
];

const SAMPLE_RUN: RoutineRun = {
  id: "gallery-run",
  routineId: "gallery",
  status: "finished",
  startedAt: Date.now(),
  endedAt: Date.now(),
  lateFor: null,
  steps: SAMPLE_STEPS,
  result: "Found three flights under €200.",
  error: null,
  approval: null,
  tokens: 4210,
  seen: true,
};

const SAMPLE_APPROVAL = { id: "gallery-approval", text: "Click the button “Delete” on https://example.com/" };

export const SAMPLE_RUNS: RoutineRun[] = [
  {
    ...SAMPLE_RUN,
    id: "run-1",
    status: "running",
    steps: [SAMPLE_STEPS[0], { text: "Reading norrskenair.com", done: false }],
    result: null,
    tokens: null,
  },
  { ...SAMPLE_RUN, id: "run-2", status: "needs-approval", approval: SAMPLE_APPROVAL, result: null, tokens: null },
  { ...SAMPLE_RUN, id: "run-3", lateFor: Date.now() - 3_600_000 },
  { ...SAMPLE_RUN, id: "run-4", status: "failed", result: null, error: "The model is rate limited right now. Try again in a moment." },
  { ...SAMPLE_RUN, id: "run-5", status: "stopped", result: null },
  { ...SAMPLE_RUN, id: "run-6", status: "interrupted", approval: SAMPLE_APPROVAL, result: null, tokens: null },
];

export const SAMPLE_DOWNLOAD: DownloadInfo = {
  id: "gallery",
  filename: "field-notes.pdf",
  path: "/Downloads/field-notes.pdf",
  source: "example.com",
  state: "progressing",
  receivedBytes: 3_400_000,
  totalBytes: 9_100_000,
  startedAt: 0,
  canResume: false,
  missing: false,
};

export const SAMPLE_DOWNLOADS: DownloadInfo[] = [
  SAMPLE_DOWNLOAD,
  { ...SAMPLE_DOWNLOAD, id: "unknown-size", totalBytes: 0 },
  { ...SAMPLE_DOWNLOAD, id: "paused", state: "paused" },
  { ...SAMPLE_DOWNLOAD, id: "stopped", state: "interrupted", canResume: true },
  { ...SAMPLE_DOWNLOAD, id: "finished", state: "completed", receivedBytes: 9_100_000 },
  { ...SAMPLE_DOWNLOAD, id: "missing", state: "completed", missing: true, receivedBytes: 9_100_000 },
  { ...SAMPLE_DOWNLOAD, id: "cancelled", state: "cancelled" },
  { ...SAMPLE_DOWNLOAD, id: "failed", state: "interrupted" },
];

const waitingSample = (id: string, approval: Omit<NeedsYouItem["approval"], "id">, job: string): NeedsYouItem => ({
  id,
  approval: { id, ...approval },
  mascotId: BERRY_ID,
  job,
  routineId: null,
  from: null,
  lastStep: "Opened example.com",
  tabId: null,
  askedAt: 0,
});

export const SAMPLE_WAITING: NeedsYouItem[] = [
  waitingSample(
    "sample-allow",
    { text: "Open https://klm.com/orders?from=inbox0 in a new tab", why: { reason: "carries-data", mark: "?from=inbox0" } },
    "Check flight reservations",
  ),
  waitingSample(
    "sample-question",
    { text: "Which of the two flights did you mean?", question: true, answers: ["The 07:10", "The 16:45"] },
    "Book the flight",
  ),
  waitingSample(
    "sample-code",
    { text: "Berry needs a code for linkedin.com", handoff: { need: "code", tabId: "none", site: "linkedin.com" } },
    "Check my messages",
  ),
  waitingSample(
    "sample-handoff",
    { text: "Berry needs you to sign in on example.com", handoff: { need: "sign-in", tabId: "none", site: "example.com" } },
    "Check my orders",
  ),
];

const SAMPLE_SUGGESTIONS: Suggestion[] = [
  {
    id: "sample-prompt",
    kind: "prompt",
    title: "This week’s cheapest Lisbon flights",
    why: "You’ve asked something like this 3 times",
    prompt: "Find the cheapest flights to Lisbon this week.",
  },
  {
    id: "sample-routine",
    kind: "routine",
    title: "Top 5 stories, waiting at 8:15",
    why: "You’ve opened Hacker News around 8:30 on 4 of the last 5 days",
    draft: { name: "Morning stories", instructions: "Read the front page and list the top 5.", schedule: { kind: "daily", time: "08:15" } },
  },
  {
    id: "sample-mascot",
    kind: "mascot",
    title: "Pip, your pull request runner",
    why: "You’ve gone back and forth between GitHub and Linear on 4 of the last 5 days",
    draft: {
      name: "Pip",
      look: { palette: "blueberry", accessory: "glasses" },
      instructions: "Keep an eye on my pull requests.",
      sites: ["github.com", "linear.app"],
      tools: ["visit"],
    },
  },
];

// Every kind of row under the new tab's box, from the samples above, a finished chat and a mascot to try.
export const SAMPLE_ROWS: SuggestionRow[] = [
  {
    kind: "pick-up",
    key: "sample-chat",
    chat: {
      id: "sample-chat",
      title: "Compare standing desks under 6 000 kr",
      updatedAt: Date.now() - 3 * 86_400_000,
      mascotId: null,
      from: null,
    },
  },
  ...SAMPLE_SUGGESTIONS.map((suggestion): SuggestionRow => ({ kind: "suggestion", key: suggestion.id, suggestion })),
  {
    kind: "try",
    key: "sample-try",
    prompt: "Prep me for a call with Spotify’s ads team.",
    mascot: {
      id: "sample-prep",
      name: "Meeting Prep",
      look: { palette: "lingon", accessory: "glasses" },
      instructions: "",
      sites: [],
      tools: ["visit"],
      deletedAt: null,
    },
  },
];

const SAMPLE_PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70"><rect width="100" height="70" fill="#fbf6ee"/><rect x="8" y="8" width="40" height="5" fill="#2a2118"/><rect x="8" y="20" width="25" height="30" fill="#e8b98a"/><rect x="38" y="20" width="25" height="30" fill="#b8d3a6"/><rect x="68" y="20" width="25" height="30" fill="#b39a86"/></svg>')}`;
export const SAMPLE_FRAMES: WorkFrames = { get: () => SAMPLE_PICTURE, subscribe: () => () => {} };
export const SAMPLE_ASKING = { id: "sample", text: "Click the button “Place order”" };
const sampleTab = (state: WorkTab["state"], site = "alderandmoss.se", current = true): WorkTab => ({
  id: site,
  site,
  title: site,
  favicon: null,
  state,
  current,
});
const sampleWork = (tabs: WorkTab[], rest: Partial<WorkView> = {}): WorkView => ({
  chatId: "sample",
  mascotId: BERRY_ID,
  tabs,
  doing: "Clicking Add to cart",
  startedAt: 0,
  endedAt: 42_000,
  outcome: null,
  sites: ["alderandmoss.se"],
  ...rest,
});
export const WORK_SAMPLES: Array<{ label: string; view: WorkView; asking?: boolean }> = [
  { label: "Working", view: sampleWork([sampleTab("picture")]) },
  {
    label: "Two tabs",
    view: sampleWork([sampleTab("picture"), sampleTab("picture", "kaffekartan.se", false)], {
      sites: ["alderandmoss.se", "kaffekartan.se"],
    }),
  },
  { label: "Waiting for an answer", view: sampleWork([sampleTab("picture")]), asking: true },
  { label: "Handed to the user", view: sampleWork([sampleTab("held")]), asking: true },
  { label: "Taken over", view: sampleWork([sampleTab("yours")]) },
  { label: "Off its sites", view: sampleWork([sampleTab("off-limits")]) },
  { label: "Finished", view: sampleWork([sampleTab("picture")], { outcome: "done" }) },
  { label: "Stopped", view: sampleWork([sampleTab("picture")], { outcome: "stopped" }) },
];

// Our menus as main sends them, with what each kind of row can be, and the three kinds of Asking first.
const sampleRow = (id: string, label: string, more: Partial<Extract<MenuEntry, { kind: "row" }>> = {}): MenuEntry => ({
  kind: "row",
  id,
  label,
  icon: null,
  enabled: true,
  checked: null,
  danger: false,
  shortcut: null,
  submenu: null,
  ...more,
});
export const MENU_SAMPLES: Array<{ label: string; entries: MenuEntry[] }> = [
  {
    label: "A chat",
    entries: [sampleRow("1", "Rename", { icon: "rename" }), { kind: "rule" }, sampleRow("2", "Delete…", { icon: "delete", danger: true })],
  },
  {
    label: "A page",
    entries: [
      sampleRow("1", "Back", { icon: "back", shortcut: "Ctrl ←" }),
      sampleRow("2", "Forward", { icon: "forward", shortcut: "Ctrl →", enabled: false }),
      sampleRow("3", "Reload", { icon: "reload", shortcut: "Ctrl R" }),
      { kind: "rule" },
      sampleRow("4", "Ask Berry About This", { icon: "berry" }),
      sampleRow("5", "Inspect", { icon: "inspect" }),
    ],
  },
  { label: "Berry", entries: [sampleRow("1", "Keep Berry Still", { checked: true }), sampleRow("2", "Hide Berry", { checked: false })] },
  { label: "Menu", entries: [sampleRow("1", "File", { submenu: [] }), sampleRow("2", "View", { submenu: [] })] },
];
export const ASK_SAMPLES: AskCard[] = [
  {
    id: "chat",
    question: "Delete “Hej”?",
    detail: "This chat will be permanently removed from this computer.",
    action: "Delete",
    mascot: null,
  },
  {
    id: "mascot",
    question: "Delete “Scout”?",
    detail: "It leaves your mascots, and what it remembers is forgotten.",
    action: "Delete",
    mascot: { name: "Scout", look: { palette: "lingon", accessory: "glasses" }, hidden: false },
  },
  {
    id: "notice",
    question: "Some saved data couldn’t be used",
    detail: "Your routines couldn’t be opened. The file wasn’t changed.",
    action: null,
    mascot: null,
  },
];
