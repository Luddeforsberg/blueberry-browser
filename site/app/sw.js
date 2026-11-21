// Shows a notification when the cloud says a job needs you or has finished. The push carries only which of the two it is,
// so these words are all it can say: no prompt, page or code ever reaches the push service or the lock screen.
const WORDS = { "needs-you": "Berry needs you", finished: "Berry finished" };

// Anything but "finished" still says something is waiting.
/** @param {unknown} sent */
const kindOf = (sent) => {
  const kind = typeof sent === "object" && sent !== null && "kind" in sent ? sent.kind : null;
  return kind === "finished" ? "finished" : "needs-you";
};

// Always true where it runs, and it gives the worker its own events.
if (self instanceof ServiceWorkerGlobalScope) {
  /** @type {ServiceWorkerGlobalScope} */
  const worker = self;

  worker.addEventListener("push", (event) => {
    /** @type {"needs-you" | "finished"} */
    let kind = "needs-you";
    try {
      kind = kindOf(event.data?.json());
    } catch {
      // Not JSON: still something waiting.
    }
    event.waitUntil(worker.registration.showNotification(WORDS[kind], { tag: kind, icon: "./icon-192.png", badge: "./icon-192.png" }));
  });

  worker.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
      worker.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
        const page = open.find((client) => new URL(client.url).pathname.startsWith(new URL(worker.registration.scope).pathname));
        return page ? page.focus() : worker.clients.openWindow("./");
      }),
    );
  });
}
