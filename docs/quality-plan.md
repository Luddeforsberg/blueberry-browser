# Merging the redesign, and the code-quality plan

Agreed with the user on 2026-11-18. The bar is the `foundations` skill. Each fix is its own `harden` change, and nothing changes what the app does. A real bug found on the way gets its own PR.

## Decisions
- **Order:** merge the redesign into `main` first, then clean up on `main` in small PRs, each from the latest `main`.
- **Style:** one Prettier style for the whole repo: 2 spaces, double quotes, semicolons, 140 columns. It's applied in one formatting-only commit, listed in `.git-blame-ignore-revs`.
- **Size:** at most 400 lines per file. Today's larger files start on a list of exceptions in the lint config that only shrinks.
- **CI:** CI runs exactly `pnpm run verify`, end-to-end tests included, and it's required on `main`.
- **Old names:** "bird" and "flock" go everywhere. That includes saved settings keys, the look's palette ids and the Supabase names, each through a migration that still reads the old names.

## Phases
0. **Freeze and record a baseline** on `t3/pips-all-next`, after Build 25:
   - Fix `showBerry.spec.ts:252` and the flaky `browser.spec.ts:471` and `:543`, and `desktopBerry.spec.ts`.
   - Add a feature map (every feature as data) and a `drive` command that screenshots each one in light and dark, in both layouts.
   - Record the baseline: those screenshots and a full end-to-end run.
   - Run `pnpm run verify` on a Mac, and have the user check the app.
1. **Merge** `redesign/pips-preview` into `main` as one PR, with a merge commit. The user merges it.
2. **Make lint mean something:**
   - Settle the style and run it over everything once.
   - Zero warnings (`--max-warnings 0`).
   - Inline disables are an error. Each of the 39 is fixed, or becomes a visible exception in the config.
   - Type-aware rules, such as floating promises and unsafe `any`.
   - Dead code fails, with `knip`.
   - Limits on file size and complexity.
   - **2b. Renames:**
     - One PR renames the code-only "bird" and "flock" names and files.
     - A check stops them coming back.
     - Then separate PRs, each with a migration and a Codex review: settings keys, palette ids, and the Supabase functions and tables. The Supabase PR keeps the old functions working for a while, and the phone page and runner are redeployed.
3. **Folders and import rules:**
   - `src/main` is split by job.
   - A boundary check holds the rules AGENTS.md states in prose: the tool layer never imports Electron, preloads only `import type`, and there's no route to cookies, recordings or the account.
4. **Split the big files by job,** one PR each:
   - The files: `Window.ts`, `Chats.ts`, `browserTools.ts` and `ipc.ts` first, then the rest over 400 lines.
   - Each PR only moves or extracts code. Add tests before a split where coverage is thin.
   - Codex reviews anything near permissions or approvals.
5. **Types and fences:**
   - Go through the `as unknown as` casts, and parse outside data where it enters.
   - Raw `fetch`, timers and effects are written in one place each, with a lint message pointing there.
6. **CI runs `verify`,** end-to-end tests included, and it's required on `main`.
7. **AGENTS.md down to about 60 lines.** The walkthrough moves into `docs/ARCHITECTURE.md`, and every "never do X" line is a check or gone.

Every PR goes through `self-check`, proof against the baseline, `pnpm run verify`, Codex review where it touches what Berry may do, and `file-pr`. The user merges.

## Starting numbers (2026-11-18, `t3/pips-all-next` at 73f3da0)
- **The redesign:** 177 commits, 359 files changed, +39,979 / −10,415 lines. `main` hasn't moved since the branch point.
- **Lint:** 0 errors and 24,189 warnings: 24,129 Prettier, 56 `react-refresh/only-export-components` and 3 `react-hooks/exhaustive-deps`.
- **Escape hatches:** 39 `eslint-disable`, 121 `as unknown as`, 9 `any`, and 6 raw `fetch(` outside tests.
- **Effects and timers:** 141 `useEffect` and 24 `setTimeout` in the renderer.
- **Size:** 24 source files over 400 lines. The biggest are `Window.ts` (1,799), `Chats.ts` (1,450), `browserTools.ts` (1,327) and `ipc.ts` (1,176). `src/main` has 149 files in one folder.
- **Old names:** about 730 uses of "bird" and "flock", and 13 file names.
- **AGENTS.md:** about 9,400 words.

## The audit (2026-11-18)

This is the `foundations` audit of the preview branch at `581637f`. The full report is in the T3 thread "Foundations audit of the redesign".

**Scores:** 0 of the 12 items fully hold.
- **Partly:** folders, types, dead code, `verify`, tests and the UI kit.
- **Missing:** lint, fences, size limits, formatting, the feature map and a short AGENTS.md.

**Findings that change the plan:**
- **Formatting depends on the machine.** With no config, the Prettier warning count differs by machine (24k to 42k). The format-all change touches 435 of 471 code files: +50,504 and −40,408 lines.
- **About 1,350 lines of page code are never checked.** They're JavaScript in template strings in `pageScripts.ts`, `pageActorScript.ts` and `recorderScript.ts`. They become typed modules, bundled at build (step 13).
- **The end-to-end tests ran on GitHub's macOS and Windows runners** in November. 15 failed, which points at reduced motion on the runner images rather than a missing screen. `tests/background.cjs` isn't loaded in CI, so CI runs a different app than a local run.
- **`noImplicitAny` is off**, inherited from the electron-toolkit tsconfig. Turning it on costs 0 errors.
- **`main` has no branch protection.**
- **Saved and public names:** the public site `blueberry-flock.netlify.app` would break shared links if renamed, so it needs the user's call. The palette ids become the berry names (`blueberry`, `lingon`, `cloudberry`, `gooseberry`, `raspberry`, `currant`).

**Order after the merge.** Each step is a PR, risk in brackets.
1. Prettier config and `format:check` (low).
2. The format-all commit (low).
3. Remove the 35 triple-slash disables (low).
4. Zero warnings, and inline disables are errors (medium).
5. Compiler flags that cost 0 errors (low).
6. `knip` (low).
7. Size and complexity limits, with a list of exceptions that only shrinks (low).
8. Code-only rename, plus a check against "bird" and "flock" (low).
9. Renames in saved formats, with migrations (medium).
10. Server and model-facing renames (high, Codex).
11. `src/main` into folders (medium).
12. Boundary rules (low).
13. Page code out of template strings (high).
14. Split `browserTools.ts` (high, Codex).
15. Split `Chats.ts` (high, Codex).
16. Split `Window.ts` (medium).
17. Split `ipc.ts` (low).
18. The other files over 400 lines.
19. `exactOptionalPropertyTypes`, then `noUncheckedIndexedAccess` (medium).
20. Type-aware lint, one rule at a time (medium).
21. Fences: SQL, `fetch`, effects and timers, the UI kit (medium).
22. End-to-end tests in CI, and protect `main` (medium).
23. AGENTS.md down to about 60 lines (low).
