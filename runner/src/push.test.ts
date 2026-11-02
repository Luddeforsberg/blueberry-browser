import { describe, expect, it } from "vitest";
import { isPushEndpoint, pushConfig, pusher, type PushSubscriptionRow } from "./push";

const CONFIG = { publicKey: "BPublic", privateKey: "private", subject: "mailto:ana@example.com" };
const PHONE: PushSubscriptionRow = { endpoint: "https://web.push.apple.com/QGx", p256dh: "BKey", auth: "secret" };

const setUp = (rows: PushSubscriptionRow[], fail: Record<string, number> = {}) => {
  const sent: { endpoint: string; payload: string; options: Record<string, unknown> }[] = [];
  const forgotten: string[] = [];
  const db = { pushSubscriptions: async () => rows, forgetPushSubscription: async (endpoint: string) => void forgotten.push(endpoint) };
  const notify = pusher(CONFIG, db, async ({ endpoint }, payload, options) => {
    if (fail[endpoint]) throw Object.assign(new Error("Refused"), { statusCode: fail[endpoint] });
    sent.push({ endpoint, payload, options: options as Record<string, unknown> });
  }, () => {});
  return { notify, sent, forgotten };
};

describe("notifications to the phone", () => {
  it("say only which kind they are", async () => {
    const { notify, sent } = setUp([PHONE]);
    await notify("needs-you");
    await notify("finished");
    expect(sent.map(({ payload }) => JSON.parse(payload))).toEqual([{ kind: "needs-you" }, { kind: "finished" }]);
    expect(sent[0].options).toMatchObject({ vapidDetails: CONFIG, topic: "needs-you" });
  });

  it("go only to a browser's own push service, and forget a device that's gone", async () => {
    const gone = "https://fcm.googleapis.com/fcm/send/gone";
    const { notify, sent, forgotten } = setUp([PHONE, { ...PHONE, endpoint: "https://169.254.169.254/latest" }, { ...PHONE, endpoint: "https://evil.example/web.push.apple.com" }, { ...PHONE, endpoint: gone }], { [gone]: 410 });
    await notify("finished");
    expect(sent.map(({ endpoint }) => endpoint)).toEqual([PHONE.endpoint]);
    expect(forgotten).toEqual([gone]);
  });

  it.each([
    ["https://fcm.googleapis.com/fcm/send/x", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://wns2-db5p.notify.windows.com/w/?token=x", true],
    ["http://fcm.googleapis.com/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://user@web.push.apple.com/x", false],
    ["https://notify.windows.com.evil.example/x", false],
    ["not an address", false],
  ])("treats %s as a push service: %s", (endpoint, ok) => {
    expect(isPushEndpoint(endpoint)).toBe(ok);
  });

  it("needs both keys and a subject, or none at all", () => {
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:ana@example.com" })).toEqual({ publicKey: "a", privateKey: "b", subject: "mailto:ana@example.com" });
    expect(typeof pushConfig({ VAPID_PUBLIC_KEY: "a" })).toBe("string");
    expect(typeof pushConfig({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" })).toBe("string");
  });
});
