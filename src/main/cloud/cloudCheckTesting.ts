// The driver of the cloud's model checker in cloudLifetime.test.ts. It drives the app's cloud as the window, Settings,
// chats and Quit do, against a CloudWorld whose answers come back late and in any order, and checks after every step
// that no session is lost, that one nobody uses winds down, and that nothing claims it while it ends.
import { vi } from "vitest";
import type { CloudTabs, CloudTabsHooks } from "./CloudTabs";
import { CloudWorld, WORKS } from "./cloudWorldTesting";

type Saved = Parameters<ConstructorParameters<typeof CloudTabs>[1]>[0];

const IDLE = 3 * 60_000;
const LENGTH = 40;

// What the checker drives. The test file says how this version of the cloud is made and attached.
interface CloudUnderTest {
  tabs: Pick<
    CloudTabs,
    | "claim"
    | "release"
    | "open"
    | "tabClosed"
    | "takeOver"
    | "watch"
    | "end"
    | "forget"
    | "saveKey"
    | "checkLogin"
    | "revokeLogin"
    | "state"
  >;
  windowOpened(): void;
  windowClosed(): Promise<unknown>;
  quit(): Promise<unknown>;
}

// What the test file mocks, so that each run can point it at its own world, and how it makes the cloud.
export interface Setup {
  net: { connect: (url: string) => Promise<unknown>; attach: (id: string) => Promise<unknown> };
  disk: { saved: Saved; onWrite: (next: Saved) => void };
  makeCloud: (hooks: CloudTabsHooks) => CloudUnderTest;
}

// Each step the checker can take, and how often.
const WEIGHTS = [
  ["answer", 40],
  ["startJob", 6],
  ["endJob", 5],
  ["check", 6],
  ["closeTab", 6],
  ["takeOver", 3],
  ["watch", 4],
  ["end", 4],
  ["forget", 3],
  ["saveKey", 3],
  ["revokeKey", 1],
  ["windowClose", 3],
  ["windowOpen", 4],
  ["time", 4],
  ["revokeLogin", 3],
  ["drop", 1],
  ["quit", 1],
] as const;

type Op = (typeof WEIGHTS)[number][0];

interface Action {
  op: Op;
  a: number;
  b: number;
}

// What only the window can start.
const NEEDS_WINDOW: Op[] = ["startJob", "check", "end", "forget", "saveKey", "revokeLogin", "windowClose"];

const mulberry32 = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const actionsFor = (seed: number): Action[] => {
  const random = mulberry32(seed);
  const total = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const pick = (): Op => {
    let left = random() * total;
    for (const [op, weight] of WEIGHTS) if ((left -= weight) < 0) return op;
    return "answer";
  };
  return Array.from({ length: LENGTH }, () => ({ op: pick(), a: Math.floor(random() * 1_000), b: Math.floor(random() * 1_000) }));
};

// Every promise settles before the next step, since nothing here waits on a real timer or the network.
const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
};

const nth = <T>(items: Iterable<T>, index: number): T | undefined => {
  const all = [...items];
  return all[index % Math.max(all.length, 1)];
};

const quietly = (work: Promise<unknown>) => void work.catch(() => {});

interface Outcome {
  broken: string | null;
  trace: string[];
}

// CLOUD_IGNORE=rule,rule leaves those rules out, to see past a bug that breaks first. CLOUD_WANT=pattern only counts a
// run whose trace matches it, to look for one bug among several that break the same rule.
const IGNORED = (process.env.CLOUD_IGNORE ?? "").split(",");
const WANTED = process.env.CLOUD_WANT ? new RegExp(process.env.CLOUD_WANT) : null;

export const run = async (actions: Action[], { net, disk, makeCloud }: Setup): Promise<Outcome> => {
  vi.clearAllTimers();
  const world = new CloudWorld("key-1");
  net.connect = world.connect;
  net.attach = world.attach;
  vi.stubGlobal("fetch", world.fetch);
  disk.saved = { apiKey: "key-1", projectId: "proj", contextId: null, sessionId: null };
  const trace: string[] = [];
  let broken: string | null = null;
  const breaks = (rule: string, why: string) => {
    if (!IGNORED.includes(rule)) broken ??= `${rule}: ${why}`;
  };
  // No saved id is cleared while its session runs, unless Browserbase refused its release because of the key.
  disk.onWrite = (next) => {
    const was = disk.saved.sessionId;
    if (was && was !== next.sessionId && world.sessions.get(was) === "RUNNING" && !world.refused.has(was))
      breaks("dropped-running-id", `${was} was cleared from the disk while it was still running`);
  };

  // The window, the user and the jobs, as far as the checker knows them.
  let windowOpen = true;
  const tabs = new Set<string>();
  const held = new Set<string>();
  const jobs = new Set<string>();
  // Sign-in checks still opening, by tab. Each is the user's while its tab is open.
  const checking = new Set<string>();
  // Cookie work under way, by number.
  const cookieWork = new Set<number>();
  let endings = 0;
  let count = 0;
  const users = () => jobs.size + held.size + [...checking].filter((id) => tabs.has(id)).length + cookieWork.size;
  const hooks: CloudTabsHooks = {
    chrome: () => ({ isDestroyed: () => true }) as never,
    openTab: () => {
      const id = `tab-${++count}`;
      if (windowOpen) tabs.add(id);
      return id;
    },
    updateTab: () => {},
    closeTab: (id) => {
      tabs.delete(id);
      held.delete(id);
      cloud.tabs.tabClosed(id);
    },
    takenOver: () => {},
    showTab: () => {},
    confirmLogin: async () => true,
  };
  const cloud = makeCloud(hooks);
  cloud.windowOpened();
  await flush();
  // An ending drops every claim, every page and everything on its way, so the checker's users go with it.
  const ending = (work: Promise<unknown>) => {
    endings++;
    jobs.clear();
    held.clear();
    checking.clear();
    cookieWork.clear();
    quietly(work.finally(() => endings--));
  };

  // One step each, saying what happened for the trace, or null when it can't happen now.
  const steps: Record<Exclude<Op, "quit">, (action: Action) => string | null | Promise<string | null>> = {
    answer: ({ a, b }) => world.answer(a, b % 4),
    startJob: () => {
      const job = `job-${++count}`;
      if (!cloud.tabs.claim(job)) return `${job} isn't let in`;
      if (endings > 0) breaks("claim-while-ending", `${job} claimed the cloud browser while an ending was under way`);
      jobs.add(job);
      quietly(cloud.tabs.open(job, "https://shop.example/"));
      return `${job} claims it and opens a page`;
    },
    endJob: ({ a }) => {
      const job = nth(jobs, a);
      if (!job) return null;
      jobs.delete(job);
      cloud.tabs.release(job);
      return `${job} lets go`;
    },
    check: () => {
      const before = count;
      const opening = cloud.tabs.checkLogin("example.com");
      const id = count > before ? `tab-${count}` : null;
      if (id) checking.add(id);
      quietly(
        opening
          .then((problem) => {
            if (problem === null && id && tabs.has(id)) held.add(id);
          })
          .finally(() => id && checking.delete(id)),
      );
      return `a sign-in check opens ${id ?? "no tab"}`;
    },
    closeTab: ({ a }) => {
      const id = nth(tabs, a);
      if (!id) return null;
      hooks.closeTab(id);
      return `the user closes ${id}`;
    },
    takeOver: ({ a }) => {
      const id = nth(tabs, a);
      if (!id || !cloud.tabs.takeOver(id)) return null;
      held.add(id);
      return `the user takes over ${id}`;
    },
    watch: ({ a }) => {
      const id = nth(tabs, a);
      if (!id) return null;
      quietly(cloud.tabs.watch(id));
      return `the user looks at ${id}`;
    },
    end: () => {
      ending(cloud.tabs.end());
      return "Settings: End";
    },
    forget: () => {
      ending(cloud.tabs.forget());
      return "Settings: Forget";
    },
    saveKey: () => {
      const key = `key-${++count}`;
      world.accepted.add(key);
      ending(cloud.tabs.saveKey(key, "proj"));
      return `Settings: save ${key}`;
    },
    revokeKey: () => {
      const key = disk.saved.apiKey;
      if (!key) return null;
      world.accepted.delete(key);
      return `Browserbase stops taking ${key}`;
    },
    windowClose: () => {
      const working = [...jobs];
      windowOpen = false;
      tabs.clear();
      ending(cloud.windowClosed());
      // The window's chats stop after its cloud, as in its close.
      working.forEach((job) => cloud.tabs.release(job));
      return "the window closes";
    },
    windowOpen: () => {
      if (windowOpen) return null;
      windowOpen = true;
      cloud.windowOpened();
      return "a window opens";
    },
    time: async () => {
      const sent = world.releases.length;
      vi.advanceTimersByTime(IDLE);
      await flush();
      if (world.releases.length > sent && users() > 0)
        breaks("idle-under-user", `the idle timer released ${world.releases.slice(sent).join(", ")} while it was in use`);
      return "three minutes pass";
    },
    revokeLogin: () => {
      const work = ++count;
      cookieWork.add(work);
      quietly(cloud.tabs.revokeLogin("example.com").finally(() => cookieWork.delete(work)));
      return "Settings: remove a sign-in";
    },
    drop: ({ a }) => world.drop(a),
  };

  // Quit holds the app for a few answers at most, and then it's gone: whatever runs then must have its release out.
  const quit = async ({ a, b }: Action) => {
    trace.push("Quit");
    const releasing = world.releasing;
    const sent = world.releases.length;
    let done = false;
    quietly(cloud.quit().then(() => (done = true)));
    await flush();
    for (let k = 0; k < a % 8 && !(done && world.pending.length === 0); k++) {
      if (world.pending.length) trace.push(`  ${world.answer(b + k, (a + k) % 4)}`);
      await flush();
    }
    trace.push("  the app is gone");
    const out = new Set([...releasing, ...world.releases.slice(sent)]);
    for (const id of world.running) {
      if (disk.saved.sessionId !== id) breaks("quit-left-running", `${id} is running and nothing has its id`);
      else if (!out.has(id)) breaks("quit-left-running", `${id} is still running, and no release went out for it before the app was gone`);
    }
  };

  // Every answer, each one working, until there are none left.
  const drain = async () => {
    for (let i = 0; i < 500 && world.pending.length; i++) {
      trace.push(`  ${world.answer(0, WORKS)}`);
      await flush();
    }
  };

  // It still works, unless the key is gone: a new job gets a page, and lets go of it.
  const works = async () => {
    if (!windowOpen || jobs.size > 0 || !world.accepted.has(disk.saved.apiKey ?? "")) return;
    const job = `job-${++count}`;
    trace.push(`${job} claims it and opens a page`);
    if (!cloud.tabs.claim(job)) return breaks("stuck", `${job} isn't let in`);
    let opened: string | null = "it never opened";
    quietly(
      cloud.tabs.open(job, "https://shop.example/").then(
        () => (opened = null),
        (error: Error) => (opened = error.message),
      ),
    );
    await flush();
    await drain();
    if (opened) breaks("stuck", `${job} couldn't open a page: ${opened}`);
    cloud.tabs.release(job);
    trace.push(`${job} lets go`);
  };

  // Once the steps are over: every answer comes back, nobody uses it for a while, and then everyone lets go.
  const afterwards = async () => {
    trace.push("every answer comes back");
    await drain();
    for (const id of world.running)
      if (id !== disk.saved.sessionId) breaks("orphan", `${id} is running and nothing has its id, so it can never be released`);
    const settled = () => !cloud.tabs.state.unreleased;
    if (broken) return;
    // Before any probe, since a job that lets go arms the timer again and would hide a session left without one.
    if (settled() && users() === 0 && world.running.length) {
      trace.push("three minutes pass with nobody using it");
      vi.advanceTimersByTime(IDLE);
      await flush();
      await drain();
      if (settled() && world.running.length) breaks("no-wind-down", `${world.running.join(", ")} is still running with nobody using it`);
      if (broken) return;
    }
    if (settled()) await works();
    if (broken) return;
    trace.push("everyone lets go, and three minutes pass");
    [...jobs].forEach((job) => cloud.tabs.release(job));
    [...held].forEach((id) => hooks.closeTab(id));
    jobs.clear();
    await flush();
    vi.advanceTimersByTime(IDLE);
    await flush();
    await drain();
    if (settled() && world.running.length) breaks("never-ends", `${world.running.join(", ")} is still running after everyone let go`);
    if (!broken) await works();
  };

  const outcome = (): Outcome => ({ broken: broken && WANTED && !WANTED.test(trace.join("\n")) ? null : broken, trace });
  for (const action of actions) {
    if (action.op === "quit") {
      await quit(action);
      return outcome();
    }
    const said = NEEDS_WINDOW.includes(action.op) && !windowOpen ? null : await steps[action.op](action);
    await flush();
    if (said) trace.push(said);
    if (broken) return outcome();
  }
  await afterwards();
  return outcome();
};

export const ruleOf = (broken: string) => broken.split(":")[0] ?? broken;

// The shortest run that still breaks the same rule: whole stretches out first, then single steps.
export const shrink = async (actions: Action[], rule: string, setup: Setup): Promise<Action[]> => {
  let best = actions;
  for (let size = Math.ceil(best.length / 2); size >= 1; size = size === 1 ? 0 : Math.ceil(size / 2)) {
    for (let i = 0; i < best.length; ) {
      const shorter = [...best.slice(0, i), ...best.slice(i + size)];
      const { broken } = await run(shorter, setup);
      if (broken && ruleOf(broken) === rule) best = shorter;
      else i += size;
    }
  }
  return best;
};
