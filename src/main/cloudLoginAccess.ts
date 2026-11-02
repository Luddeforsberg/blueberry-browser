import { app, dialog, session, systemPreferences, type BaseWindow } from "electron";
import type { StoredCookie } from "./cloudLogins";

// The two Electron parts of bringing a sign-in into the cloud: asking the user, and reading that one site's cookies.

// Touch ID where the Mac has it, and a plain confirm everywhere else. `BLUEBERRY_CLOUD_CONFIRM` ("allow" or "deny")
// answers for tests, only in an unpackaged app, like the other test hooks.
export const confirmCloudLogin = async (window: BaseWindow, site: string): Promise<boolean> => {
  const test = app.isPackaged ? undefined : process.env.BLUEBERRY_CLOUD_CONFIRM;
  if (test === "allow" || test === "deny") return test === "allow";
  if (process.platform === "darwin" && systemPreferences.canPromptTouchID()) {
    try {
      // macOS words it as "Blueberry is trying to …".
      await systemPreferences.promptTouchID(`bring your sign-in to ${site} into the cloud browser`);
      return true;
    } catch {
      return false;
    }
  }
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    message: `Bring your sign-in to ${site} into the cloud browser?`,
    detail: "Its cookies are copied from Blueberry into the cloud browser, where a bird working in the cloud can use the site as you. Nothing else is copied, and you can take it out again in Settings > Cloud.",
    buttons: ["Bring it along", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
};

// Cookies for the site and its subdomains, and those its parent domains set for it, which it gets anyway. Two lookups
// that each name the site, never one for everything. `cookiesForSite` filters again before anything is sent.
export const readSiteCookies = async (site: string): Promise<StoredCookie[]> => {
  const { cookies } = session.defaultSession;
  const [own, sent] = await Promise.all([
    cookies.get({ domain: site }),
    cookies.get({ url: `https://${site}/` }),
  ]);
  const key = (cookie: Electron.Cookie) => `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}`;
  return [...new Map([...own, ...sent].map((cookie) => [key(cookie), cookie])).values()];
};
