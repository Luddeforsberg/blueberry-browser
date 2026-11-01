import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type {
  ChatApproval,
  ChatStep,
  RoutineDraft,
  RoutineRun,
  RoutineRunStatus,
  RoutineSchedule,
} from "../shared/library";

export interface StoredRoutine {
  id: string;
  name: string;
  instructions: string;
  schedule: RoutineSchedule;
  // Null is Berry.
  mascotId: string | null;
  // The only sites a run may use. Empty adds no limit.
  sites: string[];
  paused: boolean;
  // When it's next due. Null when paused, or for a one-off that's been used.
  nextRunAt: number | null;
}

interface RoutineRow extends Omit<StoredRoutine, "schedule" | "paused" | "sites"> {
  schedule: string;
  sites: string;
  paused: number;
}

interface RunRow extends Omit<RoutineRun, "steps" | "approval" | "seen"> {
  steps: string;
  approval: string | null;
  seen: number;
}

const RUNS_KEPT_PER_ROUTINE = 50;

// Each step takes the database to the next `user_version`. Add new steps at the end.
const MIGRATIONS = [
  `CREATE TABLE routines (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     instructions TEXT NOT NULL,
     schedule TEXT NOT NULL,
     paused INTEGER NOT NULL DEFAULT 0,
     next_run_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE runs (
     id TEXT PRIMARY KEY,
     routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     late_for INTEGER,
     steps TEXT NOT NULL DEFAULT '[]',
     result TEXT,
     error TEXT,
     approval TEXT,
     tokens INTEGER,
     seen INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX runs_by_routine ON runs(routine_id, started_at);`,
  `ALTER TABLE routines ADD COLUMN mascot_id TEXT;`,
  `ALTER TABLE routines ADD COLUMN sites TEXT NOT NULL DEFAULT '[]';`,
];

const ROUTINE_COLUMNS = "id, name, instructions, schedule, mascot_id AS mascotId, sites, paused, next_run_at AS nextRunAt";
const RUN_COLUMNS =
  "id, routine_id AS routineId, status, started_at AS startedAt, ended_at AS endedAt, late_for AS lateFor, steps, result, error, approval, tokens, seen";

const toRoutine = ({ schedule, sites, paused, ...row }: RoutineRow): StoredRoutine => ({
  ...row,
  schedule: JSON.parse(schedule),
  sites: JSON.parse(sites),
  paused: paused === 1,
});

const toRun = ({ steps, approval, seen, ...row }: RunRow): RoutineRun => ({
  ...row,
  steps: JSON.parse(steps),
  approval: approval ? JSON.parse(approval) : null,
  seen: seen === 1,
});

// Saved routines and their runs, in a SQLite file of their own in the user data folder.
export class RoutineStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const { user_version: version } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    MIGRATIONS.slice(version).forEach((step, index) => {
      this.db.exec(`BEGIN; ${step} PRAGMA user_version = ${version + index + 1}; COMMIT;`);
    });
  }

  routines(): StoredRoutine[] {
    const rows = this.db.prepare(`SELECT ${ROUTINE_COLUMNS} FROM routines ORDER BY created_at, rowid`).all();
    return (rows as unknown as RoutineRow[]).map(toRoutine);
  }

  routine(id: string): StoredRoutine | null {
    const row = this.db.prepare(`SELECT ${ROUTINE_COLUMNS} FROM routines WHERE id = ?`).get(id);
    return row ? toRoutine(row as unknown as RoutineRow) : null;
  }

  // Oldest first, so whatever has waited longest gets the next free place.
  due(now: number): StoredRoutine[] {
    const rows = this.db
      .prepare(`SELECT ${ROUTINE_COLUMNS} FROM routines WHERE paused = 0 AND next_run_at <= ? ORDER BY next_run_at, rowid`)
      .all(now);
    return (rows as unknown as RoutineRow[]).map(toRoutine);
  }

  soonest(): number | null {
    const row = this.db.prepare("SELECT MIN(next_run_at) AS at FROM routines WHERE paused = 0").get() as { at: number | null };
    return row.at;
  }

  create({ name, instructions, schedule, mascotId = null, sites = [] }: RoutineDraft, nextRunAt: number | null): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO routines (id, name, instructions, schedule, mascot_id, sites, next_run_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, instructions, JSON.stringify(schedule), mascotId, JSON.stringify(sites), nextRunAt, Date.now());
    return id;
  }

  update(id: string, { name, instructions, schedule, mascotId = null, sites = [] }: RoutineDraft, nextRunAt: number | null): boolean {
    const { changes } = this.db
      .prepare("UPDATE routines SET name = ?, instructions = ?, schedule = ?, mascot_id = ?, sites = ?, next_run_at = ? WHERE id = ?")
      .run(name, instructions, JSON.stringify(schedule), mascotId, JSON.stringify(sites), nextRunAt, id);
    return changes > 0;
  }

  setPaused(id: string, paused: boolean, nextRunAt: number | null): boolean {
    const { changes } = this.db
      .prepare("UPDATE routines SET paused = ?, next_run_at = ? WHERE id = ?")
      .run(paused ? 1 : 0, nextRunAt, id);
    return changes > 0;
  }

  setNextRun(id: string, nextRunAt: number | null): void {
    this.db.prepare("UPDATE routines SET next_run_at = ? WHERE id = ?").run(nextRunAt, id);
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM routines WHERE id = ?").run(id).changes > 0;
  }

  startRun(routineId: string, startedAt: number, lateFor: number | null): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO runs (id, routine_id, status, started_at, late_for) VALUES (?, ?, 'running', ?, ?)")
      .run(id, routineId, startedAt, lateFor);
    this.db
      .prepare(
        `DELETE FROM runs WHERE routine_id = ? AND id NOT IN
           (SELECT id FROM runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?)`
      )
      .run(routineId, routineId, RUNS_KEPT_PER_ROUTINE);
    return id;
  }

  updateRun(id: string, steps: ChatStep[], approval: ChatApproval | null, tokens: number | null): void {
    this.db
      .prepare("UPDATE runs SET status = ?, steps = ?, approval = ?, tokens = ? WHERE id = ?")
      .run(approval ? "needs-approval" : "running", JSON.stringify(steps), approval && JSON.stringify(approval), tokens, id);
  }

  finishRun(
    id: string,
    endedAt: number,
    {
      status,
      steps,
      result,
      error,
      tokens,
      seen,
    }: {
      status: RoutineRunStatus;
      steps: ChatStep[];
      result: string | null;
      error: string | null;
      tokens: number | null;
      seen: boolean;
    }
  ): void {
    this.db
      .prepare(
        "UPDATE runs SET status = ?, ended_at = ?, steps = ?, result = ?, error = ?, tokens = ?, approval = NULL, seen = ? WHERE id = ?"
      )
      .run(status, endedAt, JSON.stringify(steps), result, error, tokens, seen ? 1 : 0, id);
  }

  // Whatever was still going when the app stopped, even if it never got to say so. The approval stays on the row,
  // so the run can say what it was waiting to do and didn't.
  interruptUnfinished(now: number): void {
    const open = this.db.prepare("SELECT id, steps FROM runs WHERE status IN ('running', 'needs-approval')").all() as unknown as Array<{
      id: string;
      steps: string;
    }>;
    open.forEach(({ id, steps }) => {
      const finished = (JSON.parse(steps) as ChatStep[]).map((step) => ({ ...step, done: true }));
      this.db
        .prepare("UPDATE runs SET status = 'interrupted', ended_at = ?, steps = ?, seen = 0 WHERE id = ?")
        .run(now, JSON.stringify(finished), id);
    });
  }

  latestRun(routineId: string): RoutineRun | null {
    const row = this.db
      .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`)
      .get(routineId);
    return row ? toRun(row as unknown as RunRow) : null;
  }

  runs(routineId: string): RoutineRun[] {
    const rows = this.db
      .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC`)
      .all(routineId);
    return (rows as unknown as RunRow[]).map(toRun);
  }

  hasUnseen(routineId: string): boolean {
    return (
      this.db
        .prepare("SELECT 1 FROM runs WHERE routine_id = ? AND seen = 0 AND status NOT IN ('running', 'needs-approval')")
        .get(routineId) !== undefined
    );
  }

  markSeen(): void {
    this.db.prepare("UPDATE runs SET seen = 1 WHERE seen = 0 AND status NOT IN ('running', 'needs-approval')").run();
  }
}
