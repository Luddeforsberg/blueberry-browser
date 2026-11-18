// `pnpm run drive -- <feature> [--state s] [--theme light|dark] [--layout vertical|horizontal] [--width n] [--out dir]`
// opens one feature from tests/features/map.ts in the built app and saves a picture of it.
// `pnpm run baseline [dir]` pictures every feature in every state, light and dark, in each layout that changes it, into
// dir (baselines/<commit> by default), with a manifest.json. Neither builds: run `pnpm exec electron-vite build` first.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// pnpm passes on the `--` before a command's own arguments.
const [mode, ...args] = process.argv.slice(2).filter((arg, at) => !(at === 1 && arg === "--"));

const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const option = (name, allowed) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value.`);
  if (allowed && !allowed.includes(value)) fail(`--${name} is one of: ${allowed.join(", ")}.`);
  args.splice(at, 2);
  return value;
};

if (!existsSync(join(root, "out", "main", "index.js"))) fail("There's no build in out/. Run `pnpm exec electron-vite build` first.");
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
// Pictures from a working tree with changes aren't that commit's, so the manifest says so.
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim() !== "";
const label = dirty ? `${commit}+changes` : commit;

let request;
let workers = 1;
if (mode === "drive") {
  const state = option("state");
  const theme = option("theme", ["light", "dark"]);
  const layout = option("layout", ["vertical", "horizontal"]);
  const width = option("width");
  if (width !== undefined && !/^\d+$/.test(width)) fail("--width is a number of pixels.");
  const out = resolve(option("out") ?? join(root, "baselines", "drive"));
  const [feature, ...rest] = args;
  if (!feature || rest.length) fail("Usage: pnpm run drive -- <feature> [--state s] [--theme light|dark] [--layout vertical|horizontal] [--width n] [--out dir]");
  request = { out, commit: label, feature, state, theme, layout, width: width === undefined ? undefined : Number(width) };
} else if (mode === "baseline") {
  workers = Number(option("workers") ?? 3);
  if (!Number.isInteger(workers) || workers < 1) fail("--workers is a whole number from 1.");
  if (args.length > 1) fail("Usage: pnpm run baseline [dir] [--workers n]");
  const out = resolve(args[0] ?? join(root, "baselines", commit));
  // A baseline is all of one run, so it starts in an empty folder or replaces an earlier baseline.
  if (existsSync(out) && readdirSync(out).length && !existsSync(join(out, "manifest.json"))) fail(`${out} has files that aren't a baseline. Choose another folder.`);
  rmSync(out, { recursive: true, force: true });
  request = { out, commit: label };
} else {
  fail("Run `pnpm run drive -- <feature>` or `pnpm run baseline [dir]`.");
}

mkdirSync(request.out, { recursive: true });
const started = Date.now();
const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const env = { ...process.env, BLUEBERRY_DRIVE: JSON.stringify(request), BLUEBERRY_DRIVE_WORKERS: String(workers) };
const run = spawnSync(process.execPath, [cli, "test", "-c", join(root, "tests", "features", "drive.config.ts")], { cwd: root, env, stdio: "inherit" });
if (mode === "baseline") console.log(`Baseline in ${request.out}, ${Math.round((Date.now() - started) / 1000)}s`);
process.exit(run.status ?? 1);
