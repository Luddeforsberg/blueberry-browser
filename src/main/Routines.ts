import { nextRun, parseDraft, scheduleLabel } from "./routineSchedule";
import type { TaskProgress, TaskResult } from "./Chats";
import type { RoutineStore, StoredRoutine } from "./RoutineStore";
import type { ChatApproval, ChatStep, MascotProfile, Routine, RoutineRun, RoutineStatus } from "../shared/library";
import type { ActionApproval } from "../shared/ipc";
import { mascotSnapshot, type CloudRoutineRow } from "./cloudJobs";
import { narrowSites } from "../shared/mascots";

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
  runTask: (id: string, message: string, onProgress: (progress: TaskProgress) => void, mascotId?: string | null, sites?: string[]) => Promise<TaskResult>;
  stop: (id: string) => void;
}

export interface RoutineEvents {
  onChanged: () => void;
  // Whether this routine may still be in the cloud, where it could run, and whether sending it there last failed.
  // Without these, nothing is ever there.
  stillInCloud?: (id: string) => boolean;
  cloudFailed?: (id: string) => boolean;
  // Only for what the user started and hasn't seen: a result, or a decision only they can make.
  onAttention: (routine: StoredRoutine, kind: "finished" | "failed" | "needs-approval") => void;
  closeTab: (tabId: string) => void;
}

interface ActiveRun {
  runId: string;
  steps: ChatStep[];
  approval: ChatApproval | null;
}

const prompt = (routine: StoredRoutine, now: number): string => routinePrompt(routine, `at ${new Date(now).toString()}`);

// What a run is told. A run in the cloud is written before it's due, so it says where rather than when.
export const routinePrompt = ({ name, instructions, sites }: Pick<StoredRoutine, "name" | "instructions" | "sites">, when: string): string =>
  `This is a routine the user set up earlier, running by itself ${when}. ` +
  "Nobody is watching right now, so don't ask questions in words: anything you need from the user goes through ask_user or hand_to_user, which wait for them. Do what it says in your own tabs, " +
  "then end with a short report of what you found and did, and anything you couldn't do.\n\n" +
  (sites.length > 0 ? `It may only use ${sites.join(", ")}, and anything else will be refused.\n\n` : "") +
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
      return run.approval?.question || run.approval?.handoff ? "Waiting for you" : "Waiting for your OK";
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
  // Run now, when every place was taken, each with whoever asked to hear which run it became.
  private readonly requested = new Map<string, ((runId: string) => void) | undefined>();
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

    this.requested.forEach((onStart, id) => {
      const routine = this.store.routine(id);
      if (!routine || this.active.has(id)) this.requested.delete(id);
      else if (this.hasFreePlace) {
        this.requested.delete(id);
        const runId = this.begin(routine, null);
        onStart?.(runId);
      }
    });

    this.store.due(now).forEach((routine) => {
      const next = nextRun(routine.schedule, now);
      // Still on the last one, perhaps waiting for an OK overnight. This time is skipped, not saved up. So is one that
      // was just moved back from the cloud while it may still be there, so the two never both run it.
      if (this.active.has(routine.id) || this.events.stillInCloud?.(routine.id)) {
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

  private begin(routine: StoredRoutine, lateFor: number | null): string {
    const now = Date.now();
    const runId = this.store.startRun(routine.id, now, lateFor);
    const run: ActiveRun = { runId, steps: [], approval: null };
    this.active.set(routine.id, run);
    this.events.onChanged();

    void this.runner
      .runTask(runId, prompt(routine, now), (progress) => this.onProgress(routine, run, progress), routine.mascotId, routine.sites)
      .then((result) => this.finish(routine.id, run, result));
    return runId;
  }

  private onProgress(routine: StoredRoutine, run: ActiveRun, { steps, approval, tokens, memoryIds }: TaskProgress): void {
    if (this.stopped) return;
    const asking = approval !== null && run.approval?.id !== approval.id;
    run.steps = steps;
    run.approval = approval;
    this.store.updateRun(run.runId, steps, approval, tokens || null, memoryIds);
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
      const { id, name, instructions, schedule, mascotId, sites, inCloud, paused, nextRunAt } = routine;
      return {
        id,
        name,
        instructions,
        scheduleSpec: schedule,
        mascotId,
        sites,
        inCloud,
        cloudNote: this.cloudNote(routine),
        schedule: scheduleLabel(schedule),
        paused,
        // One in the cloud is never moved on here, so its time is worked out from its schedule.
        nextRunAt: inCloud ? (paused ? null : nextRun(schedule, now)) : nextRunAt,
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
    if (!routine.inCloud && routine.nextRunAt !== null && routine.nextRunAt <= now) return "queued";
    return latest?.status ?? "idle";
  }

  // The routines that run in the cloud, as rows for it. Each bird's limits are narrowed by the routine's own sites. The
  // first time is only when this would run it next, which the server takes for a new or changed one.
  cloudRows(mascotOf: (id: string | null) => MascotProfile, { actionApproval, contextId, timeZone }: { actionApproval: ActionApproval; contextId: string | null; timeZone: string }): CloudRoutineRow[] {
    return this.store.routines().filter(({ inCloud }) => inCloud).map((routine) => {
      const mascot = mascotOf(routine.mascotId);
      return {
        key: routine.id,
        prompt: routinePrompt(routine, "in the cloud, maybe with the user's computer off"),
        mascot: mascotSnapshot({ ...mascot, sites: narrowSites(mascot.sites, routine.sites) }),
        actionApproval,
        contextId,
        schedule: routine.schedule,
        timeZone,
        paused: routine.paused,
        firstRunAt: this.cloudNext(routine, Date.now()),
      };
    });
  }

  private cloudNote({ id, inCloud }: StoredRoutine): string | null {
    if (!inCloud) return this.events.stillInCloud?.(id) ? "Moving back to this Mac…" : null;
    return this.events.cloudFailed?.(id) ? "Couldn’t reach the cloud, will retry" : null;
  }

  // The cloud's side changed: one may have come back here, or reached it.
  cloudChanged(): void {
    this.events.onChanged();
    this.tick();
  }

  // When one in the cloud is next due, as far as this can tell. The server has the real time.
  private cloudNext(routine: StoredRoutine, now: number): string | null {
    const next = routine.paused ? null : nextRun(routine.schedule, now);
    return next === null ? null : new Date(next).toISOString();
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

    // A changed time counts from now. Anything else leaves a time that's already set alone. One coming back from the
    // cloud counts from now too, since its time here was never moved on.
    const sameSchedule = JSON.stringify(existing?.schedule) === JSON.stringify(draft.schedule) && existing?.inCloud === (draft.inCloud === true);
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

  // False if it's running already, since a routine never runs twice at once. `onStart` hears the id of the run this
  // becomes, which may be later, once a place is free.
  runNow(id: string, onStart?: (runId: string) => void): boolean {
    if (!this.store.routine(id) || this.active.has(id)) return false;
    // Asked again while it waits: it's still one run, and everyone who asked hears which.
    const before = this.requested.get(id);
    this.requested.set(id, before && onStart ? (runId) => (before(runId), onStart(runId)) : (onStart ?? before));
    this.events.onChanged();
    this.tick();
    return true;
  }

  // Takes back a Run now that's still waiting for a place.
  cancelRequest(id: string): boolean {
    if (!this.requested.delete(id)) return false;
    this.events.onChanged();
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
