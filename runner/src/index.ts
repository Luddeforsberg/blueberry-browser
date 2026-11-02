import { modelConfig } from "../../src/main/agent";
import { browserbase } from "../../src/main/browserbase";
import { CloudSessions, type CloudBrowser } from "../../src/main/cloudBrowser";
import { isLocalEndpoint, localChrome } from "../../src/main/localChrome";
import { dbConfig, supabaseDb, type ClaimedJob } from "./db";
import { runJob, sessionBrowser } from "./job";

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
const cloudBrowser = (contextId: string | null): CloudBrowser =>
  local
    ? localChrome({ executable: localExecutable, endpoint: localEndpoint })
    : browserbase({
        apiKey: apiKey!,
        projectId: projectId!,
        // A new session each job, ended with it.
        saved: { contextId: contextId ?? ownContext, sessionId: null },
        onSaved: (saved) => {
          if (!contextId) ownContext = saved.contextId;
        },
      });

const db = supabaseDb(config as Exclude<typeof config, string>);
const shutdown = new AbortController();
let working: Promise<unknown> | null = null;
const quit = () => {
  if (shutdown.signal.aborted) return;
  console.log("Shutting down.");
  shutdown.abort();
  void (working ?? Promise.resolve()).finally(() => process.exit(0));
};
process.on("SIGTERM", quit);
process.on("SIGINT", quit);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loop = async () => {
  console.log(`Runner started, using ${local ? "a local Chrome" : "Browserbase"}.`);
  let unreachable = false;
  while (!shutdown.signal.aborted) {
    let job: ClaimedJob | null = null;
    try {
      job = await db.claim();
      if (unreachable) console.log("Reached Supabase again.");
      unreachable = false;
    } catch (error) {
      // Said once, not every few seconds.
      if (!unreachable) console.error(error instanceof Error ? error.message : "Couldn't reach Supabase.");
      unreachable = true;
    }
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    const { id } = job;
    working = runJob(job, {
      db,
      browser: (contextId) => sessionBrowser(new CloudSessions(cloudBrowser(contextId))),
      signal: shutdown.signal,
    }).catch(() => console.error(`Job ${id}: the runner couldn't finish it.`));
    await working;
    working = null;
  }
};

void loop();
