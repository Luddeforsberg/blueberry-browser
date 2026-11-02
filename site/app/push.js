import { VAPID_PUBLIC_KEY } from "../config.js";
import { rpc } from "./api.js";

// Notifications on this phone: the service worker, and a subscription saved for the signed-in user only. iOS gives push
// only to a page added to the Home Screen, so there it says that first.

export const pushState = async () => {
  if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator)) return "unavailable";
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (!("PushManager" in window)) return /iPhone|iPad/.test(navigator.userAgent) && !standalone ? "add-to-home" : "unavailable";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration("./");
  return (await registration?.pushManager.getSubscription()) ? "on" : "off";
};

export const register = () => navigator.serviceWorker?.register("./sw.js", { scope: "./" }).catch(() => null);

const keyBytes = (base64) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const turnOn = async () => {
  const registration = (await register()) ?? (await navigator.serviceWorker.ready);
  if ((await Notification.requestPermission()) !== "granted") return false;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const { endpoint, keys } = subscription.toJSON();
  return (await rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })) === true;
};

// Off here and on the server, so nothing goes to this phone for an account that signed out.
export const turnOff = async () => {
  const registration = await navigator.serviceWorker?.getRegistration("./");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await rpc("forget_push_subscription", { p_endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
};
