import { app } from "electron";
import { join } from "path";
import { CloudTabs } from "../cloud/CloudTabs";
import { browserbase } from "../cloud/browserbase";
import { localChrome } from "../cloud/localChrome";
import { readSiteCookies } from "../cloud/cloudLoginAccess";
import { suggestLoginSites } from "../cloud/cloudLogins";
import { RunnerJobs } from "../remoteJobs/RunnerJobs";
import { sendToRenderer } from "../window/ipc";
import type { AppServices } from "./AppServices";
import type { AppStores } from "./appStores";

// Work that runs away from the window: the cloud browser, which each window attaches to while it's open (see
// `cloudHooks`), and the cloud runner's jobs, which carry on with none.

export const createCloud = (s: AppServices): CloudTabs => {
  // Only an unpackaged app can be pointed at a Chrome on this computer instead of Browserbase, like the other test hooks.
  const localCloud = app.isPackaged ? undefined : process.env.BLUEBERRY_CLOUD_LOCAL;
  const local = localCloud
    ? localCloud === "1"
      ? { executable: process.env.BLUEBERRY_CLOUD_CHROME || undefined }
      : { endpoint: localCloud }
    : null;
  return new CloudTabs(
    join(s.folder, "cloud.json"),
    ({ apiKey, projectId }) => (local ? localChrome(local) : apiKey && projectId ? browserbase({ apiKey, projectId }) : null),
    (site) => readSiteCookies(site),
  );
};

// Sites to offer in Settings > Cloud > Signed in to, from history and bookmarks. Names only.
export const cloudLoginSuggestions = (stores: AppStores, cloud: CloudTabs): string[] => {
  const urls = [...stores.history.recent(500), ...stores.bookmarkStore.bookmarks, ...stores.bookmarkStore.pinned].map(({ url }) => url);
  return suggestLoginSites(
    urls,
    cloud.state.logins.map(({ site }) => site),
  );
};

export const createRunnerJobs = (s: AppServices): RunnerJobs =>
  new RunnerJobs(s.server, s.account, join(s.folder, "runner-jobs.json"), {
    changed: (chatId) => s.chats.runnerChanged(chatId),
    finished: (chatId, result) => s.chats.runnerFinished(chatId, result),
    contextId: () => s.cloud.contextId,
    runnerUpdated: (state) => {
      const w = s.window;
      if (!w) return;
      sendToRenderer(w.chromeView.view.webContents, "cloud:runner-updated", state);
      w.macJobs.sync();
    },
    mascots: () => s.stores.mascotStore.all(),
    adopt: ({ prompt, mascotId }) => s.chats.adoptRunnerChat(prompt, mascotId),
    followedUp: (chatId, prompt) => s.chats.runnerFollowedUp(chatId, prompt),
    // The routines run in a window's time, so with none the cloud's are left as they are.
    routinesSettled: () => s.window?.routines.cloudChanged(),
    // From what's saved, since one missing here would be forgotten in the cloud.
    routineIds: () => s.stores.routineStore.routines().map(({ id }) => id),
    routines: () =>
      s.window?.routines.cloudRows((id) => s.stores.mascotStore.resolve(id), {
        actionApproval: s.settings.actionApproval,
        contextId: s.cloud.contextId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }) ?? null,
  });
