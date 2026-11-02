import { nextRun, parseSchedule } from "../../src/main/routineSchedule";

// Routines that run with the Mac off. The owner's app keeps them in Supabase, and this starts a job for each one that's
// due, which the runner then takes like any other job, with the same checks on its bird. It only ever learns a routine's
// id, schedule, time zone and when it's due: the job is made from the rest in the database.

export interface DueRoutine {
  id: string;
  schedule: unknown;
  timeZone: string;
  // Exactly as the database said it, since that's what it checks this run against.
  dueAt: string;
}

export interface RoutineDb {
  dueRoutines(): Promise<DueRoutine[]>;
  // Says the job's id, or null for a run that was skipped or already started.
  startRoutine(routineId: string, dueAt: string, next: string | null): Promise<string | null>;
}

// A schedule is in the owner's local time, as the app keeps it, so 07:30 stays 07:30 across a clock change there.
const inTimeZone = <T>(timeZone: string, work: () => T): T => {
  const before = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return work();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};

const knownZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// The next time after now. A time missed while the runner was down runs once when it's back, and any others it missed
// are skipped rather than saved up, as in the app.
// Null for a routine that won't run again, or whose schedule or zone it can't read.
export const nextRunAfter = (routine: Pick<DueRoutine, "schedule" | "timeZone">, now: number): string | null => {
  const schedule = parseSchedule(routine.schedule);
  if (!schedule || !knownZone(routine.timeZone)) return null;
  const next = inTimeZone(routine.timeZone, () => nextRun(schedule, now));
  return next === null ? null : new Date(next).toISOString();
};

// Starts a job for every routine that's due. Says the ids of the jobs it made.
export const startDueRoutines = async (db: RoutineDb, now = Date.now()): Promise<string[]> => {
  const started: string[] = [];
  for (const routine of await db.dueRoutines()) {
    const job = await db.startRoutine(routine.id, routine.dueAt, nextRunAfter(routine, now));
    if (job) started.push(job);
  }
  return started;
};
