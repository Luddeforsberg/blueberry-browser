import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Latest } from "@shared/lateWork";

// Latest wins in a component: the same `Latest` for as long as it's there, ended when it goes, so an answer that comes
// after it has gone, or after a newer request or an edit, is never applied. Call `next()` before asking, `end()` when what
// was asked about changes, and check the turn's `current` once the answer is here.
export const useLatest = (): Latest => {
  const [latest] = useState(() => new Latest());
  useEffect(() => () => latest.end(), [latest]);
  return latest;
};

// Something main keeps, read when the component comes, whenever `key` changes and on `readAgain`, and then each change
// main pushes. Main pushes every change, so a read answered after a push is no newer than it and is dropped, as is one
// overtaken by another read. The setter is for an action's own answer, which a read still out is no newer than either.
export const useFromMain = <T>(
  initial: T,
  read: () => Promise<T>,
  onUpdated?: (apply: (value: T) => void) => () => void,
  key?: unknown,
): [T, Dispatch<SetStateAction<T>>, () => void] => {
  const [value, setValue] = useState(initial);
  const reading = useLatest();
  // Read when called, so neither needs to be the same function on every render.
  const calls = useRef({ read, onUpdated });
  calls.current = { read, onUpdated };

  const readAgain = useCallback(() => {
    const turn = reading.next();
    calls.current.read().then(
      (answer) => turn.current && setValue(answer),
      (error: unknown) => console.error("Couldn't read from main:", error),
    );
  }, [reading]);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      reading.end();
      setValue(next);
    },
    [reading],
  );

  useEffect(() => readAgain(), [readAgain, key]);
  useEffect(() => calls.current.onUpdated?.(set), [set]);

  return [value, set, readAgain];
};
