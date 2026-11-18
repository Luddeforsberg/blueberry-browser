// Fails when "bird" or "flock", the old names for the mascots, shows up in a file's name or text, in any case and as any
// part of a word. Run by `pnpm run lint`. It reads every file git tracks or would track, so a new file counts before
// it's added. Code says "mascot" or "mascots", or "Berry" where it means Berry.
//
// What's left is saved on disk, sent to a server, read by a model or an app, or public, so it can't change without a
// migration. Each is listed below with the step of docs/quality-plan.md that renames it: 9 for saved formats, 10 for
// server- and model-facing names. An entry whose text is no longer in its file fails too, so this list only shrinks.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const OLD = /bird|flock/i;

// Whole files that keep the old words, and why. None of them is code that runs.
const UNCHECKED = [
  { path: "scripts/oldNames.mjs", why: "This check, which has to name them." },
  { path: "pnpm-lock.yaml", why: "Generated, and `bluebird` is a package of someone else's." },
  { path: "docs/quality-plan.md", why: "The plan for this rename, which has to name the old words." },
  { path: /^docs\/design\//, why: "Design history: the old document and the mocks, kept as they were made." },
  { path: /^evals\/results\//, why: "Records of past eval runs, in the words of the time." },
  { path: "evals/fixtures/article.html", why: "A news article about real jackdaws, which evals load as it is." },
  { path: /^supabase\/migrations\//, why: "Applied migrations are never edited. Step 10 renames in a new migration." },
];

const entries = (until, text, why, files) => files.map((file) => ({ file, text, until, why }));
const saved = (text, why, ...files) => entries(9, text, why, files);
const external = (text, why, ...files) => entries(10, text, why, files);

const PAGE_ID = "The internal page's id, saved with each tab in session.json.";
const SERVER = "A Supabase name, in the migrations and on the server.";
const MODEL = "Read by the model, or by ChatGPT, Claude or another app over MCP.";
const ROW = "An error written to a job's row on the server, which ChatGPT and Claude read through get_job.";
const SITE = "The public site's address and share picture, which links and link previews have saved.";
const COPY = "The public site's own words, deployed with its address.";

// The exact text that may stay in each file, case and all.
const ALLOWED = [
  ...saved(
    "birdOnPages",
    "A key in settings.json.",
    "src/main/SettingsStore.ts",
    "src/main/SettingsStore.test.ts",
    "src/main/Window.ts",
    "src/renderer/chrome/src/pages/SettingsPage.tsx",
    "src/shared/ipc.ts",
    "tests/browser.spec.ts",
    "tests/mascotOnPage.spec.ts",
  ),
  ...saved(
    '"flock"',
    PAGE_ID,
    "src/main/InternalTab.ts",
    "src/main/Menu.ts",
    "src/main/Session.ts",
    "src/main/Window.ts",
    "src/renderer/chrome/src/components/TabIcon.tsx",
    "src/renderer/chrome/src/mascotsView.ts",
    "src/renderer/chrome/src/pages/InternalPageView.tsx",
    "src/shared/ipc.ts",
    "tests/features/map.ts",
    "tests/mascotGallery.spec.ts",
    "tests/mascotLimits.spec.ts",
    "tests/mascotsPage.spec.ts",
    "tests/memory.spec.ts",
    "tests/publishing.spec.ts",
  ),
  ...saved(
    'flock: "Your mascots"',
    PAGE_ID,
    "src/main/InternalTab.ts",
    "src/renderer/chrome/src/addressSuggestions.ts",
    "src/renderer/chrome/src/components/AddressBar.tsx",
  ),
  ...saved('"blueberry.bird"', "The phone page's key in the browser's localStorage.", "site/app/state.js"),

  ...external(
    "sync_cloud_flock",
    SERVER,
    "AGENTS.md",
    "runner/src/relay.test.ts",
    "src/main/galleryServer.ts",
    "supabase/phone.test.ts",
    "tests/fakeSupabase.ts",
    "tests/features/map.ts",
    "tests/phone.spec.ts",
  ),
  ...external(
    "cloud_flock",
    SERVER,
    "AGENTS.md",
    "site/app/api.js",
    "src/shared/phoneApi.test.ts",
    "supabase/phone.test.ts",
    "supabase/relay.test.ts",
    "tests/fakeSupabase.ts",
  ),
  ...external("relay_flock", SERVER, "runner/src/db.ts", "supabase/relay.test.ts", "tests/fakeSupabase.ts"),
  ...external("p_birds", SERVER, "runner/src/relay.test.ts", "src/main/galleryServer.ts", "tests/features/map.ts", "tests/phone.spec.ts"),
  ...external("runner has no flock", "An error the server raises.", "supabase/phone.test.ts"),

  ...external("Its birds (the flock)", MODEL, "runner/src/relay.ts"),
  ...external("List the flock", MODEL, "runner/src/relayTools.ts", "src/main/mcpTools.ts"),
  ...external("The user's birds (agents)", MODEL, "runner/src/relayTools.ts"),
  ...external("Give a bird a job", MODEL, "runner/src/relayTools.ts"),
  ...external("one of the user\\'s birds", MODEL, "runner/src/relayTools.ts"),
  ...external("what the bird may do", MODEL, "runner/src/relayTools.ts"),
  ...external("The bird's name or id", MODEL, "runner/src/relayTools.ts"),
  ...external("the bird's own", MODEL, "runner/src/relayTools.ts"),
  ...external("There's no bird called", MODEL, "runner/src/relayTools.ts"),
  ...external("(the flock)", MODEL, "src/main/McpConnector.ts"),
  ...external('name: "The flock"', MODEL, "src/main/mcpTools.ts"),
  ...external("let their birds remember", MODEL, "src/main/mcpTools.ts"),
  ...external("What the birds remember", MODEL, "src/main/mcpTools.ts"),
  ...external("the small birds", MODEL, "src/main/suggestionProposals.ts"),
  ...external('"flock": the helper birds', MODEL, "src/main/suggestionProposals.ts"),
  ...external("a bird of its own", MODEL, "src/main/suggestionProposals.ts"),
  ...external("a helper bird", MODEL, "src/main/suggestionProposals.ts"),
  ...external("not one in the flock", MODEL, "src/main/suggestionProposals.ts"),
  ...external("what the bird says", MODEL, "src/main/suggestionProposals.ts"),
  ...external("flock: mascotData", `${MODEL} The digest's key for the mascots.`, "src/main/suggestionDigest.ts"),
  ...external("routines, flock, feedback", "The digest's key, as above.", "src/main/suggestionDigest.test.ts"),
  ...external("expect(flock)", "The digest's key, as above.", "src/main/suggestionDigest.test.ts"),

  ...external("The bird this job was sent as", ROW, "runner/src/job.ts"),
  ...external("That bird isn't", ROW, "src/main/MacJobs.ts"),
  ...external("This job's bird", ROW, "src/main/MacJobs.ts"),

  ...external("blueberry-flock.netlify.app", SITE, "site/index.html", "site/m/index.html", "src/main/mascotLink.test.ts"),
  ...external("flock.png", SITE, "site/flock.png", "site/index.html", "site/m/index.html", "scripts/buildSite.mjs"),
  ...external("a flock of birds", COPY, "site/index.html"),
  ...external("Six birds from Blueberry", COPY, "site/index.html", "site/m/index.html"),
  ...external("Some of the flock", COPY, "site/index.html"),
  ...external("Grow a flock.", COPY, "site/index.html"),
  ...external("Make a bird for", COPY, "site/index.html"),
  ...external("The tabs a bird opens", COPY, "site/index.html"),
  ...external("Share a bird.", COPY, "site/index.html"),
  ...external("this bird for Blueberry", COPY, "site/m/index.html"),
  ...external("A bird called", COPY, "site/m/mascot.js"),

  // Real birds, not mascots. The feature map pictures this page, so renaming it would change a baseline picture.
  ...entries(null, '"birds.example", "/birds"', "A page about jackdaws.", ["tests/features/map.ts"]),
  ...entries(null, '"/birds": page("Birds", "<h1>Birds</h1>', "A page about jackdaws.", ["tests/features/site.ts"]),
];

const unchecked = (file) => UNCHECKED.some(({ path }) => (typeof path === "string" ? path === file : path.test(file)));

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => file && existsSync(file));

const allowedIn = new Map();
for (const entry of ALLOWED) allowedIn.set(entry.file, [...(allowedIn.get(entry.file) ?? []), entry]);

// Takes out what's allowed, longest first so `sync_cloud_flock` goes before `cloud_flock`, and notes which were used.
const strip = (text, allowed, used) =>
  [...allowed]
    .sort((a, b) => b.text.length - a.text.length)
    .reduce((rest, entry) => {
      if (!rest.includes(entry.text)) return rest;
      used.add(entry);
      return rest.split(entry.text).join("");
    }, text);

const problems = [];
const used = new Set();
for (const file of new Set(files)) {
  if (unchecked(file)) continue;
  const allowed = allowedIn.get(file) ?? [];
  if (OLD.test(strip(file, allowed, used))) problems.push(`${file}: the file's name`);
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8000).includes(0)) continue;
  bytes
    .toString("utf8")
    .split(/\r?\n/)
    .forEach((line, at) => {
      const rest = strip(line, allowed, used);
      const word = rest.match(/[\w$-]*(?:bird|flock)[\w$-]*/i);
      if (word) problems.push(`${file}:${at + 1}: ${word[0]}`);
    });
}

const stale = ALLOWED.filter((entry) => !used.has(entry) && !unchecked(entry.file));
for (const { file, text } of stale) problems.push(`${file}: "${text}" is listed in scripts/oldNames.mjs but isn't there any more`);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? "" : "s"}. "bird" and "flock" are the old names for the mascots: ` +
      'say "mascot" or "mascots", or "Berry" where it means Berry. Something saved, sent to a server, read by a model or ' +
      "public can't be renamed here. List it in ALLOWED in scripts/oldNames.mjs with the step that renames it, and remove " +
      "a line there once its text is gone.",
  );
  process.exit(1);
}
