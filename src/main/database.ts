import { existsSync, renameSync } from "fs";
import { DatabaseSync } from "node:sqlite";

// Each step takes the database to the next `user_version`. Add new steps at the end.
export const migrate = (db: DatabaseSync, steps: string[]): void => {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  steps.slice(version).forEach((step, index) => {
    db.exec(`BEGIN; ${step} PRAGMA user_version = ${version + index + 1}; COMMIT;`);
  });
};

// SQLITE_CORRUPT and SQLITE_NOTADB. A busy, locked or read-only file is fine and only needs leaving alone.
const CORRUPT_CODES = [11, 26];
const LOWEST_BYTE = 0xff;

class DamagedFile extends Error {}

const isDamage = (error: unknown): boolean =>
  error instanceof DamagedFile ||
  CORRUPT_CODES.includes(((error as { errcode?: number }).errcode ?? 0) & LOWEST_BYTE);

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

// The write-ahead log goes first: a log left beside a new, empty database could be replayed into it.
const moveAside = (file: string): string => {
  const movedTo = `${file}.corrupt-${Date.now()}`;
  ["-wal", "-shm", ""].forEach((suffix) => {
    if (existsSync(file + suffix)) renameSync(file + suffix, movedTo + suffix);
  });
  return movedTo;
};

// `movedTo` is where a damaged file went. Null means the file is untouched, but couldn't be used this time.
export interface StoreProblem {
  movedTo: string | null;
}

// A database must never stop the app from starting. Only real damage moves the file, and it's never deleted. `open` is
// told `recovered` when what it opens isn't what was saved: a new file in place of a damaged one, or memory.
export const openStore = <T>(file: string, open: (file: string, recovered: boolean) => T, onProblem: (problem: StoreProblem) => void): T => {
  try {
    if (existsSync(file)) checkFile(file);
    return open(file, false);
  } catch (error) {
    console.error(`Failed to open ${file}:`, error);
    if (isDamage(error)) {
      try {
        const movedTo = moveAside(file);
        const store = open(file, true);
        onProblem({ movedTo });
        return store;
      } catch (moveError) {
        console.error(`Failed to replace ${file}:`, moveError);
      }
    }
    onProblem({ movedTo: null });
    return open(":memory:", true);
  }
};
