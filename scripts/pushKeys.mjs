// Makes a VAPID key pair for notifications to the phone page. Run it once with `pnpm run push:keys`. The private key goes
// only on the runner, in Railway's variables. The public one goes there too, and in site/config.js.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`On Railway, set these on the runner service:

  VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}
  VAPID_SUBJECT=mailto:you@example.com   (your own address)

In site/config.js, set:

  export const VAPID_PUBLIC_KEY = "${publicKey}";

Keep the private key out of the repo and the site.`);
