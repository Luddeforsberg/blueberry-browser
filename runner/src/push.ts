import webpush from "web-push";

// Tells the owner's phone that a job needs them or has finished, through Web Push. The payload is only which of the two
// it is, so the push service, the phone's lock screen and anyone watching either never get a prompt, a page or a code.
// Without VAPID keys the runner sends nothing, and says so once.

export type PushKind = "needs-you" | "finished";

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDb {
  pushSubscriptions(): Promise<PushSubscriptionRow[]>;
  forgetPushSubscription(endpoint: string): Promise<void>;
}

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

// The browsers' own push services, so a subscription can't point the runner at anything else.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export const isPushEndpoint = (endpoint: string): boolean => {
  try {
    const { protocol, hostname, port, username } = new URL(endpoint);
    return protocol === "https:" && !port && !username && PUSH_HOSTS.some((host) => host.test(hostname));
  } catch {
    return false;
  }
};

export const pushPayload = (kind: PushKind): string => JSON.stringify({ kind });

// The keys from `pnpm run push:keys`, or null with none set. Words say what's wrong, never a value.
export const pushConfig = (env: Record<string, string | undefined>): PushConfig | null | string => {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey) return "Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither.";
  if (!subject || !/^(mailto:|https:\/\/)/.test(subject)) return "Set VAPID_SUBJECT to mailto:you@example.com, so push services know who's sending.";
  return { publicKey, privateKey, subject };
};

type Send = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: object) => Promise<unknown>;

// One push to each of the owner's devices. A device the push service says is gone is forgotten. Nothing here fails a job.
export const pusher = (config: PushConfig, db: PushDb, send: Send = webpush.sendNotification, log: (line: string) => void = console.log) =>
  async (kind: PushKind): Promise<void> => {
    let rows: PushSubscriptionRow[];
    try {
      rows = await db.pushSubscriptions();
    } catch {
      return log("Couldn't look up where to send a notification.");
    }
    await Promise.all(
      rows.filter((row) => isPushEndpoint(row.endpoint)).map(async ({ endpoint, p256dh, auth }) => {
        try {
          await send({ endpoint, keys: { p256dh, auth } }, pushPayload(kind), {
            vapidDetails: config,
            TTL: 60 * 60,
            urgency: kind === "needs-you" ? "high" : "normal",
            topic: kind,
          });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.forgetPushSubscription(endpoint).catch(() => {});
          else log("A notification couldn't be sent.");
        }
      })
    );
  };
