import { useSyncExternalStore } from "react";

// Rows the user said Not now to, by key, for as long as the app is open. A suggestion is also dismissed in main and a
// finished chat marked seen, so those stay gone; a mascot's example comes back on the next launch.
const keys = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export const sayNotNow = (key: string): void => {
  keys.add(key);
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useNotNow = (): ReadonlySet<string> => {
  useSyncExternalStore(subscribe, () => version);
  return keys;
};
