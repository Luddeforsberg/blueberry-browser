import { createHash } from "node:crypto";
import { modelConfig } from "../../src/main/chats/agent";
import { browserbase } from "../../src/main/cloud/browserbase";
import { CloudSessions } from "../../src/main/cloud/cloudBrowser";
import { NO_IDS } from "../../src/main/cloud/cloudProvider";
import { isLocalEndpoint, localChrome } from "../../src/main/cloud/localChrome";
import { DbError, dbConfig, runnerSession, supabaseDb, type ClaimedJob } from "./db";
import { runJob, sessionBrowser, UnreleasedBrowsers } from "./job";
import { pushConfig, pusher } from "./push";
import { quietConsole } from "./quietConsole";
import { RelayAddress, relayConfig, startRelay } from "./relay";
import { startDueRoutines } from "./routines";

quietConsole();

// The cloud runner: takes the user's queued jobs from Supabase one at a time and runs each in a Browserbase session on
// their own Context, so the sites they brought along are signed in. Every key comes from the environment, and nothing
// it logs holds a key, a cookie, a code, a page or a prompt: only job ids and how they went.

const POLL_MS = Number(process.env.BLUEBERRY_RUNNER_POLL_MS) || 5_000;

const fail = (words: string): never => {
  console.error(words);
  process.exit(1);
};

const config = dbConfig(process.env);
if (typeof config === "string") fail(config);
try {
  modelConfig();
} catch {
  fail("Set LLM_PROVIDER (openai or anthropic) and its key, OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}

// A Chrome on this machine instead of Browserbase, for trying the runner locally. Only ever one on 127.0.0.1.
const localExecutable = process.env.BLUEBERRY_RUNNER_CHROME;
const localEndpoint = process.env.BLUEBERRY_RUNNER_CDP;
if (localEndpoint && !isLocalEndpoint(localEndpoint)) fail("BLUEBERRY_RUNNER_CDP has to be on 127.0.0.1.");
const local = !!localExecutable || !!localEndpoint;
const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;
if (!local && (!apiKey || !projectId)) fail("Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.");

// The user's Context comes with each job, from the app. Without one, the runner makes one for itself and keeps it while
// it runs, so jobs at least share theirs.
let ownContext: string | null = process.env.BROWSERBASE_CONTEXT_ID || null;
// Every session this runner makes carries its mark, so one left by a runner that stopped without ending it is found and
// ended when it starts again. From the runner's own account, which is its alone, and never the address itself.
const mark = `runner-${createHash("sha256")
  .update(process.env.BLUEBERRY_RUNNER_EMAIL ?? "")
  .digest("hex")
  .slice(0, 16)}`;
const hosted = local ? null : browserbase({ apiKey: apiKey!, projectId: projectId!, mark });
const cloudBrowser = hosted ?? localChrome({ executable: localExecutable, endpoint: localEndpoint });
// A new session each job, ended with it.
const jobSessions = (contextId: string | null): CloudSessions =>
  new CloudSessions(
    cloudBrowser,
    { ...NO_IDS, contextId: contextId ?? ownContext },
    {
      onIds: (ids) => {
        if (!contextId) ownContext = ids.contextId;
      },
    },
  );

const settings = config as Exclude<typeof config, string>;
const db = supabaseDb(settings, runnerSession(settings));

// Notifications to the owner's phone, only with VAPID keys set.
const push = pushConfig(process.env);
if (typeof push === "string") fail(push);
const notify = push && typeof push !== "string" ? pusher(push, db) : undefined;
if (!notify) console.log("No VAPID keys, so no notifications go to the phone.");
// The relay, for ChatGPT and Claude, only with RELAY_PUBLIC_URL and RELAY_SECRET set.
const relay = relayConfig(process.env);
if (typeof relay === "string") fail(relay);
const relaySettings = relay && typeof relay !== "string" ? relay : null;
const relayAddress = new RelayAddress((url) => db.setRelayUrl(url));
if (relaySettings) {
  // Only an https address is shown in Settings, so one for trying it locally isn't sent.
  const url = relaySettings.origin.startsWith("https://") ? `${relaySettings.origin}/mcp` : null;
  // Cloud jobs go on without it. Only the words: the error could say more than the log should.
  void relayAddress
    .listen(() => startRelay(relaySettings, settings, db), url)
    .then(
      () => console.log(`Relay listening on port ${relaySettings.port}, for ChatGPT and Claude.`),
      () => console.error("Relay couldn't start, so Settings won't show its address."),
    );
} else {
  console.log("No RELAY_PUBLIC_URL and RELAY_SECRET, so ChatGPT and Claude can't connect.");
}

const unreleased = new UnreleasedBrowsers();
const shutdown = new AbortController();
let working: Promise<unknown> | null = null;
const quit = () => {
  if (shutdown.signal.aborted) return;
  console.log("Shutting down.");
  shutdown.abort();
  // One last try at anything left running at the provider.
  void (working ?? Promise.resolve()).then(() => unreleased.retry()).finally(() => process.exit(0));
};
process.on("SIGTERM", quit);
process.on("SIGINT", quit);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Until the owner has linked this runner in Blueberry, there's nothing it may do.
const LINK_RETRY_MS = 30_000;
const NOT_LINKED =
  "Not linked yet: its owner has to link this runner's account in Blueberry, in Settings > Cloud. Trying again in 30 seconds.";
let linked = false;
const link = async (): Promise<void> => {
  relayAddress.unlinked();
  try {
    linked = await db.accept();
  } catch (error) {
    linked = false;
    console.error(
      error instanceof DbError && error.status === 401
        ? "Couldn't sign in as the runner. Check BLUEBERRY_RUNNER_EMAIL and BLUEBERRY_RUNNER_PASSWORD."
        : error instanceof Error
          ? error.message
          : "Couldn't reach Supabase.",
    );
    return;
  }
  console.log(linked ? "Linked to its owner." : NOT_LINKED);
};

const loop = async () => {
  console.log(`Runner started, using ${local ? "a local Chrome" : "Browserbase"}.`);
  let unreachable = false;
  let routinesFailing = false;
  let addressFailing = false;
  // Until Browserbase confirms none is left from before, it asks again each time round, before any job of its own.
  let leftovers = hosted !== null;
  while (!shutdown.signal.aborted) {
    await unreleased.retry();
    if (leftovers && hosted) {
      leftovers = !(await hosted.releaseMarked().then(
        () => true,
        () => false,
      ));
      if (leftovers) console.error("Couldn't end the cloud sessions left from before. Trying again.");
    }
    if (!linked) {
      await link();
      if (!linked) {
        await sleep(LINK_RETRY_MS);
        continue;
      }
    }
    // Tried every round until Blueberry has the relay's address, as it is now. Nothing else depends on it.
    const shared = await relayAddress.share();
    if (!shared && !addressFailing) console.error("Couldn't share the relay's address with Blueberry. Trying again.");
    addressFailing = !shared;
    let job: ClaimedJob | null = null;
    let claimedAt = 0;
    try {
      // A routine that's due becomes a queued job first, so it's taken in turn like any other. Routines failing, as before
      // their migration has run, never stops jobs from being taken.
      const routineJobs = await startDueRoutines(db).catch((error: unknown) => {
        if (!routinesFailing) console.error(`Couldn't start routines: ${error instanceof Error ? error.message : "no answer"}`);
        routinesFailing = true;
        return null;
      });
      if (routineJobs) routinesFailing = false;
      routineJobs?.forEach((id) => console.log(`Job ${id}: started from a routine.`));
      claimedAt = Date.now();
      job = await db.claim();
      if (unreachable) console.log("Reached Supabase again.");
      unreachable = false;
    } catch (error) {
      if (error instanceof DbError && error.status === 403) {
        // Unlinked by its owner, so it asks again rather than working on anything.
        linked = false;
      } else {
        // Said once, not every few seconds.
        if (!unreachable) console.error(error instanceof Error ? error.message : "Couldn't reach Supabase.");
        unreachable = true;
      }
    }
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    const { id } = job;
    working = runJob(job, {
      db,
      claimedAt,
      browser: (contextId) => sessionBrowser(jobSessions(contextId)),
      signal: shutdown.signal,
      unreleased,
      notify,
    }).catch(() => console.error(`Job ${id}: the runner couldn't finish it.`));
    await working;
    working = null;
  }
};

void loop();
