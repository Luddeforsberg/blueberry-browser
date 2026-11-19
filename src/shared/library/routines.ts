// A routine, its schedule and its runs. Part of library.ts, which everything imports it from.

import type { ChatApproval, ChatStep } from "./chats";

export type RoutineSchedule =
  | { kind: "once"; at: number }
  | { kind: "daily"; time: string }
  // Days count from Sunday, as 0.
  | { kind: "weekly"; days: number[]; time: string }
  // A day the month doesn't have means its last day.
  | { kind: "monthly"; day: number; time: string }
  // Only ever by Run now. What a routine learnt from being shown starts here, so it does nothing until it's asked.
  | { kind: "manual" };

export interface RoutineDraft {
  name: string;
  instructions: string;
  schedule: RoutineSchedule;
  // Who runs it. Left out or null is Berry.
  mascotId?: string | null;
  // The only sites a run may use, on top of its mascot's limits. Left out or empty adds no limit.
  sites?: string[];
  // It runs on the cloud runner on its schedule, even with the Mac off, and never here on a schedule.
  inCloud?: boolean;
}

// How one run went, or is going.
export type RoutineRunStatus = "running" | "needs-approval" | "finished" | "failed" | "stopped" | "interrupted";

export type RoutineStatus = RoutineRunStatus | "queued" | "paused" | "idle";

export interface RoutineRun {
  id: string;
  routineId: string;
  status: RoutineRunStatus;
  startedAt: number;
  endedAt: number | null;
  // When it should have run, if the app was closed or the computer asleep at that time.
  lateFor: number | null;
  steps: ChatStep[];
  // Berry's report, or as much of it as it got to write.
  result: string | null;
  error: string | null;
  // While it's interrupted, this is what it was waiting to do and didn't.
  approval: ChatApproval | null;
  tokens: number | null;
  // False until the user has opened Routines since it ended.
  seen: boolean;
  // What its mascot remembered going into this run, by id.
  memoryIds?: string[];
  // While it runs, what it said it's doing, until its answer starts. Only on the Routines page, and never saved.
  statusLine?: string;
}

export interface Routine {
  id: string;
  name: string;
  instructions: string;
  scheduleSpec: RoutineSchedule;
  mascotId: string | null;
  sites: string[];
  inCloud: boolean;
  // How keeping it in the cloud is going, in words, when it isn't simply there: still on its way back to this Mac, or
  // not sent yet. Null otherwise.
  cloudNote?: string | null;
  // The schedule in words.
  schedule: string;
  paused: boolean;
  nextRunAt: number | null;
  lastResult: string;
  status: RoutineStatus;
  latestRun: RoutineRun | null;
  // Some run has ended since the user last opened Routines, not necessarily the latest.
  unseen: boolean;
}
