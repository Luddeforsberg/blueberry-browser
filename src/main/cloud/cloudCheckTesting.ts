// The driver of the cloud's model checker in cloudLifetime.test.ts. It drives the app's cloud as the window, Settings,
// chats, Quit and a crash do, and runners beside it, against a CloudWorld whose answers come back late, in any order or
// never, and checks after every step that no session is lost, not even across a quit or a crash, that one nobody uses
// winds down, that nothing claims it while it ends, that nothing late reaches the wrong window, page or account, and
// that no runner ends another's live job.
import { vi } from "vitest";
import { Launch, type Setup } from "./cloudCheckApp";
import { flush, NEEDS_WINDOW, quietly, type Action } from "./cloudCheckPlan";
import { Runners } from "./cloudCheckRunners";
import { IDLE, runningSteps } from "./cloudCheckSteps";
import { entriesOf, fieldsOf } from "../../shared/fields";
import { CloudWorld, WORKS } from "./cloudWorldTesting";

type Files = Setup["disk"]["files"];
const KEY_FILE = "cloud.json";
const SESSIONS_FILE = "cloud-sessions.json";

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

// What a sealed value is once the keychain that sealed it has gone.
const DAMAGED = "ZGFtYWdlZA==";

// As the fake `safeStorage` in cloudLifetime.test.ts seals a key.
const seal = (text: string) => Buffer.from(`sealed:${text}`).toString("base64");
const unseal = (value: unknown) => {
  const text = typeof value === "string" ? Buffer.from(value, "base64").toString() : "";
  return text.startsWith("sealed:") ? text.slice("sealed:".length) : null;
};
const read = (files: Files, name: string) => {
  try {
    return fieldsOf(JSON.parse(files.get(name) ?? ""));
  } catch {
    return {};
  }
};
// The handles saved, and the one session an app before this one kept in the key's file, for that key's project.
const handlesIn = (files: Files): Record<string, unknown>[] => {
  const { entries } = entriesOf(read(files, SESSIONS_FILE).handles, (one) => fieldsOf(one));
  const { sessionId, projectId } = read(files, KEY_FILE);
  const project = unseal(projectId);
  return typeof sessionId === "string" && project ? [...entries, { id: sessionId, by: `browserbase:${project}` }] : entries;
};

// What the app couldn't read, so the user may let it go by forgetting the key: everything in a file it couldn't read, a
// session from before whose project or key doesn't open, and a handle whose key doesn't, by id and tag.
const unreadableIn = (files: Files, unread: Set<string>): string[] => {
  const saved = read(files, KEY_FILE);
  const kept = read(files, SESSIONS_FILE);
  const keys = fieldsOf(kept.keys);
  const { entries } = entriesOf(kept.handles, (one) => fieldsOf(one));
  const sealedAway = (one: Record<string, unknown>) => typeof one.keyId === "string" && !unseal(fieldsOf(keys[one.keyId]).apiKey);
  const lost = entries.filter((one) => unread.has(SESSIONS_FILE) || sealedAway(one));
  const before = unread.has(KEY_FILE) || !unseal(saved.projectId) || !unseal(saved.apiKey) ? [saved.sessionId] : [];
  return [...lost.flatMap((one) => [one.id, one.tag]), ...before].filter((one): one is string => typeof one === "string");
};

// Each Context saved, with the project it's kept for.
const contextsIn = (files: Files): [string, string][] => {
  const kept = Object.entries(read(files, SESSIONS_FILE).contexts ?? {}).flatMap(([by, id]): [string, string][] =>
    typeof id === "string" ? [[id, by.replace(/^browserbase:/, "")]] : [],
  );
  const { contextId, projectId } = read(files, KEY_FILE);
  const project = unseal(projectId);
  return typeof contextId === "string" && project ? [...kept, [contextId, project]] : kept;
};

// Whether a session can still be found from what's saved, by its id or the tag it was asked for with, through the
// provider and project that made it.
const findable = (files: Files, world: CloudWorld, id: string): boolean => {
  const tag = world.tagOf(id);
  const by = `browserbase:${world.projectOf(id)}`;
  return handlesIn(files).some((one) => one.by === by && (one.id === id || (tag !== undefined && one.tag === tag)));
};

// What's saved at the start of a run: a key, sealed.
const FIRST = (): Files => new Map([[KEY_FILE, JSON.stringify({ apiKey: seal("key-0"), projectId: seal("proj") })]]);

export const run = async (actions: Action[], { net, disk, makeCloud, reset }: Setup): Promise<Outcome> => {
  vi.clearAllTimers();
  reset();
  const world = new CloudWorld("key-0");
  net.connect = world.connect;
  net.attach = world.attach;
  vi.stubGlobal("fetch", world.fetch);
  disk.files = FIRST();
  disk.failsFor = 0;
  disk.readFails = new Set();
  disk.unread = new Set();
  const trace: string[] = [];
  let broken: string | null = null;
  const breaks = (rule: string, why: string) => {
    if (!IGNORED.includes(rule)) broken ??= `${rule}: ${why}`;
  };
  disk.onWrite = (name, text) => {
    // A launch that couldn't read a file that's there writes neither.
    if (disk.unread.size) breaks("wrote-unread", `${name} was written by a launch that couldn't read what was saved`);
    // A key goes to disk only sealed.
    for (const key of world.keys) if (text.includes(`"${key}"`)) breaks("key-in-plain", `${key} was written to ${name} as it is`);
    const next = new Map(disk.files).set(name, text);
    // A key is kept only while a handle made with it is.
    const kept = read(next, SESSIONS_FILE);
    const named = new Set(entriesOf(kept.handles, (one) => fieldsOf(one).keyId).entries);
    for (const id of Object.keys(fieldsOf(kept.keys)))
      if (!named.has(id)) breaks("key-kept-unused", `${id} was kept with no session made with it`);
    // Nothing running at Browserbase becomes impossible to find from the disk, even one whose key it no longer takes.
    for (const id of world.appRunning)
      if (findable(disk.files, world, id) && !findable(next, world, id))
        breaks("dropped-running-id", `${id} could no longer be found from the disk while it was still running`);
    // Each Context is kept for the project it was made in.
    for (const [contextId, projectId] of contextsIn(next))
      if (world.contexts.get(contextId) !== projectId)
        breaks("context-crossed-account", `${contextId}, made in ${world.contexts.get(contextId)}, was kept for ${projectId}`);
  };
  let count = 0;
  const next = () => ++count;
  // The user agreed to forget the key and what the app couldn't read, so that may go, and the app may write again.
  const forgetting = () => {
    for (const one of unreadableIn(disk.files, disk.unread)) world.letGo.add(one);
    disk.unread = new Set();
  };
  let app = new Launch(false, { world, breaks, makeCloud, forgetting });
  const runners = new Runners(world, breaks);
  await flush();

  // One answer. A limit that fails late may close its own page, and no other.
  const deliver = async (index: number, how: number): Promise<string> => {
    const open = world.tabs.filter(({ isClosed }) => !isClosed);
    world.failedLimit = null;
    const said = world.answer(index, how);
    await flush();
    const failed = world.failedLimit as { name: string } | null;
    for (const tab of open)
      if (failed && tab !== failed && tab.isClosed) breaks("wrong-page", `the late failure of ${failed.name}'s limit closed ${tab.name}`);
    return said;
  };
  const steps = runningSteps({ app: () => app, world, disk, runners, breaks, deliver, next });

  // The app is gone, with whatever it asked for unanswered, and launches again from what's on the disk. A Chrome it
  // started goes with it.
  const relaunch = async (local: boolean, readFails: string[] = []) => {
    await flush();
    world.lose();
    disk.unread = new Set();
    disk.readFails = new Set(readFails);
    // Its timers go with it. Clearing them puts the clock back too, so it's set again.
    const now = Date.now();
    vi.clearAllTimers();
    vi.setSystemTime(now);
    app.win.close();
    world.localRunning.forEach((name) => world.local.set(name, false));
    app = new Launch(local, { world, breaks, makeCloud, forgetting });
    disk.readFails.clear();
    const how = readFails.length
      ? `, and couldn't read ${readFails.join(" or ")}`
      : local
        ? ", with a Chrome on this computer standing in"
        : "";
    trace.push(`the app launches again${how}`);
    await flush();
  };

  // An app before this one is opened, with this key or one for another project, makes a session and a Context, keeps
  // them in the key's file as it did, and stops without ending it. Then this one is opened again.
  const downgrade = async ({ b }: Action) => {
    if (app.local) return;
    trace.push("the app stops without quitting");
    await flush();
    world.lose();
    // The key on the disk, which the app before this one opens, whatever this one could read.
    const saved = read(disk.files, KEY_FILE);
    const held = unseal(saved.apiKey);
    const key = b % 2 === 0 ? (held ?? "key-0") : `key-${next()}`;
    if (!world.projectOfKey(key)) world.accept(key, "proj-2");
    const { id, context } = world.before(key, saved.sessionId);
    const project = world.projectOfKey(key) ?? "";
    disk.files.set(KEY_FILE, JSON.stringify({ apiKey: seal(key), projectId: seal(project), contextId: context, sessionId: id }));
    trace.push(`the app before this one, with ${key} for ${project}, makes ${id} and keeps it, and stops`);
    await relaunch(false);
  };

  // The system's keychain changes, so nothing sealed opens any more: the key, its project, and the keys kept with the
  // sessions, which then only a key for their project can end. The app launches again without them, and the user saves
  // the same key again, as often as it takes while saves fail, or forgets it.
  const keychainReset = async ({ a }: Action) => {
    const key = app.cloud.key();
    const project = key ? world.projectOfKey(key) : undefined;
    if (app.local || !key || !project || !disk.files.has(KEY_FILE)) return;
    const sealedAway = (fields: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, ["apiKey", "projectId"].includes(name) ? DAMAGED : value]));
    const before = read(disk.files, KEY_FILE);
    if (typeof before.sessionId === "string") world.letGo.add(before.sessionId);
    disk.files.set(KEY_FILE, JSON.stringify(sealedAway(before)));
    const kept = read(disk.files, SESSIONS_FILE);
    const keys = Object.fromEntries(Object.entries(fieldsOf(kept.keys)).map(([id, one]) => [id, sealedAway(fieldsOf(one))]));
    if (disk.files.has(SESSIONS_FILE)) disk.files.set(SESSIONS_FILE, JSON.stringify({ ...kept, keys }));
    world.allProjects.forEach((one) => world.unheld.add(one));
    trace.push("the system's keychain changes, and the app stops without quitting");
    await relaunch(false);
    if (a % 2 === 0) {
      trace.push("Settings: Forget");
      app.forget();
      await flush();
      return;
    }
    for (let tries = 0; tries < 4 && app.cloud.key() !== key; tries++) {
      trace.push(`Settings: save ${key} again`);
      app.ending(app.cloud.tabs.saveKey(key, project));
      await flush();
    }
  };

  // Every answer, each one working, until there are none left.
  const drain = async () => {
    await flush();
    for (let i = 0; i < 500 && world.pending.length; i++) trace.push(`  ${await deliver(0, WORKS)}`);
  };

  // Three minutes, once everything on its way has come back.
  const idle = async () => {
    await drain();
    vi.advanceTimersByTime(IDLE);
    await flush();
    await drain();
  };

  // Quit holds the app for a few answers at most, which needn't be a Chrome on this computer starting, or a connection
  // being prepared. Anything still running then must end on the next launch, even a create that lands after that launch
  // has looked for it.
  const quit = async ({ a, b }: Action) => {
    trace.push("Quit");
    let done = false;
    quietly(app.cloud.quit().then(() => (done = true)));
    await flush();
    for (let k = 0; k < a % 8 && !done && world.pending.length; k++) trace.push(`  ${await deliver(b + k, (a + k) % 4)}`);
    trace.push("  the app is gone");
    for (const name of world.localRunning) breaks("local-left-running", `${name} is still running after the app has gone`);
    await relaunch(false);
    if (b % 2 === 0)
      for (let said = world.answerOf(["list"], 0, WORKS); said; said = world.answerOf(["list"], 0, WORKS)) {
        trace.push(`  ${said}, before anything on its way lands`);
        await flush();
      }
    trace.push("  every answer comes back, and three minutes pass");
    await drain();
    await idle();
    for (const id of world.runningWith(app.cloud.key()))
      breaks("quit-left-running", `${id} is still running after the next launch, which had nothing to end it by`);
  };

  // It still works, unless the key is gone: a new job gets a page, and lets go of it.
  const works = async () => {
    if (!app.win.open || app.jobs.size > 0 || (!app.local && !world.accepted.has(app.cloud.key() ?? ""))) return;
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
  // A launch that couldn't read what was saved changes nothing, so the user opens it again, and if it still can't, as
  // after the keychain changed, forgets the key.
  const reopen = async () => {
    if (disk.unread.size) {
      trace.push("Quit, and open it again");
      quietly(app.cloud.quit());
      await drain();
      await relaunch(false);
    }
    if (!app.cloud.tabs.state.unreadable) return;
    trace.push("Settings: Forget");
    app.forget();
    await flush();
  };

  const afterwards = async () => {
    disk.failsFor = 0;
    await reopen();
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
    for (const id of world.appRunning)
      if (!findable(disk.files, world, id)) breaks("orphan", `${id} is running and nothing has its id or tag, so it can never be released`);
    trace.push("a runner starts, and every answer comes back");
    runners.sweep();
    await drain();
    runners.check();
    const settled = () => !app.cloud.tabs.state.unreleased;
    if (broken) return;
    // Before any probe, since a job that lets go arms the timer again and would hide a session left without one.
    if (settled() && app.users() === 0 && world.runningWith(app.cloud.key()).length) {
      trace.push("three minutes pass with nobody using it");
      await idle();
      if (settled() && world.runningWith(app.cloud.key()).length)
        breaks("no-wind-down", `${world.runningWith(app.cloud.key()).join(", ")} is still running with nobody using it`);
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
    if (settled() && world.runningWith(app.cloud.key()).length)
      breaks("never-ends", `${world.runningWith(app.cloud.key()).join(", ")} is still running after everyone let go`);
    const { problem, canEnd } = app.cloud.tabs.state;
    if (!world.anyRunning && !canEnd && problem && STILL_RUNNING.test(problem))
      breaks("stale-problem", `Settings still says "${problem}" with nothing running`);
    if (!broken) await works();
  };

  // A project the app has a key for again can end its sessions again.
  const holding = () => {
    const key = unseal(read(disk.files, KEY_FILE).apiKey);
    const project = key ? world.projectOfKey(key) : undefined;
    if (project) world.unheld.delete(project);
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
    } else if (action.op === "keychainReset") {
      await keychainReset(action);
    } else if (action.op === "readFails") {
      trace.push("the app stops without quitting");
      await relaunch(false, [[KEY_FILE], [SESSIONS_FILE], [KEY_FILE, SESSIONS_FILE]][action.a % 3]);
    } else if (action.op === "downgrade") {
      await downgrade(action);
    } else {
      const said = NEEDS_WINDOW.includes(action.op) && !app.win.open ? null : await steps[action.op](action);
      await flush();
      if (said) trace.push(said);
    }
    holding();
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
