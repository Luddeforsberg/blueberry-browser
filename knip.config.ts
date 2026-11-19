import type { KnipConfig } from "knip";

// The static pages in site/ and the chrome's index.html load their scripts and stylesheets with tags, which knip
// doesn't read. This turns each tag into an import, so knip follows them from the page as a browser does. It also
// covers the chrome's page on Windows, where knip's electron-vite plugin resolves its script from the wrong folder.
const tagSources = /<(?:script|link)\b[^>]*?\b(?:src|href)="(\.[^"]+\.(?:js|ts|tsx|css))"/g;
const html = (text: string): string => [...text.matchAll(tagSources)].map(([, source]) => `import "${source}";`).join("\n");

const config: KnipConfig = {
  compilers: { html },
  entry: [
    // Run by package.json scripts through `electron`, which knip doesn't read as a script runner.
    "scripts/appIcon.mjs",
    // Run by name with `pnpm dlx tsx`, as evals/README.md says.
    "evals/seedBrowserFolder.ts",
    "evals/suggestionsCheck.ts",
    // Loaded by path into the test app's main process: tests/app.ts and tests/features/driver.ts.
    "tests/*.cjs",
    "tests/features/*.cjs",
    // Each export is bundled by itself into src/main/pageCode.ts by scripts/buildPage.mjs, which reads this file as text.
    "src/page/index.ts",
    // The public site and the phone page, static pages with no build.
    "site/**/*.html",
    // Registered by site/app/push.js with `serviceWorker.register("./sw.js")`, a string, not an import.
    "site/app/sw.js",
  ],
  ignore: [
    // Design mocks, opened by hand in a browser. They aren't part of anything that runs.
    "docs/design/mocks/**",
    // Pages the evals serve by folder (evals/run.spec.ts), with no scripts of their own.
    "evals/fixtures/**",
  ],
  ignoreIssues: {
    // SHIPPED_ICON_SIZE is imported by scripts/appIcon.mjs inside the page code it hands esbuild as a string.
    "src/shared/appIcon.ts": ["exports"],
    // pipOpacities is imported by scripts/buildSite.mjs inside the code it hands esbuild as a string.
    "src/renderer/common/components/pipPatterns.ts": ["exports"],
  },
  playwright: {
    // tests/features/drive.config.ts is run by scripts/drive.mjs with `-c`, which knip can't see in a spawn.
    config: ["playwright.config.ts", "evals/playwright.config.ts", "tests/features/drive.config.ts"],
  },
};

export default config;
