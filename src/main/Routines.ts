import { nextRun, parseDraft, scheduleLabel } from "./routineSchedule";
import type { TaskProgress, TaskResult } from "./Chats";
import type { RoutineStore, StoredRoutine } from "./RoutineStore";
import type { ChatApproval, ChatStep, Routine, RoutineRun, RoutineStatus } from "../shared/library";

// Runs that may start while this many are working. A run waiting for the user's OK uses nothing, so it doesn't count,
// and once allowed it goes straight on even past this, because the user is waiting on it.
export const MAX_ACTIVE_RUNS = 2;
// Past this, a scheduled run says it was late. It covers the timer, not a closed or sleeping computer.
export const LATE_AFTER_MS = 2 * 60_000;
// The timer looks at least this often, so a changed clock or a computer waking up is noticed soon.
const MAX_WAIT_MS = 60_000;
// Starting a run loads LangChain, which opening the browser should never wait for.
const START_DELAY_MS = 5_000;

const MAX_RESULT_PREVIEW = 80;

export interface RoutineRunner {
  runTask: (id: string, message: string, onProgress: (progress: TaskProgress) => void, mascotId?: string | null) => Promise<TaskResult>;
  stop: (id: string) => void;
}

export interface RoutineEvents {
  onChanged: () => void;
  // Only for what the user started and hasn't seen: a result, or a decision only they can make.
  onAttention: (routine: StoredRoutine, kind: "finished" | "failed" | "needs-approval") => void;
  closeTab: (tabId: string) => void;
}

interface ActiveRun {
  runId: string;
  steps: ChatStep[];
  approval: ChatApproval | null;
}

const prompt = ({ name, instructions }: StoredRoutine, now: number): string =>
  `This is a routine the user set up earlier, running by itself at ${new Date(now).toString()}. ` +
  "Nobody is watching, so don't ask questions in words. Do what it says in your own tabs, " +
  "then end with a short report of what you found and did, and anything you couldn't do.\n\n" +
  `The routine, called “${name}”:\n${instructions}`;

const dayOf = (at: number, now: number): string => {
  const date = new Date(at);
  const days = Math.round(
    (new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const firstLine = (text: string): string => {
  const line = text.split("\n").find((part) => part.trim()) ?? "";
  const plain = line.replace(/[*_#`>]/g, "").trim();
  return plain.length > MAX_RESULT_PREVIEW ? `${plain.slice(0, MAX_RESULT_PREVIEW - 1).trimEnd()}…` : plain;
};

const lastResult = (run: RoutineRun | null, now: number): string => {
  if (!run) return "Not run yet";
  const day = dayOf(run.startedAt, now);
  switch (run.status) {
    case "running":
      return "Working on it";
    case "needs-approval":
      return "Waiting for your OK";
    case "finished":
      return `${day}: ${run.result ? firstLine(run.result) : "nothing to report"}`;
    case "failed":
      return `${day}: couldn’t finish`;
    case "stopped":
      return `${day}: you stopped it`;
    case "interrupted":
      return `${day}: the app closed before it finished`;
  }
};

// Keeps routines' times, and runs them through the same agent as a chat with no page. A run is saved at every step,
// so even a crash leaves a record of how far it got.
export class Routines {
  private readonly active = new Map<string, ActiveRun>();
  // Run now, when every place was taken.
  private readonly requested = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly store: RoutineStore,
    private readonly runner: RoutineRunner,
    private readonly events: RoutineEvents
  ) {}

  start(): void {
    this.store.interruptUnfinished(Date.now());
    this.timer = setTimeout(() => this.tick(), START_DELAY_MS);
  }

  // The app or window is closing. Every open run is marked before it's stopped, so a paused action can't go ahead
  // and isn't lost: the next launch shows it, with Run again.
  shutdown(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.store.interruptUnfinished(Date.now());
    this.active.forEach(({ runId }) => this.runner.stop(runId));
    this.active.clear();
    this.requested.clear();
  }

  private get hasFreePlace(): boolean {
    return [...this.active.values()].filter((run) => !run.approval).length < MAX_ACTIVE_RUNS;
  }

  private tick(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();

    this.requested.forEach((id) => {
      const routine = this.store.routine(id);
      if (!routine || this.active.has(id)) this.requested.delete(id);
      else if (this.hasFreePlace) {
        this.requested.delete(id);
        this.begin(routine, null);
      }
    });

    this.store.due(now).forEach((routine) => {
      const next = nextRun(routine.schedule, now);
      // Still on the last one, perhaps waiting for an OK overnight. This time is skipped, not saved up.
      if (this.active.has(routine.id)) {
        this.store.setNextRun(routine.id, next);
        this.events.onChanged();
      } else if (this.hasFreePlace) {
        const dueAt = routine.nextRunAt as number;
        this.store.setNextRun(routine.id, next);
        // However many times were missed, this one run covers them all.
        this.begin(routine, now - dueAt > LATE_AFTER_MS ? dueAt : null);
      }
    });

    const soonest = this.store.soonest();
    // Anything already due is waiting for a place, and the run that frees one looks again.
    const wait = soonest === null || soonest <= now ? MAX_WAIT_MS : Math.min(MAX_WAIT_MS, soonest - now);
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private begin(routine: StoredRoutine, lateFor: number | null): void {
    const now = Date.now();
    const runId = this.store.startRun(routine.id, now, lateFor);
    const run: ActiveRun = { runId, steps: [], approval: null };
    this.active.set(routine.id, run);
    this.events.onChanged();

    void this.runner
      .runTask(runId, prompt(routine, now), (progress) => this.onProgress(routine, run, progress), routine.mascotId)
      .then((result) => this.finish(routine.id, run, result));
  }

  private onProgress(routine: StoredRoutine, run: ActiveRun, { steps, approval, tokens }: TaskProgress): void {
    if (this.stopped) return;
    const asking = approval !== null && run.approval?.id !== approval.id;
    run.steps = steps;
    run.approval = approval;
    this.store.updateRun(run.runId, steps, approval, tokens || null);
    if (asking && this.store.routine(routine.id)) this.events.onAttention(routine, "needs-approval");
    this.events.onChanged();
    // A place may have come free, or been taken back, now this run is waiting or going again.
    if (approval) this.tick();
  }

  private finish(routineId: string, run: ActiveRun, result: TaskResult): void {
    if (this.stopped) return;
    this.active.delete(routineId);
    result.tabIds.forEach((id) => this.events.closeTab(id));

    const status = result.stopped ? "stopped" : result.error ? "failed" : "finished";
    this.store.finishRun(run.runId, Date.now(), {
      status,
      steps: result.steps,
      result: result.text || null,
      error: result.error,
      tokens: result.tokens || null,
      seen: result.stopped,
    });
    const routine = this.store.routine(routineId);
    if (routine && status !== "stopped") this.events.onAttention(routine, status);
    this.events.onChanged();
    this.tick();
  }

  list(): Routine[] {
    const now = Date.now();
    return this.store.routines().map((routine) => {
      const latestRun = this.store.latestRun(routine.id);
      const { id, name, instructions, schedule, mascotId, paused, nextRunAt } = routine;
      return {
        id,
        name,
        instructions,
        scheduleSpec: schedule,
        mascotId,
        schedule: scheduleLabel(schedule),
        paused,
        nextRunAt,
        status: this.statusOf(routine, latestRun, now),
        lastResult: lastResult(latestRun, now),
        latestRun,
        unseen: this.store.hasUnseen(id),
      };
    });
  }

  private statusOf(routine: StoredRoutine, latest: RoutineRun | null, now: number): RoutineStatus {
    if (this.active.has(routine.id) && latest) return latest.status;
    if (this.requested.has(routine.id)) return "queued";
    if (routine.paused) return "paused";
    if (routine.nextRunAt !== null && routine.nextRunAt <= now) return "queued";
    return latest?.status ?? "idle";
  }

  runs(routineId: string): RoutineRun[] {
    return this.store.runs(routineId);
  }

  save(id: string | null, input: unknown): { ok: true; id: string } | { ok: false; error: string } {
    const parsed = parseDraft(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const { draft } = parsed;
    const now = Date.now();
    const existing = id ? this.store.routine(id) : null;
    if (id && !existing) return { ok: false, error: "This routine no longer exists." };

    // A changed time counts from now. Anything else leaves a time that's already set alone.
    const sameSchedule = JSON.stringify(existing?.schedule) === JSON.stringify(draft.schedule);
    const next = nextRun(draft.schedule, now);
    if (draft.schedule.kind === "once" && next === null && !sameSchedule) {
      return { ok: false, error: "Choose a time that hasn’t passed." };
    }

    let savedId: string;
    if (existing) {
      const nextRunAt = existing.paused ? null : sameSchedule ? existing.nextRunAt : next;
      this.store.update(existing.id, draft, nextRunAt);
      savedId = existing.id;
    } else {
      savedId = this.store.create(draft, next);
    }
    this.events.onChanged();
    this.tick();
    return { ok: true, id: savedId };
  }

  // Times missed while paused stay missed: resuming counts from now.
  setPaused(id: string, paused: boolean): boolean {
    const routine = this.store.routine(id);
    if (!routine) return false;
    const next = paused === true ? null : nextRun(routine.schedule, Date.now());
    this.store.setPaused(id, paused === true, next);
    this.events.onChanged();
    this.tick();
    return true;
  }

  delete(id: string): boolean {
    const run = this.active.get(id);
    if (run) this.runner.stop(run.runId);
    this.requested.delete(id);
    if (!this.store.delete(id)) return false;
    this.events.onChanged();
    return true;
  }

  // False if it's running already, since a routine never runs twice at once.
  runNow(id: string): boolean {
    if (!this.store.routine(id) || this.active.has(id)) return false;
    this.requested.add(id);
    this.events.onChanged();
    this.tick();
    return true;
  }

  stop(runId: string): boolean {
    if (![...this.active.values()].some((run) => run.runId === runId)) return false;
    this.runner.stop(runId);
    return true;
  }

  markSeen(): void {
    this.store.markSeen();
    this.events.onChanged();
  }
}
