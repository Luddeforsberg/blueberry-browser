// The steps of the cloud's model checker that happen while the app runs, as the window, Settings, chats and the network
// take them. Each says what happened for the trace, or null when it can't happen now.
import { vi } from "vitest";
import type { Breaks, Launch, Setup } from "./cloudCheckApp";
import { flush, nth, quietly, type Action, type Op } from "./cloudCheckPlan";
import type { CloudWorld } from "./cloudWorldTesting";

export const IDLE = 3 * 60_000;

export interface StepContext {
  app: () => Launch;
  world: CloudWorld;
  disk: Setup["disk"];
  breaks: Breaks;
  // A fresh number, for names.
  next: () => number;
}

type Step = (action: Action) => string | null | Promise<string | null>;

export const runningSteps = ({ app, world, disk, breaks, next }: StepContext): Record<Exclude<Op, "quit" | "crash">, Step> => ({
  answer: ({ a, b }) => world.answer(a, b % 4),
  startJob: () => {
    const job = `job-${next()}`;
    if (!app().cloud.tabs.claim(job)) return `${job} isn't let in`;
    if (app().endings > 0) breaks("claim-while-ending", `${job} claimed the cloud browser while an ending was under way`);
    app().jobs.add(job);
    quietly(app().cloud.tabs.open(job, "https://shop.example/"));
    return `${job} claims it and opens a page`;
  },
  endJob: ({ a }) => {
    const job = nth(app().jobs, a);
    if (!job) return null;
    app().jobs.delete(job);
    app().cloud.tabs.release(job);
    return `${job} lets go`;
  },
  check: () => {
    const launch = app();
    const { win } = launch;
    const before = new Set(win.tabs.keys());
    const opening = launch.cloud.tabs.checkLogin("example.com");
    const id = [...win.tabs.keys()].find((one) => !before.has(one));
    if (id) launch.checking.add(id);
    quietly(
      opening
        .then((problem) => {
          if (problem === null && id && launch.win === win && win.tabs.has(id)) launch.held.add(id);
        })
        .finally(() => id && launch.win === win && launch.checking.delete(id)),
    );
    return `a sign-in check opens ${id ?? "no tab"}`;
  },
  closeTab: ({ a }) => {
    const id = nth(app().win.cloudTabs, a);
    if (!id) return null;
    app().closeTab(id);
    return `the user closes ${id}`;
  },
  userTab: () => `the user opens ${app().userTab()}, a tab of their own`,
  takeOver: ({ a }) => {
    const id = nth(app().win.cloudTabs, a);
    if (!id || !app().cloud.tabs.takeOver(id)) return null;
    app().held.add(id);
    return `the user takes over ${id}`;
  },
  watch: ({ a }) => {
    const id = nth(app().win.cloudTabs, a);
    if (!id) return null;
    quietly(app().cloud.tabs.watch(id));
    return `the user looks at ${id}`;
  },
  end: () => {
    app().ending(app().cloud.tabs.end());
    return "Settings: End";
  },
  forget: () => {
    app().ending(app().cloud.tabs.forget());
    return "Settings: Forget";
  },
  saveKey: () => {
    const key = `key-${next()}`;
    world.accepted.add(key);
    app().ending(app().cloud.tabs.saveKey(key, "proj"));
    return `Settings: save ${key}`;
  },
  revokeKey: () => {
    const key = disk.saved.apiKey;
    if (!key || app().local) return null;
    world.accepted.delete(key);
    return `Browserbase stops taking ${key}`;
  },
  windowClose: () => {
    app().closeWindow();
    return "the window closes";
  },
  windowOpen: () => {
    if (app().win.open) return null;
    app().openWindow();
    return "a window opens";
  },
  time: async () => {
    const sent = world.releases.length;
    const local = world.localRunning;
    vi.advanceTimersByTime(IDLE);
    await flush();
    const ended = [...world.releases.slice(sent), ...local.filter((name) => !world.localRunning.includes(name))];
    if (ended.length && app().users() > 0) breaks("idle-under-user", `the idle timer ended ${ended.join(", ")} while it was in use`);
    return "three minutes pass";
  },
  revokeLogin: () => {
    const launch = app();
    const work = next();
    launch.cookieWork.add(work);
    quietly(launch.cloud.tabs.revokeLogin("example.com").finally(() => launch.cookieWork.delete(work)));
    return "Settings: remove a sign-in";
  },
  // Each site its own, so the checker can tell which confirm a sign-in went in with.
  bringLogin: () => {
    const launch = app();
    const { win } = launch;
    const site = `s${next()}.example.com`;
    launch.transfers.set(site, launch.account);
    quietly(
      launch.cloud.tabs.bringLogin(site).then((problem) => {
        const id = launch.tabTitled(site);
        if (problem === null && id && launch.win === win) launch.held.add(id);
      }),
    );
    return `Settings: bring the sign-in to ${site}, for ${launch.account}`;
  },
  confirm: ({ a, b }) => {
    const { confirms } = app().win;
    const site = nth(confirms.keys(), a);
    if (!site) return null;
    const yes = b % 4 !== 0;
    confirms.get(site)?.(yes);
    confirms.delete(site);
    return `the user ${yes ? "confirms" : "declines"} bringing ${site}`;
  },
  drop: ({ a }) => world.drop(a),
});
