# Merging the redesign, and the code-quality plan

Agreed with the user on 2026-11-18. The bar is the `foundations` skill. Each fix is its own `harden` change, and nothing changes what the app does. A real bug found on the way gets its own PR.

## Decisions
- **Order:** merge the redesign into `main` first, then clean up on `main` in small PRs, each from the latest `main`.
- **Style:** one Prettier style for the whole repo: 2 spaces, double quotes, semicolons, 140 columns. It's applied in one formatting-only commit, listed in `.git-blame-ignore-revs`.
- **Size:** at most 400 lines per file. Today's larger files start on a list of exceptions in the lint config that only shrinks.
- **CI:** CI runs exactly `pnpm run verify`, end-to-end tests included, and it's required on `main`.
- **Old names:** "bird" and "flock" go everywhere. That includes the public site address `blueberry-flock.netlify.app`, with a redirect from the old one so shared links keep working. It also includes saved settings keys, the look's palette ids and the Supabase names, each through a migration that still reads the old names.

## Phases
0. **Freeze and record a baseline** on `t3/pips-all-next`, after Build 25:
   - Fix `showBerry.spec.ts:252` and the flaky `browser.spec.ts:471` and `:543`, and `desktopBerry.spec.ts`.
   - Add a feature map (every feature as data) and a `drive` command that screenshots each one in light and dark, in both layouts. Done: `tests/features/map.ts`, `pnpm run drive -- <feature>`, and `tests/featureMap.spec.ts`, which opens each feature once.
   - Record the baseline: those screenshots and a full end-to-end run. `pnpm run baseline` writes them to `baselines/<commit>` (kept out of git), and every later PR runs it again and shows `pnpm run baseline:compare <old> <new>` reporting no differences, or only the ones it meant.
   - Recorded on Windows at `fb6d060` (Builds 26 and 27 merged): 302 pictures, the same as Build 27's own, and a full end-to-end run with 172 passed, 0 failed and 6 skipped. A Mac needs its own baseline, since its fonts differ.
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
1. Prettier config and `format:check` (low). Done.
2. The format-all commit (low). Done.
3. Remove the 35 triple-slash disables (low). Done.
4. Zero warnings, and inline disables are errors (medium). Done.
5. Compiler flags that cost 0 errors (low). Done.
6. `knip` (low). Done.
7. Size and complexity limits, with a list of exceptions that only shrinks (low). Done.
8. Code-only rename, plus a check against "bird" and "flock" (low). Done.
9. Renames in saved formats, with migrations (medium). Done. mascots.json still writes the old palette ids (`storedPalette`), because an older version run on the same computer drops a mascot with a new id, and its next save loses it.
10. Server and model-facing renames (high, Codex). Done in code. The deploys below are the user's. `supabase/migrations/20261120000000_mascot_names.sql` renames `cloud_flock`, `sync_cloud_flock(p_birds)` and `relay_flock` to `cloud_mascots`, `sync_cloud_mascots(p_mascots)` and `relay_mascots`, and keeps the old names working as a `security_invoker` view and two `security invoker` wrappers, which give back a look's old palette id, the only one a client from before reads. Model and MCP text says "mascot", with every tool name unchanged. The app, runner and phone page send the new palette ids to the server, and mascots.json still gets the old ones (`paletteOnDisk`).
    - **Deploy in this order,** each only once the one before is done: apply `20261119000000_berry_palettes.sql` and `20261120000000_mascot_names.sql` in the SQL editor, then `pnpm run site:deploy` (the phone page reads `cloud_mascots`), then redeploy the runner on Railway (`relay_mascots`), then ship the app (`sync_cloud_mascots`, and the new palette ids). Until a client is redeployed it calls the old names, which keep working.
    - **Retire the wrappers** once the runner is redeployed and the app that calls `sync_cloud_mascots` has been out for a month, and Supabase's API logs show no call to `cloud_flock`, `sync_cloud_flock` or `relay_flock` for a week. A new migration drops the view `cloud_flock` and the functions `sync_cloud_flock(jsonb)` and `relay_flock(text)`. Then take the old names' half out of `supabase/mascotNames.test.ts` and `relay_flock` out of `supabase/relay.test.ts`'s list, and the `wrapped` entries out of `scripts/oldNames.mjs`. After that, an app from before can't share its mascots with the phone: its sync fails quietly and is tried again on the next change, so the phone keeps what it last had.
    - **Gallery rows from the new app have the new palette ids,** which an app from before step 9 can't read, so it leaves those mascots out of its Gallery. Everything since step 9 reads both.
    - **The site's address, the user's call.** It's `SITE_ORIGIN` in `scripts/buildSite.mjs` for the site, `BLUEBERRY_SITE_URL` in `.env` for the app, and no test needs it. To switch:
      1. Make a new Netlify site with the new name (`npx netlify sites:create --name <new-name>`), link this checkout to it, and deploy: `pnpm run site:deploy`.
      2. Change `SITE_ORIGIN` in `scripts/buildSite.mjs`, run `pnpm run site:build`, which writes it into the share picture tags of `site/index.html` and `site/m/index.html`, and deploy again.
      3. Set `BLUEBERRY_SITE_URL` to the new address wherever the app is built or run, so new mascot links point there.
      4. Point the old site at the new one: deploy a folder holding only a `netlify.toml` with `[[redirects]] from = "/*" to = "https://<new-name>.netlify.app/:splat" status = 301 force = true` to the old site, with `npx netlify deploy --prod --dir <that folder> --site <old site's id>`. Shared links such as `/m/?id=…` and the phone page at `/app/` keep their path and query. A phone with the old page installed signs in again on the new address, since its session is in the old one's `localStorage`.
      5. Take `blueberry-flock.netlify.app` out of `scripts/oldNames.mjs`.
    - **The share picture** is `site/share.png` now. `netlify.toml` redirects `/flock.png` to it, for link previews made before.
    - Later, its own PR: `sync_cloud_mascots(null)` clears the owner's mascots, as `sync_cloud_flock(null)` always has, where it should refuse like any other value that isn't a list. No client sends it.
    - Later, the user's call: write the new palette ids to mascots.json once going back to an older version no longer matters.
11. `src/main` into folders (medium). Done: 18 folders by job, and the built app is byte-identical.
12. Boundary rules (low). Done: `eslint.boundaries.mjs` holds where Electron may load, what preloads, renderers and `src/shared` may import, and the modules nothing else may reach, each with its importers by name. `scripts/runnerElectron.mjs`, in `lint`, fails if anything the runner bundles reaches Electron.
    - Later: only the runner's reach is checked through other files, so an Electron-free folder could still reach Electron through a runtime import of an Electron folder (`settings/PermissionPromptView.ts` imports `window/chromeView.ts`). A `typeof import("…")` in a type isn't caught.
13. Page code out of template strings (high). Done.
14. Split `browserTools.ts` (high, Codex). Done: 13 files in `tools/`, with the ask-first rules alone in `askFirst.ts`. The tool list the model sees is identical before and after.
15. Split `Chats.ts` (high, Codex). Done: `Chats` keeps every public method and hands each to one of 10 parts in `chats/`, which nothing outside `chats/` may import.
16. Split `Window.ts` (medium). Done: `Window` is the face callers see, `WindowParts` builds the window and holds 20 parts, one job each.
17. Split `ipc.ts` (low). Done: `src/shared/ipc.ts` re-exports ten files in `src/shared/ipc/`, held to types only by a lint rule. The built app is byte-identical.
18. The other files over 400 lines. Done: every file is within 400 lines, and `linesOver` in `eslint.limits.mjs` is empty.
19. `exactOptionalPropertyTypes`, then `noUncheckedIndexedAccess` (medium). The first is on for page code, and everything it finds in main and the renderers is fixed. It stays off there for now, because LangChain's own types fail under it at `humanInTheLoopMiddleware` in `agent.ts`, in the latest LangChain too. The second, `noUncheckedIndexedAccess`, is on in all three configs, and everything it found is fixed.
    - The user's call: a `pnpm patch` of `@langchain/core` that adds `| undefined` to `description` in `ZodV3TypeDef` and `ZodV3Like` (`dist/utils/types/zod.d.ts`) clears it, types only. It also needs `runner/Dockerfile` to copy `patches/` before `pnpm install`, so build the runner's image once to check. Otherwise, turn the flag on when LangChain fixes it.
20. Type-aware lint, one rule at a time (medium). Done: ESLint reads every TypeScript file's types through `projectService`, and every type-aware rule in `recommendedTypeChecked` but `require-await` is on, with `switch-exhaustiveness-check`, where a `default` counts as covering the rest. Fixes are `void` on a promise that was already handled or already unhandled, arrows around async handlers, types the values really have, and the existing `(x ?? {}) as Record<string, unknown>` way of reading fields of outside data. Lint takes 64 s from cold, against 23 s before, and 7 s with its cache, against 6 s, on Windows.
    - **Held back in `eslint.config.mjs`,** each block saying why: `no-base-to-string` in `Markdown.tsx` and `suggestionProposals.ts`, where a typed fix would change the text made from some value; the five `no-unsafe-*` rules in tests, fakes, evals and the Supabase tests; `unbound-method` in unit tests, which hand mocked methods to `expect`; and `no-unsafe-assignment` and `no-unsafe-return` in `ChatStore.ts` and `RoutineStore.ts` (JSON read back from their own columns), `TelegramChannel.ts` (the API's answers) and `TabPage.ts` (what a page script returns, handed on as the caller's `T`). Taking those off means a parser at each, which drops what doesn't fit, so each is its own change.
    - **Off:** `require-await`, because taking `async` off a function that doesn't await turns a returned rejection into a synchronous throw (329 hits). `return-await` (11), because `return await` inside `try` decides whether the `catch` sees the rejection. `prefer-nullish-coalescing` (57), because `||` and `??` differ on `""`, `0` and `false`. `no-unnecessary-condition` (115) is a follow-up of its own.
    - **Not tried yet,** from `strictTypeChecked`: `no-deprecated` (24, mostly Electron's synchronous `safeStorage` calls), `no-misused-spread` (35) and `no-unsafe-type-assertion` (418).
    - **No cache:** `--cache` lints a file again only when it changes, so a change to a type could leave a file that uses it passing. `pnpm run lint` doesn't use it, and takes about a minute cold.
21. Fences: SQL, `fetch`, effects and timers, the UI kit (medium). Done: `eslint.fences.mjs` holds four fences, each ESLint's own restriction rule under a name of its own (`fence-fetch/no-restricted-globals` and so on), so they never undo each other or the boundary rules. Each says where it holds, where the thing belongs, and the files from before held back by name with why, a list that only shrinks. Tests, fakes and evals are free. The app does the same as before: the screenshot baseline shows no change.
    - **SQL:** `rowOf` and `rowsOf` in `library/database.ts` take a prepared statement and the row's shape, and the 18 row casts in `ChatStore`, `HistoryStore`, `browserHistory` and `RoutineStore` read through them, with the same statements and parameters. A boundary rule lets only those stores, `database.ts` and their three tests import `node:sqlite`. `.prepare(` isn't fenced: each store's database is private to it, the import rule keeps its type there too, and a selector can't tell it from `Attachments.prepare`.
    - **`fetch`:** only `galleryServer.ts`, the runner's `db.ts` and `phoneCalls.ts` (Supabase), `browserbase.ts`, `TelegramChannel.ts`, `aiKeyTry.ts` (a model provider) and `webFetch.ts` and `webSearch.ts` (Firecrawl), bare or on `globalThis`, `window` or `self`. Nothing is held back.
    - **Timers in renderers:** `useNow` and `useForAMoment` in `common/lib/timers.ts` replace seven hand-written copies of the same two patterns, with the same intervals, restart and cleanup. `setTimeout` and `setInterval` are refused elsewhere in the renderers, with 19 files held back, each timing something the two hooks don't. Effects aren't fenced: `useEffect` does too many jobs for one hook to replace (143 in 79 files), and a list of 79 would say nothing. Main's timers are the scheduler's and pollers' own, and aren't fenced either.
    - **The UI kit:** a raw `<button>`, `<input>` or `<textarea>` outside `src/renderer/common/components` is refused, with the 61 screens that draw their own held back, since moving them onto the kit would change how they look. The kit has no field yet, and the message says a new one starts there.
    - **`as unknown as`:** refused in `src` and `runner/src`, in either form, with `chats/agent.ts` held back for LangGraph's `__interrupt__` key.
22. End-to-end tests in CI, and protect `main` (medium).
23. AGENTS.md down to about 60 lines (low).

## Found on the way, each its own PR
- **Done:** the phone page showed what it had just sent a poll later, because `oneAtATime` handed a fresh load the poll already out (`e0d2ee5`).
- **Done:** a chat's tab opened after its job's first tab when the job was quick, so the tab the job kept could land above the chat. `Window.openPage` now puts the chat's tab before its job's tabs (`bc1d573`). If the whole job ends before the chat's tab opens, the kept tab still lands above it.
- **`riskyWord` matches too broadly.** The page code's risky-word check has always used `[^p{L}]` where `[^\p{L}]` was meant, since a backslash was lost in the old template, so a risky word counts next to almost any letter and Berry asks more often than it should (for example before clicking "Bookmarks"). Fixing it makes Berry ask less, so the user merges it.
- **Done:** a smooth scroll that started late, on a page busy on its main thread, answered with the old position while the page went on to scroll. `scrollPage` now answers at once only when the page can't go that way (`e777280`). A scroll that starts more than 700 ms late still answers mid-scroll, as before. The earlier suspicion, that a scroll's `scrollend` ends the next call early, doesn't happen in Chromium.
- **`supabase/phone.test.ts`'s push test depends on the order,** and fails when shuffled (`--sequence.shuffle --sequence.seed=2`), since an earlier test leaves a subscription behind.
- **A suggestion's prompt can be "[object Object]".** `verifyOne` in `suggestionProposals.ts` reads a prompt card's text with `String(raw.prompt ?? "")`, so when the model writes the prompt as an object or a number, a card can offer "[object Object]" or the digits as the job. Not run, read from the code. It should take only text, as `words` does for the other fields.
- **Rejections nobody handles in main:** `WebPage` and `chromeView.ts` start `loadURL` without a `catch`, so a load that's stopped or fails ends as an unhandled rejection, and `copyText` in `pageMenu.ts` does the same with Electron's `clipboard.writeText`, which returns a promise now. Step 20 marks them with `void`, which changes nothing.
- **Single casts on SQLite rows are left.** Six reads still cast a row with plain `as` (two pragmas in `database.ts`, the same migration written out again in `RoutineStore`'s constructor, `RoutineStore.soonest`, and two in `HistoryStore`). Four of them leave out `| undefined`, since the row always exists, so moving them onto `rowOf` changes their code, and no fence catches a single cast.
- **Nothing checks that a held-back file still needs its entry,** in `eslint.fences.mjs` as in `eslint.limits.mjs`, so an entry can outlive its reason. A script could lint each held-back file with its fence on and fail when it passes.
- **`McpConnector.ts` calls `fetch` inside the bridge's template string,** which lint can't see, as page code was before step 13.
- **The runner's Docker image** has the page-code generator now (Build 32), checked by copying the Dockerfile's files by hand. Build the real image once Docker is available.
