import type { App } from "electron";

const QUIT_WAIT_MS = 5_000;

// Holds the first Quit back until `work` is done, or for `limitMs` at most, and then quits. Another Quit meanwhile is
// held too, so the work is never cut short and the app quits once. Only once, so the quit it makes, and any after it, go
// straight through, and nothing that hangs can keep the app open.
export const holdQuit = (app: Pick<App, "on" | "quit">, work: () => Promise<unknown> | undefined, limitMs = QUIT_WAIT_MS): void => {
  let state: "open" | "holding" | "done" = "open";
  app.on("before-quit", (event) => {
    if (state === "done") return;
    event.preventDefault();
    if (state === "holding") return;
    state = "holding";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, limitMs)));
    const done = Promise.resolve()
      .then(work)
      .catch(() => {});
    void Promise.race([done, limit]).then(() => {
      clearTimeout(timer);
      state = "done";
      app.quit();
    });
  });
};
