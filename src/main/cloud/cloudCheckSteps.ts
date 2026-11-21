// The steps of the cloud's model checker that happen while the app runs, as the window, Settings, chats and the network
// take them. Each says what happened for the trace, or null when it can't happen now.
import { vi } from "vitest";
import type { Breaks, Launch, Setup } from "./cloudCheckApp";
import { flush, nth, quietly, type Action, type Op } from "./cloudCheckPlan";
import type { Runners } from "./cloudCheckRunners";
import { FAILS, WORKS, type CloudWorld } from "./cloudWorldTesting";

export const IDLE = 3 * 60_000;
const HOUR = 61 * 60_000;

export interface StepContext {
  app: () => Launch;
  world: CloudWorld;
  disk: Setup["disk"];
  runners: Runners;
  breaks: Breaks;
  // Gives one answer, and checks what it did.
  deliver: (index: number, how: number) => Promise<string>;
  // A fresh number, for names.
  next: () => number;
}

type Step = (action: Action) => string | null | Promise<string | null>;

export const runningSteps = (context: StepContext): Record<Exclude<Op, "quit" | "crash" | "keyDamaged">, Step> => ({
  ...appSteps(context),
  ...worldSteps(context),
});

const appSteps = ({ app, world, breaks, next }: StepContext) => ({
  startJob: ({ a }: Action) => {
    const job = `job-${next()}`;
    if (!app().cloud.tabs.claim(job)) return `${job} isn't let in`;
    if (app().endings > 0) breaks("claim-while-ending", `${job} claimed the cloud browser while an ending was under way`);
    app().jobs.add(job);
    // Some are limited mascots, whose limit goes on before the page loads.
    const limited = a % 2 === 0;
    quietly(app().cloud.tabs.open(job, "https://shop.example/", limited ? () => true : undefined));
    return `${job} claims it and opens a page${limited ? ", limited to its sites" : ""}`;
  },
  endJob: ({ a }: Action) => {
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
    const opening = launch.cloud.tabs.signedIn.check("example.com");
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
  closeTab: ({ a }: Action) => {
    const id = nth(app().win.cloudTabs, a);
    if (!id) return null;
    app().closeTab(id);
    return `the user closes ${id}`;
  },
  userTab: () => `the user opens ${app().userTab()}, a tab of their own`,
  takeOver: ({ a }: Action) => {
    const id = nth(app().win.cloudTabs, a);
    if (!id || !app().cloud.tabs.takeOver(id)) return null;
    app().held.add(id);
    return `the user takes over ${id}`;
  },
  watch: ({ a }: Action) => {
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
  // Some keys are for another project, which sees none of the first one's sessions.
  saveKey: ({ a }: Action) => {
    const key = `key-${next()}`;
    const project = a % 3 === 0 ? "proj-2" : "proj";
    world.accept(key, project);
    app().ending(app().cloud.tabs.saveKey(key, project));
    return `Settings: save ${key}, for ${project}`;
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
  revokeLogin: () => {
    const launch = app();
    const work = next();
    launch.cookieWork.add(work);
    quietly(launch.cloud.tabs.signedIn.revoke("example.com").finally(() => launch.cookieWork.delete(work)));
    return "Settings: remove a sign-in";
  },
  // Each site its own, so the checker can tell which confirm a sign-in went in with.
  bringLogin: () => {
    const launch = app();
    const { win } = launch;
    const site = `s${next()}.example.com`;
    launch.transfers.set(site, launch.account);
    quietly(
      launch.cloud.tabs.signedIn.bring(site).then((problem) => {
        const id = launch.tabTitled(site);
        if (problem === null && id && launch.win === win) launch.held.add(id);
      }),
    );
    return `Settings: bring the sign-in to ${site}, for ${launch.account}`;
  },
  confirm: ({ a, b }: Action) => {
    const { confirms } = app().win;
    const site = nth(confirms.keys(), a);
    if (!site) return null;
    const yes = b % 4 !== 0;
    confirms.get(site)?.(yes);
    confirms.delete(site);
    return `the user ${yes ? "confirms" : "declines"} bringing ${site}`;
  },
});

// Time, the network, the disk and the runners.
const worldSteps = ({ app, world, disk, runners, breaks, deliver, next }: StepContext) => {
  // Time moves on with creates and answers still on their way, but a create lands within its time or never, as `b` says.
  const pass = async ({ b }: Action, ms: number, words: string) => {
    const landed = world.landBefore(ms, b % 2 === 0 ? WORKS : FAILS);
    const sent = world.releases.length;
    const local = world.localRunning;
    vi.advanceTimersByTime(ms);
    await flush();
    const ended = [
      ...world.releases.slice(sent).filter((id) => world.isApp(id)),
      ...local.filter((name) => !world.localRunning.includes(name)),
    ];
    if (ended.length && app().users() > 0) breaks("idle-under-user", `the idle timer ended ${ended.join(", ")} while it was in use`);
    return landed.length ? `${landed.join("; ")}; then ${words}` : words;
  };
  return {
    answer: ({ a, b }: Action) => deliver(a, b % 4),
    time: (action: Action) => pass(action, IDLE, "three minutes pass"),
    hour: (action: Action) => pass(action, HOUR, "an hour passes"),
    revokeKey: () => {
      const key = app().cloud.key();
      if (!key || app().local) return null;
      world.accepted.delete(key);
      return `Browserbase stops taking ${key}`;
    },
    // The session in use goes with its connection, and so do the pages the user held there.
    drop: async ({ a }: Action) => {
      const launch = app();
      const using = launch.cloud.tabs.state.status === "running";
      const said = world.drop(a);
      await flush();
      if (using && launch.cloud.tabs.state.status !== "running") {
        launch.held.clear();
        launch.checking.clear();
      }
      return said;
    },
    diskFails: ({ a }: Action) => {
      disk.failsFor = (a % 3) + 1;
      return `the next ${disk.failsFor} saves fail`;
    },
    runnerTakes: () => runners.take(next()),
    runnerFinishes: ({ a }: Action) => runners.finish(a),
    runnerStops: ({ a }: Action) => runners.stop(a),
    runnerStarts: ({ a }: Action) => runners.sweep(a),
  };
};
