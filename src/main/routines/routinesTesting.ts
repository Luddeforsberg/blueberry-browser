import { afterEach, beforeEach, vi } from "vitest";
import { Routines, type RoutineEvents } from "./Routines";
import { RoutineStore } from "./RoutineStore";
import type { TaskProgress, TaskResult } from "../chats/Chats";

// What the tests of `Routines` share: a store and a runner made up for them, and a clock they move by hand.

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const NOW = new Date(2026, 10, 2, 12, 0).getTime();

interface FakeRun {
  id: string;
  message: string;
  progress: (progress: TaskProgress) => void;
  end: (result?: Partial<TaskResult>) => void;
}

export const setup = (
  store = new RoutineStore(":memory:"),
  cloud: Pick<RoutineEvents, "stillInCloud" | "cloudFailed" | "writeName"> = {},
) => {
  const started: FakeRun[] = [];
  const stoppedIds: string[] = [];
  const runner = {
    runTask: (id: string, message: string, progress: (progress: TaskProgress) => void) =>
      new Promise<TaskResult>((resolve) => {
        started.push({
          id,
          message,
          progress,
          end: (result = {}) => resolve({ text: "done", steps: [], error: null, stopped: false, tokens: 10, tabIds: [], ...result }),
        });
      }),
    stop: (id: string) => {
      stoppedIds.push(id);
    },
  };
  const events = {
    onChanged: vi.fn(),
    onAttention: vi.fn(),
    closeTab: vi.fn(),
    ...cloud,
  } satisfies RoutineEvents;
  const routines = new Routines(store, runner, events);
  return { store, routines, started, stoppedIds, events };
};

export const daily = (time = "13:00", name = "Watch") => ({ name, instructions: "Look", schedule: { kind: "daily" as const, time } });

export const save = (routines: Routines, draft: unknown, id: string | null = null): string => {
  const result = routines.save(id, draft);
  if (!result.ok) throw new Error(result.error);
  return result.id;
};

export const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

// As a computer waking from sleep sees it: the clock has moved, and the timers then run.
export const jump = async (ms: number) => {
  vi.setSystemTime(Date.now() + ms);
  await vi.advanceTimersByTimeAsync(MINUTE);
};

let open: Routines[] = [];
export const started = (routines: Routines) => {
  open.push(routines);
  routines.start();
  return routines;
};

// Every test runs on a fake clock, and every Routines it started is shut down after it.
export const runOnFakeClock = () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    open = [];
  });

  afterEach(() => {
    open.forEach((routines) => routines.shutdown());
    vi.useRealTimers();
  });
};
