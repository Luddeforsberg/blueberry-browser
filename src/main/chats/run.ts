import type { WorkOutcome } from "../../shared/library";
import type { EndedRun, Run } from "./chatTypes";

// A reply's life, a chat's or a task's: made here when it starts, and summed up here when it's over, so nothing live
// outlasts it.

export const newRun = (
  given: Pick<Run, "mascot" | "earlierSites" | "cloud" | "userPresent"> & Partial<Pick<Run, "askAtLeast" | "onEnd" | "onChange">>,
): Run => ({
  controller: new AbortController(),
  partial: "",
  statusLine: null,
  steps: [],
  said: [],
  breakBeforeText: false,
  approval: null,
  tabs: new Set(),
  used: new Set(),
  sites: new Set(),
  startedAt: Date.now(),
  withPage: false,
  memoryIds: [],
  memoryNote: "",
  answers: [],
  handedOver: false,
  ...given,
});

export const endedRun = (run: Run, outcome: WorkOutcome): EndedRun => ({
  mascot: { id: run.mascot.id, sites: [...run.mascot.sites] },
  startedAt: run.startedAt,
  endedAt: Date.now(),
  outcome,
  withPage: run.withPage,
  cloud: !!run.cloud,
  tabIds: [...(run.cloud ? (run.usedInCloud ?? []) : run.used)].map((tab) => tab.id),
  sites: [...run.sites],
  beenTo: [...new Set([...run.earlierSites, ...run.sites])],
});
