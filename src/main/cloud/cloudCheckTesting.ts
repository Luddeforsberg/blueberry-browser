// The driver of the cloud's model checker in cloudLifetime.test.ts. It drives the app's cloud as the window, Settings,
// chats, Quit and a crash do, against a CloudWorld whose answers come back late, in any order or never, and checks after
// every step that no session is lost, not even across a quit or a crash, that one nobody uses winds down, that nothing
// claims it while it ends, and that nothing late reaches the wrong window or account.
import { vi } from "vitest";
import { Launch, type Setup } from "./cloudCheckApp";
import { flush, NEEDS_WINDOW, quietly, type Action } from "./cloudCheckPlan";
import { IDLE, runningSteps } from "./cloudCheckSteps";
import { CloudWorld, WORKS } from "./cloudWorldTesting";

type Saved = Setup["disk"]["saved"];

interface Outcome {
  broken: string | null;
  trace: string[];
}

// CLOUD_IGNORE=rule,rule leaves those rules out, to see past a bug that breaks first. CLOUD_WANT=pattern only counts a
// run whose trace or broken rule matches it, to look for one bug among several that break the same rule.
const IGNORED = (process.env.CLOUD_IGNORE ?? "").split(",");
const WANTED = process.env.CLOUD_WANT ? new RegExp(process.env.CLOUD_WANT) : null;

// What Settings says while a session may still be running.
const STILL_RUNNING = /may still be running|End again/;

// Whether a session can still be found from what's saved, by its id or the tag it was asked for with, by the provider
// that made it.
const findable = (saved: Saved, world: CloudWorld, id: string): boolean => {
  const tag = world.tagOf(id);
  return saved.madeBy !== "local" && (saved.sessionId === id || (tag !== undefined && (saved.tags ?? []).includes(tag)));
};

export const run = async (actions: Action[], { net, disk, makeCloud, reset }: Setup): Promise<Outcome> => {
  vi.clearAllTimers();
  reset();
  const world = new CloudWorld("key-1");
  net.connect = world.connect;
  net.attach = world.attach;
  vi.stubGlobal("fetch", world.fetch);
  disk.saved = { apiKey: "key-1", projectId: "proj", contextId: null, sessionId: null, tags: [], madeBy: null };
  const trace: string[] = [];
  let broken: string | null = null;
  const breaks = (rule: string, why: string) => {
    if (!IGNORED.includes(rule)) broken ??= `${rule}: ${why}`;
  };
  // Nothing running at Browserbase becomes impossible to find from the disk, unless it refused the key.
  disk.onWrite = (next) => {
    for (const id of world.running)
      if (!world.local.has(id) && findable(disk.saved, world, id) && !findable(next, world, id))
        breaks("dropped-running-id", `${id} could no longer be found from the disk while it was still running`);
  };
  let count = 0;
  const next = () => ++count;
  let app = new Launch(false, { world, disk, breaks, makeCloud });
  await flush();
  const steps = runningSteps({ app: () => app, world, disk, breaks, next });

  // The app is gone, with whatever it asked for unanswered, and launches again from what's on the disk. A Chrome it
  // started goes with it.
  const relaunch = async (local: boolean) => {
    await flush();
    world.lose();
    vi.clearAllTimers();
    app.win.close();
    world.localRunning.forEach((name) => world.local.set(name, false));
    app = new Launch(local, { world, disk, breaks, makeCloud });
    trace.push(`the app launches again${local ? ", with a Chrome on this computer standing in" : ""}`);
    await flush();
  };

  // Every answer, each one working, until there are none left.
  const drain = async () => {
    await flush();
    for (let i = 0; i < 500 && world.pending.length; i++) {
      trace.push(`  ${world.answer(0, WORKS)}`);
      await flush();
    }
  };

  // Three minutes, once everything on its way has come back.
  const idle = async () => {
    await drain();
    vi.advanceTimersByTime(IDLE);
    await flush();
    await drain();
  };

  // Quit holds the app for a few answers at most. A Chrome on this computer answers within it and the network may not,
  // so anything still running then must end on the next launch.
  const quit = async ({ a, b }: Action) => {
    trace.push("Quit");
    let done = false;
    quietly(app.cloud.quit().then(() => (done = true)));
    await flush();
    for (let k = 0; k < a % 8 && !done && world.pending.length; k++) {
      trace.push(`  ${world.answer(b + k, (a + k) % 4)}`);
      await flush();
    }
    for (let said = done ? null : world.answerOf(["launch"], b, a % 4); said; said = done ? null : world.answerOf(["launch"], b, WORKS)) {
      trace.push(`  ${said}`);
      await flush();
    }
    trace.push("  the app is gone");
    for (const name of world.localRunning) breaks("local-left-running", `${name} is still running after the app has gone`);
    await relaunch(false);
    trace.push("  every answer comes back, and three minutes pass");
    await drain();
    await idle();
    for (const id of world.running)
      breaks("quit-left-running", `${id} is still running after the next launch, which had nothing to end it by`);
  };

  // It still works, unless the key is gone: a new job gets a page, and lets go of it.
  const works = async () => {
    if (!app.win.open || app.jobs.size > 0 || (!app.local && !world.accepted.has(disk.saved.apiKey ?? ""))) return;
    const job = `job-${next()}`;
    trace.push(`${job} claims it and opens a page`);
    if (!app.cloud.tabs.claim(job)) return breaks("stuck", `${job} isn't let in`);
    let opened: string | null = "it never opened";
    quietly(
      app.cloud.tabs.open(job, "https://shop.example/").then(
        () => (opened = null),
        (error: Error) => (opened = error.message),
      ),
    );
    await flush();
    await drain();
    if (opened) breaks("stuck", `${job} couldn't open a page: ${opened}`);
    app.cloud.tabs.release(job);
    trace.push(`${job} lets go`);
  };

  // Once the steps are over: every answer comes back, nobody uses it for a while, and then everyone lets go.
  const afterwards = async () => {
    trace.push("every answer comes back, and the user confirms what's waiting");
    app.win.confirms.forEach((answer) => answer(true));
    app.win.confirms.clear();
    await drain();
    // A Chrome standing in can't end Browserbase's sessions, so the app goes back to Browserbase for that.
    if (app.local) {
      trace.push("Quit, with every answer");
      quietly(app.cloud.quit());
      await drain();
      await relaunch(false);
      await drain();
    }
    for (const id of world.running)
      if (!findable(disk.saved, world, id)) breaks("orphan", `${id} is running and nothing has its id or tag, so it can never be released`);
    const settled = () => !app.cloud.tabs.state.unreleased;
    if (broken) return;
    // Before any probe, since a job that lets go arms the timer again and would hide a session left without one.
    if (settled() && app.users() === 0 && world.running.length) {
      trace.push("three minutes pass with nobody using it");
      await idle();
      if (settled() && world.running.length) breaks("no-wind-down", `${world.running.join(", ")} is still running with nobody using it`);
      if (broken) return;
    }
    if (settled()) await works();
    if (broken) return;
    trace.push("everyone lets go, and three minutes pass");
    [...app.jobs].forEach((job) => app.cloud.tabs.release(job));
    app.win.cloudTabs.forEach((id) => app.closeTab(id));
    app.jobs.clear();
    await flush();
    await idle();
    if (settled() && world.running.length) breaks("never-ends", `${world.running.join(", ")} is still running after everyone let go`);
    const { problem, canEnd } = app.cloud.tabs.state;
    if (!world.anyRunning && !canEnd && problem && STILL_RUNNING.test(problem))
      breaks("stale-problem", `Settings still says "${problem}" with nothing running`);
    if (!broken) await works();
  };

  const outcome = (): Outcome => ({ broken: broken && WANTED && !WANTED.test(`${broken}\n${trace.join("\n")}`) ? null : broken, trace });
  for (const action of actions) {
    if (action.op === "quit") {
      await quit(action);
      return outcome();
    }
    if (action.op === "crash") {
      trace.push("the app stops without quitting");
      await relaunch(action.a % 3 === 0);
    } else {
      const said = NEEDS_WINDOW.includes(action.op) && !app.win.open ? null : await steps[action.op](action);
      await flush();
      if (said) trace.push(said);
    }
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
