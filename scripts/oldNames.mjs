// Fails when "bird" or "flock", the old names for the mascots, shows up in a file's name or text, in any case and as any
// part of a word. Run by `pnpm run lint`. It reads every file git tracks or would track, so a new file counts before
// it's added. Code says "mascot" or "mascots", or "Berry" where it means Berry.
//
// What's left is listed below with why. Names saved on disk were renamed in step 9, and server and model-facing names in
// step 10, so only the code that reads old saved data and the old server names that still answer clients from before
// still say them. An entry whose text is no longer in its file fails too, so this list only
// shrinks.
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
  { path: /^supabase\/migrations\//, why: "Applied migrations are never edited, so each keeps the names of its time." },
];

const entries = (until, text, why, files) => files.map((file) => ({ file, text, until, why }));
// An old name in data an older version saved, read by the migration that moves it to the new name, in that file and its
// test only. Kept for good, since old data can turn up at any time.
const migrated = (text, why, ...files) => entries(null, text, why, files);
// An old Supabase name that supabase/migrations/20261120000000_mascot_names.sql keeps answering for clients from before,
// named only in tests. They go when the wrappers do, as step 10 of docs/quality-plan.md says.
const wrapped = (text, ...files) => entries("wrappers", text, WRAPPED, files);

const WRAPPED = "An old Supabase name, kept working for clients from before until the wrappers go.";

// The exact text that may stay in each file, case and all.
const ALLOWED = [
  ...migrated(
    "birdOnPages",
    "The old key in settings.json.",
    "src/main/settings/SettingsStore.ts",
    "src/main/settings/SettingsStore.test.ts",
    "tests/session.spec.ts",
  ),
  ...migrated(
    '"flock"',
    "The mascots' page's old id, saved with its tab in session.json.",
    "src/main/tabs/Session.ts",
    "src/main/tabs/Session.test.ts",
    "tests/session.spec.ts",
  ),
  ...migrated(
    '"blueberry.bird"',
    "The phone page's old key in the browser's sessionStorage.",
    "site/app/state.js",
    "src/shared/phoneState.test.ts",
  ),

  ...wrapped("sync_cloud_flock", "supabase/mascotNames.test.ts"),
  ...wrapped("cloud_flock", "supabase/mascotNames.test.ts"),
  ...wrapped("relay_flock", "supabase/mascotNames.test.ts", "supabase/relay.test.ts"),
  ...wrapped("p_birds", "supabase/mascotNames.test.ts"),
  ...entries(null, "cloud_flock", "The table's name before the rename, in the test of the migration before it.", [
    "supabase/berryPalettes.test.ts",
  ]),

  ...entries(null, "/flock.png", "The share picture's old address, redirected to its new one for link previews made before.", [
    "netlify.toml",
  ]),

  // Real birds, not mascots. The feature map pictures this page, so renaming it would change a baseline picture.
  ...entries(null, '"birds.example", "/birds"', "A page about jackdaws.", ["tests/features/map/window.ts"]),
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
