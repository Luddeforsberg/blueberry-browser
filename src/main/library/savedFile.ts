import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname } from "path";
import { entriesOf, fieldsOf } from "../../shared/fields";

// Every file a store keeps is written, moved and removed here, and nowhere else (eslint.fences.mjs).
//
// A write goes beside the file and is renamed over it, so a crash or a full disk never leaves half a file: the file is
// either what it was or what was written. `saveFile` and `removeFile` never throw. They say whether it happened, and lint
// refuses a call that drops the answer, so nothing can say it was saved unless it was. A failed write leaves the file as
// it was, so a store that keeps what it saved last knows exactly what the next launch will read.

declare const saved: unique symbol;
// Whether a write or a removal happened. A boolean, marked so that eslint.saved.mjs can refuse any call that returns
// one and drops it, here or in a store passing it on.
export type Saved = boolean & { readonly [saved]: true };
const outcome = (happened: boolean) => happened as Saved;
// For a change that leaves the file as it is: what was asked is already what's saved.
export const NOTHING_TO_SAVE = outcome(true);

export const saveFile = (file: string, contents: string | Uint8Array, { secret = false } = {}): Saved => {
  const temp = `${file}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, contents, secret ? { mode: 0o600 } : {});
    renameSync(temp, file);
    return outcome(true);
  } catch (error) {
    console.error(`Couldn't save ${basename(file)}:`, error);
    try {
      rmSync(temp, { force: true });
    } catch {
      // The next write replaces it.
    }
    return outcome(false);
  }
};

// True once the file isn't there, including when it never was.
export const removeFile = (file: string): Saved => {
  try {
    rmSync(file, { force: true });
    return outcome(true);
  } catch (error) {
    console.error(`Couldn't remove ${basename(file)}:`, error);
    return outcome(false);
  }
};

// Where a damaged file went. Null means it's where it was. `split` means moving it stopped partway and couldn't be
// undone, so some of its parts are at `movedTo` and the rest are still where they were.
export type MovedAside = { movedTo: null } | { movedTo: string; split: boolean };

// Moves a file and the parts beside it (`file` plus each suffix), in the order given, to a new name, never deleting
// any. If one won't move, the ones before it are put back.
export const moveAside = (file: string, suffixes: string[] = [""]): MovedAside => {
  const movedTo = `${file}.corrupt-${Date.now()}`;
  const moved: string[] = [];
  try {
    for (const suffix of suffixes) {
      if (!existsSync(file + suffix)) continue;
      renameSync(file + suffix, movedTo + suffix);
      moved.push(suffix);
    }
    return moved.length > 0 ? { movedTo, split: false } : { movedTo: null };
  } catch (error) {
    console.error(`Couldn't move ${basename(file)} aside:`, error);
    const stuck = moved.reverse().filter((suffix) => {
      try {
        renameSync(movedTo + suffix, file + suffix);
        return false;
      } catch {
        return true;
      }
    });
    return stuck.length > 0 ? { movedTo, split: true } : { movedTo: null };
  }
};

// The file's text, or undefined when there's none to read.
export const readTextFile = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (fieldsOf(error).code !== "ENOENT") console.error(`Couldn't read ${basename(file)}:`, error);
    return undefined;
  }
};

// What was saved, still to be checked, or undefined when there's nothing to read. A file that's there but isn't JSON is
// moved aside, never deleted, so the next save can't write over what may be the user's only copy.
export const readJsonFile = (file: string): unknown => {
  const text = readTextFile(file);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    const { movedTo } = moveAside(file);
    console.error(`${basename(file)} isn't readable, so it starts empty.${movedTo ? ` The old file is at ${movedTo}.` : ""}`);
    return undefined;
  }
};

// A saved list, each entry checked by `parse`. One that doesn't check out is left out, and the log says how many.
export const savedEntries = <T>(file: string, value: unknown, parse: (entry: unknown) => T | null): T[] => {
  const { entries, dropped } = entriesOf(value, parse);
  if (dropped > 0)
    console.error(`Left out ${dropped} saved ${dropped === 1 ? "entry" : "entries"} of ${basename(file)} that couldn't be read.`);
  return entries;
};
