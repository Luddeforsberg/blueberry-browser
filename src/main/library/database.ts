import { existsSync } from "fs";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { moveAside } from "./savedFile";

// Each step takes the database to the next `user_version`. Add new steps at the end.
export const migrate = (db: DatabaseSync, steps: string[]): void => {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  steps.slice(version).forEach((step, index) => {
    db.exec(`BEGIN; ${step} PRAGMA user_version = ${version + index + 1}; COMMIT;`);
  });
};

// node:sqlite gives each row as a record of whatever its columns held, and a statement's own SQL says which those are.
// So a store names the shape of its rows here rather than casting each by hand.
export const rowOf = <Row>(statement: StatementSync, ...params: SQLInputValue[]): Row | undefined =>
  statement.get(...params) as Row | undefined;

export const rowsOf = <Row>(statement: StatementSync, ...params: SQLInputValue[]): Row[] => statement.all(...params) as Row[];

// All of `work` reaches the file, or none of it does.
export const inTransaction = <T>(db: DatabaseSync, work: () => T): T => {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

// SQLITE_CORRUPT and SQLITE_NOTADB. A busy, locked or read-only file is fine and only needs leaving alone.
const CORRUPT_CODES = [11, 26];
const LOWEST_BYTE = 0xff;

class DamagedFile extends Error {}

const isDamage = (error: unknown): boolean =>
  error instanceof DamagedFile || CORRUPT_CODES.includes(((error as { errcode?: number }).errcode ?? 0) & LOWEST_BYTE);

// Opening a damaged file often works, and only reading the damaged part fails, so this reads it all once.
// Read-only, because closing a writable connection can delete the write-ahead log that's beside the file.
const checkFile = (file: string): void => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const { quick_check: result } = db.prepare("PRAGMA quick_check(1)").get() as { quick_check: string };
    if (result !== "ok") throw new DamagedFile(result);
  } finally {
    db.close();
  }
};

// What went wrong opening a store, for the notice. `untouched`: the file is as it was, but couldn't be used this time.
// `moved`: it was damaged and is at `movedTo` now, and `replaced` says whether a new file took its place or this launch
// runs from memory. `split`: moving it stopped partway and couldn't be undone, so its parts are in two places, and this
// launch runs from memory.
export type StoreProblem =
  | { kind: "untouched" }
  | { kind: "moved"; movedTo: string; replaced: boolean }
  | { kind: "split"; movedTo: string };

// A database must never stop the app from starting. Only real damage moves the file, and it's never deleted. `open` is
// told `recovered` when what it opens isn't what was saved: a new file in place of a damaged one, or memory.
export const openStore = <T>(
  file: string,
  open: (file: string, recovered: boolean) => T,
  onProblem: (problem: StoreProblem) => void,
): T => {
  const inMemory = (problem: StoreProblem): T => {
    onProblem(problem);
    return open(":memory:", true);
  };
  try {
    if (existsSync(file)) checkFile(file);
    return open(file, false);
  } catch (error) {
    console.error(`Failed to open ${file}:`, error);
    if (!isDamage(error)) return inMemory({ kind: "untouched" });
    // The write-ahead log goes first: a log left beside a new, empty database could be replayed into it.
    const moved = moveAside(file, ["-wal", "-shm", ""]);
    if (moved.movedTo === null) return inMemory({ kind: "untouched" });
    if (moved.split) return inMemory({ kind: "split", movedTo: moved.movedTo });
    try {
      const store = open(file, true);
      onProblem({ kind: "moved", movedTo: moved.movedTo, replaced: true });
      return store;
    } catch (replaceError) {
      console.error(`Failed to replace ${file}:`, replaceError);
      return inMemory({ kind: "moved", movedTo: moved.movedTo, replaced: false });
    }
  }
};
