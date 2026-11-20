import { app } from "electron";
import { join } from "path";
import { InternalTab } from "../tabs/InternalTab";
import type { GalleryServer } from "../account/galleryServer";
import { CloudTabs } from "../cloud/CloudTabs";
import { confirmCloudLogin, readSiteCookies } from "../cloud/cloudLoginAccess";
import { suggestLoginSites } from "../cloud/cloudLogins";
import { RunnerJobs } from "../remoteJobs/RunnerJobs";
import { MacJobs } from "../remoteJobs/MacJobs";
import { sendToRenderer } from "./ipc";
import { BERRY } from "../../shared/mascots";
import type { WindowParts, WindowStores } from "./WindowParts";

// Work that runs away from this window, wired to it: the cloud browser and its tabs, the cloud runner's jobs, and relay
// jobs run on this Mac. Each is made in its turn by the window's constructor, and reaches the rest of the window only
// when it's called.

export const createCloud = (w: WindowParts): CloudTabs => {
  // Only an unpackaged app can be pointed at a Chrome on this computer instead of Browserbase, like the other test hooks.
  const localCloud = app.isPackaged ? undefined : process.env.BLUEBERRY_CLOUD_LOCAL;
  return new CloudTabs(
    join(app.getPath("userData"), "cloud.json"),
    {
      chrome: () => w.chromeView.view.webContents,
      openTab: (title) => w.tabs.openCloudTab(title),
      updateTab: (id, title) => {
        const tab = w.tabs.find(id);
        if (!(tab instanceof InternalTab) || tab.title === title) return;
        tab.title = title;
        w.tabs.notifyTabs();
      },
      closeTab: (id) => {
        if (w.tabs.has(id) && w.tabs.tabCount > 1) w.tabs.closeTab(id, false);
        else w.cloud.tabClosed(id);
      },
      takenOver: (id) => w.chats.releaseTab(id),
      showTab: (id) => w.tabs.switchActiveTab(id),
      confirmLogin: (site) => confirmCloudLogin(w.baseWindow, site),
      readCookies: (site) => readSiteCookies(site),
    },
    localCloud ? (localCloud === "1" ? { executable: process.env.BLUEBERRY_CLOUD_CHROME || undefined } : { endpoint: localCloud }) : null,
  );
};

// Sites to offer in Settings > Cloud > Signed in to, from history and bookmarks. Names only.
export const cloudLoginSuggestions = (stores: WindowStores, cloud: CloudTabs): string[] => {
  const urls = [...stores.history.recent(500), ...stores.bookmarkStore.get(), ...stores.pinnedStore.get()].map(({ url }) => url);
  return suggestLoginSites(
    urls,
    cloud.state.logins.map(({ site }) => site),
  );
};

export const createRunnerJobs = (w: WindowParts, server: GalleryServer | null, stores: WindowStores): RunnerJobs =>
  new RunnerJobs(server, w.account, join(app.getPath("userData"), "runner-jobs.json"), {
    changed: (chatId) => w.chats.runnerChanged(chatId),
    finished: (chatId, result) => w.chats.runnerFinished(chatId, result),
    contextId: () => w.cloud.contextId,
    runnerUpdated: (state) => {
      sendToRenderer(w.chromeView.view.webContents, "cloud:runner-updated", state);
      w.macJobs?.sync();
    },
    mascots: () => stores.mascotStore.all(),
    adopt: ({ prompt, mascotId }) => w.chats.adoptRunnerChat(prompt, mascotId),
    followedUp: (chatId, prompt) => w.chats.runnerFollowedUp(chatId, prompt),
    routinesSettled: () => w.routines.cloudChanged(),
    routineIds: () => w.routines.list().map(({ id }) => id),
    routines: () =>
      w.routines.cloudRows((id) => stores.mascotStore.resolve(id), {
        actionApproval: w.settings.actionApproval,
        contextId: w.cloud.contextId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });

// Relay jobs on this Mac, run as an MCP job is: no page, a `from`, and every limit and approval of the chat.
export const createMacJobs = (w: WindowParts, server: GalleryServer | null): MacJobs =>
  new MacJobs(server, w.account, {
    enabled: () => w.settings.relayOnMac,
    linked: () => w.runnerJobs.available(),
    // The mascot from the row only narrows the one here with its id, and one that isn't here doesn't start.
    start: (prompt, { mascot, askAtLeast, from }, onEnd) => {
      const clean = (text: string) => w.chats.withoutCodes(text);
      const sent = w.chats.send(null, prompt, {
        seePage: false,
        mascotId: mascot.id === BERRY.id ? null : mascot.id,
        sites: mascot.sites,
        tools: mascot.tools,
        askAtLeast,
        from,
        onEnd: (ended) =>
          onEnd({
            ...ended,
            reply: clean(ended.reply),
            steps: ended.steps.map((step) => ({ ...step, text: clean(step.text) })),
            error: ended.error && clean(ended.error),
          }),
      });
      return sent?.id ?? null;
    },
    progress: (chatId) => {
      const chat = w.chats.thread(chatId);
      if (!chat) return null;
      const clean = (text: string) => w.chats.withoutCodes(text);
      return {
        reply: clean(chat.partial ?? ""),
        steps: chat.steps.map((step) => ({ ...step, text: clean(step.text) })),
        waiting: w.chats.waiting().some(({ id }) => id === chatId),
      };
    },
    stop: (chatId) => w.chats.stop(chatId),
  });
