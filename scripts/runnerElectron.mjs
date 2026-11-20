// Fails when anything the cloud runner loads reaches Electron, however indirectly: the runner is plain Node on Railway,
// with no Electron to load. Run by `pnpm run lint`. eslint.boundaries.mjs keeps Electron out of each file it can see,
// and this follows every import from runner/src/index.ts, as `pnpm run runner:build` bundles it, through src/main and
// src/shared, to name the chain that gets there.
//
// Packages stay outside the bundle, as in runner:build, so only our own code is followed. That's on purpose:
// playwright-core holds a lazy require of electron for its own Electron launcher, which the runner never calls.
import { build } from "esbuild";

const ELECTRON = /^electron(\/|$)|^@electron-toolkit\//;
const ENTRY = "runner/src/index.ts";

const { metafile } = await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
  metafile: true,
  logLevel: "error",
  outfile: "runner/dist/index.cjs",
});

// Who first imported each file, to walk back from Electron to the entry.
const importedBy = new Map();
for (const [file, { imports }] of Object.entries(metafile.inputs)) {
  for (const { path } of imports) if (!importedBy.has(path)) importedBy.set(path, file);
}
const chain = (file) => {
  const files = [file];
  while (importedBy.has(files[0]) && files[0] !== ENTRY) files.unshift(importedBy.get(files[0]));
  return files;
};

const reached = Object.entries(metafile.inputs).flatMap(([file, { imports }]) =>
  imports.filter(({ path }) => ELECTRON.test(path)).map(({ path }) => [...chain(file), path].join("\n  -> ")),
);

if (reached.length) {
  console.error(
    `The cloud runner reaches Electron, which it can't load. Take the import out of what the runner uses, or keep it behind\n` +
      `an adapter in window/, menus/, tabs/ or desktop/ that the runner never imports (eslint.boundaries.mjs):\n\n` +
      reached.map((line) => `  ${line}`).join("\n\n"),
  );
  process.exit(1);
}
