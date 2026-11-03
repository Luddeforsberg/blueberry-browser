import type { App } from "electron";

const QUIT_WAIT_MS = 5_000;

// Holds the first Quit back until `work` is done, or for `limitMs` at most, and then quits. Only once, so the quit it
// makes, and any after it, go straight through, and nothing that hangs can keep the app open.
export const holdQuit = (app: Pick<App, "on" | "quit">, work: () => Promise<unknown> | undefined, limitMs = QUIT_WAIT_MS): void => {
  let held = false;
  app.on("before-quit", (event) => {
    if (held) return;
    held = true;
    event.preventDefault();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, limitMs)));
    const done = Promise.resolve()
      .then(work)
      .catch(() => {});
    void Promise.race([done, limit]).then(() => {
      clearTimeout(timer);
      app.quit();
    });
  });
};
