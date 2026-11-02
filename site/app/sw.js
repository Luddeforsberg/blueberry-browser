// Shows a notification when the cloud says a job needs you or has finished. The push carries only which of the two it is,
// so these words are all it can say: no prompt, page or code ever reaches the push service or the lock screen.
const WORDS = { "needs-you": "Berry needs you", finished: "Berry finished" };

self.addEventListener("push", (event) => {
  let kind = "needs-you";
  try {
    const sent = event.data?.json()?.kind;
    if (sent in WORDS) kind = sent;
  } catch {
    // Anything else still says something is waiting.
  }
  event.waitUntil(self.registration.showNotification(WORDS[kind], { tag: kind, icon: "./icon-192.png", badge: "./icon-192.png" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const page = open.find((client) => new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname));
      return page ? page.focus() : self.clients.openWindow("./");
    })
  );
});
