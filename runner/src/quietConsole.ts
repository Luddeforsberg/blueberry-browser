// The runner shares the app's code, which logs errors whole, and on the runner an error from a model provider, Playwright
// or a page can carry request data or page text. So only a log line's first words get through, when they're words, and
// every error object and value after them is dropped. The runner's own lines are single strings: job ids and outcomes.
type Write = (...args: unknown[]) => void;

export const quietly = (write: Write): Write => (first?: unknown) => {
  if (typeof first === "string") write(first);
};

export const quietConsole = (target: Pick<Console, "log" | "info" | "warn" | "error" | "debug"> = console): void => {
  for (const level of ["log", "info", "warn", "error", "debug"] as const) target[level] = quietly(target[level].bind(target));
};
