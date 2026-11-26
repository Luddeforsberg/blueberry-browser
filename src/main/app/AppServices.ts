import { app } from "electron";
import type { Account } from "../account/Account";
import { GalleryServer, serverConfig } from "../account/galleryServer";
import type { Gallery } from "../mascots/Gallery";
import type { TelegramChannel } from "../phone/TelegramChannel";
import type { MemoryStore } from "../memory/MemoryStore";
import type { CloudTabs } from "../cloud/CloudTabs";
import type { Released } from "../cloud/cloudProvider";
import type { RunnerJobs } from "../remoteJobs/RunnerJobs";
import type { Chats } from "../chats/Chats";
import type { Suggestions } from "../suggestions/Suggestions";
import type { McpConnector } from "../mcp/McpConnector";
import type { WindowParts } from "../window/WindowParts";
import type { Settings } from "../../shared/ipc";
import type { AppStores } from "./appStores";
import { createAccount, createGallery, createTelegram } from "./makeAccount";
import { createChats, createMemory } from "./makeChats";
import { createCloud, createRunnerJobs } from "./makeCloud";
import { cloudHooks } from "../window/makeCloud";
import { createMcp, createSuggestions } from "./makeSuggestions";

// What the app has one of, whatever windows come and go. The rule is: anything that keeps what's in a file of the user
// data folder, the account, or work that isn't one window's, is made here, once. A window makes only what draws or
// lives in it, its views, layout and tabs, and what works only through them, and all of it ends with the window.
//
// There's one window at a time, and on a Mac none while it's closed. The services here tell the window that's open, if
// one is, when something changes, so work started in a window that has closed since tells the next one, and writes into
// the same state that one reads. A window's tabs are only reached while it's open.
export class AppServices {
  readonly server: GalleryServer | null;
  readonly account: Account;
  readonly gallery: Gallery;
  readonly telegram: TelegramChannel;
  readonly memory: MemoryStore;
  readonly cloud: CloudTabs;
  readonly runnerJobs: RunnerJobs;
  readonly chats: Chats;
  readonly suggestions: Suggestions;
  readonly mcp: McpConnector;
  private open: WindowParts | null = null;
  // Takes the open window off the cloud as it closes, which ends the cloud session.
  private leaveCloud: (() => Promise<Released>) | null = null;
  private quitting: Promise<void> | null = null;
  private tabs = 0;

  constructor(
    readonly stores: AppStores,
    // The user data folder, where every service here keeps its file.
    readonly folder: string,
  ) {
    const config = serverConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, app.isPackaged);
    this.server = config && new GalleryServer(config);
    this.account = createAccount(this);
    this.gallery = createGallery(this);
    this.telegram = createTelegram(this);
    this.memory = createMemory(this);
    this.cloud = createCloud(this);
    this.runnerJobs = createRunnerJobs(this);
    this.chats = createChats(this);
    this.suggestions = createSuggestions(this);
    this.mcp = createMcp(this);
  }

  get settings(): Settings {
    return this.stores.settingsStore.get();
  }

  // Tabs are known by these ids to the chats and the cloud here, so no window's ever repeats one an earlier window had.
  nextTabId(): string {
    return `tab-${++this.tabs}`;
  }

  // The window that's open, or null.
  get window(): WindowParts | null {
    return this.open;
  }

  // Once the window has what it's made of, it starts what the app does only while one is open: the cloud browser, the
  // phone's bot and the MCP server.
  windowOpened(w: WindowParts): void {
    if (this.open) throw new Error("Blueberry has one window at a time.");
    this.open = w;
    // Quit ends straight after, so nothing starts again for it.
    if (this.quitting) return;
    this.leaveCloud = this.cloud.attach(cloudHooks(w));
    this.telegram.start();
    this.mcp.start();
  }

  // Everything a job does in the window's tabs stops, and the cloud session it may have used ends. Nothing from here
  // reaches that window again.
  windowClosed(w: WindowParts): void {
    if (this.open !== w) return;
    this.open = null;
    void this.leaveCloud?.();
    this.leaveCloud = null;
    this.chats.stopAll();
    this.telegram.close();
    // That window's phone stops hearing the bot. The next window's listens when it's made.
    const nobody = () => {};
    this.telegram.listen(nobody, nobody);
    this.mcp.close();
  }

  // Quit waits for this, for at most a few seconds: a cloud session left running costs until it times out, and a local
  // test browser would be left behind. Everything ends once: what a closed window ended stays ended, and an open window's
  // own close ends the rest in its order, after its routines have noted what was cut short.
  quit(): Promise<void> {
    this.quitting ??= (() => {
      this.runnerJobs.destroy();
      return this.cloud.quit();
    })();
    return this.quitting;
  }
}
