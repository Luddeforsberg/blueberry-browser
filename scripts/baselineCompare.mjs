// `pnpm run baseline:compare <old> <new>` compares two baselines from `pnpm run baseline`, picture by picture. It writes
// an HTML report with old, new and the difference side by side for each picture that changed, and lists the ones only
// one side has. It exits with 1 when anything differs, so a refactor that should look the same can be checked.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// How far a pixel's colour may move before it counts, from 0 to 1. pixelmatch also skips pixels it finds to be
// anti-aliasing, which is the rest of the tolerance. tests/features/capture.ts waits for a window to rest by the same
// measure, so keep the two the same.
const THRESHOLD = 0.1;

const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const [oldArg, newArg, ...rest] = process.argv.slice(2).filter((arg, at) => !(at === 0 && arg === "--"));
if (!oldArg || !newArg || rest.length) fail("Usage: pnpm run baseline:compare <old baseline folder> <new baseline folder>");
const [before, after] = [resolve(oldArg), resolve(newArg)];

const manifest = (folder) => {
  const file = join(folder, "manifest.json");
  if (!existsSync(file)) fail(`${folder} has no manifest.json, so it isn't a baseline.`);
  return JSON.parse(readFileSync(file, "utf8"));
};
const [oldManifest, newManifest] = [manifest(before), manifest(after)];
const oldFiles = new Map(oldManifest.shots.map((shot) => [shot.file, shot]));
const newFiles = new Map(newManifest.shots.map((shot) => [shot.file, shot]));

const report = join(after, `compare-to-${basename(before)}`);
rmSync(report, { recursive: true, force: true });
mkdirSync(report, { recursive: true });

const changed = [];
let same = 0;
for (const [file] of newFiles) {
  if (!oldFiles.has(file)) continue;
  const a = PNG.sync.read(readFileSync(join(before, file)));
  const b = PNG.sync.read(readFileSync(join(after, file)));
  if (a.width !== b.width || a.height !== b.height) {
    changed.push({ file, pixels: null, why: `${a.width}×${a.height} became ${b.width}×${b.height}` });
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD });
  if (pixels === 0) {
    same++;
    continue;
  }
  writeFileSync(join(report, file), PNG.sync.write(diff));
  changed.push({ file, pixels, why: `${pixels.toLocaleString("en")} pixels` });
}
const missing = [...oldFiles.keys()].filter((file) => !newFiles.has(file));
const added = [...newFiles.keys()].filter((file) => !oldFiles.has(file));

const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const link = (folder, file) => escape(relative(report, join(folder, file)).replaceAll("\\", "/"));
const picture = (label, src) =>
  `<figure><figcaption>${label}</figcaption><a href="${src}"><img src="${src}" alt="${label}" loading="lazy"></a></figure>`;
const list = (title, files, folder) =>
  files.length
    ? `<h2>${title} (${files.length})</h2><ul>${files.map((file) => `<li><a href="${link(folder, file)}">${escape(file)}</a></li>`).join("")}</ul>`
    : "";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Baseline comparison</title>
<style>
:root{color-scheme:light dark;--ink:#1b1b1e;--ground:#fafafa;--line:#ddd}
@media (prefers-color-scheme:dark){:root{--ink:#f2f2f3;--ground:#161618;--line:#333}}
body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:var(--ink);background:var(--ground)}
section{border-top:1px solid var(--line);padding:16px 0}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
figure{margin:0}figcaption{font-size:12px;opacity:.7;margin-bottom:4px}img{width:100%;border:1px solid var(--line)}
code{font-size:13px}
</style></head><body>
<h1>Baseline comparison</h1>
<p><code>${escape(oldManifest.commit)}</code> (${escape(before)}) against <code>${escape(newManifest.commit)}</code> (${escape(after)})</p>
<p>${changed.length} changed, ${missing.length} missing, ${added.length} new, ${same} the same.</p>
${changed
  .map(
    ({ file, why }) =>
      `<section><h2>${escape(file)}</h2><p>${escape(why)}</p><div class="row">${picture("Old", link(before, file))}${picture("New", link(after, file))}${
        existsSync(join(report, file)) ? picture("Difference", escape(file)) : ""
      }</div></section>`,
  )
  .join("\n")}
${list("Missing from the new baseline", missing, before)}
${list("New in the new baseline", added, after)}
</body></html>`;
writeFileSync(join(report, "index.html"), html);

console.log(`${changed.length} changed, ${missing.length} missing, ${added.length} new, ${same} the same.`);
for (const { file, why } of changed) console.log(`  changed: ${file} (${why})`);
for (const file of missing) console.log(`  missing: ${file}`);
for (const file of added) console.log(`  new: ${file}`);
console.log(`Report: ${pathToFileURL(join(report, "index.html")).href}`);
process.exit(changed.length || missing.length || added.length ? 1 : 0);
