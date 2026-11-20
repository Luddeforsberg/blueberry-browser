# Blueberry

An AI browser built with Electron, React and TypeScript. [DESIGN.md](./DESIGN.md) is the source of truth for all UI, so read it before changing anything visible. [README.md](./README.md) says what it does, and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) walks through how it fits together.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Run the app with hot reload |
| `pnpm run typecheck` | Typecheck main, preload, tests and renderers |
| `pnpm run format` | Format everything with Prettier (`.prettierrc.json`). `pnpm run format:check` fails on any file that isn't |
| `pnpm run lint` | Lint, with types, so every TypeScript file must be in a tsconfig. Any warning or error fails, and a comment can't turn a rule off: change it in `eslint.config.mjs`. Also runs `scripts/oldNames.mjs` and `scripts/runnerElectron.mjs` |
| `pnpm run knip` | Fail on unused files, exports and dependencies. `knip.config.ts` says where the entry points are |
| `pnpm run test` | Run unit tests in `src/` with Vitest |
| `pnpm exec electron-vite build` | Build into `out/` |
| `pnpm run test:e2e` | Run Playwright against `out/`, so build first |
| `pnpm run drive -- <feature> [--state s] [--theme light\|dark] [--layout vertical\|horizontal] [--width n]` | Open one feature from `tests/features/map.ts` in the built `out/` and save a picture. Prints its path |
| `pnpm run baseline [dir]` then `pnpm run baseline:compare <old> <new>` | Picture every feature in every state, light and dark, into `baselines/<commit>`, then compare two of them in an HTML report. Exits 1 on any difference |
| `pnpm exec electron-builder --dir` | Package an unsigned app into `dist/` |
| `pnpm run eval` | Run Berry on real websites with the real model, which costs money. See `evals/README.md` |
| `pnpm run page:build` | Bundle the code that runs in web pages, `src/page`, into `src/main/tools/pageCode.ts`. Run it after changing anything there: the build, the runner's build and CI fail while the file is out of date |
| `pnpm run site:build` | Regenerate what comes from the app: in `site/`, the drawings, the phone page's poses, pips and fonts, permission wording and checks on a row, and `src/main/tools/pageActorArt.ts`, the mascot drawn on pages. Run it after changing any of them: CI fails while a text file it writes is out of date (`pnpm run site:check`) |
| `pnpm run icon:build` | Redraw `resources/icon.png`, the icon the app ships with, from `AppIcon.tsx`, in Electron. Run it after changing the icon's drawing or Berry's |
| `pnpm run site:deploy` | Deploy `site/` to Netlify, as it is, with `netlify.toml`. Needs `npx netlify login` and a linked site first |
| `pnpm run push:keys` | Print a new VAPID key pair for notifications on the phone page. See `runner/README.md` |
| `pnpm run runner:build` | Bundle the cloud runner into `runner/dist/`. `pnpm run runner:start` runs it. See `runner/README.md` |
| `pnpm run verify` | Typecheck, format check, lint, knip, unit tests, build and end-to-end tests: what CI runs, on this computer |

CI runs typecheck, the format check, lint, knip, unit tests and build on macOS and Windows, and the end-to-end tests on both, in three shards each. Its `ci` job passes only when all of them do, and it's the check to require. It doesn't package the app. The runners have a real screen, a small one with motion turned down, so every test app loads `tests/background.cjs` and `tests/motion.cjs`, and Windows gets a larger screen first. Every end-to-end test runs on macOS. On Windows six skip, each saying why: five look for Google Chrome only where a Mac keeps it, and one is about how only macOS keeps running with no windows.

## How we build

- **One branch and one PR per working feature, from the latest `main`.** Don't stack PRs. Each runs in its own worktree.
- **Every PR goes through `self-check`, proof and `file-pr`.** `review-loop` only for changes that touch what Berry may do, permissions or secrets, for as many rounds as the size of the change calls for.
- **Run `pnpm run verify` before filing.** It runs what CI runs. Put the result in the PR.
- **The project manager agent merges.** It merges PRs one at a time and reruns `verify` on anything `main` has moved under.
- **The user merges anything that lets Berry do more without asking.** Say so at the top of the PR.
- **Tests stay small:** one end-to-end test of the main flow, plus unit tests only for real logic. If a test fails with no link to the change, rerun it once and move on. Look into it only if the same test keeps failing. Don't write tests for test helpers.
- **Fake models only prove plumbing.** A change to what Berry does also needs a real run with the key in `.env`, on real sites, and the PR says what it cost. Link `.env` from the main checkout into your worktree when you need it. Never print it or commit it.
- **New screens are built from [DESIGN.md](./DESIGN.md), with no mockup step.** Look at them in the running app in both layouts, light and dark, and attach what you saw. A screen DESIGN.md doesn't cover yet gets a section there in the same PR.
- **No dead controls.** Anything visible works, or says why it can't yet. Remove sample data when the real feature arrives.

## Where things live

Each line is a section of [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), in the same order. Read the section before changing its area: it says what the area must never do.

- `src/main/window/` and `menus/`: the window and its views. Read `Window.ts`, then `WindowParts.ts`. `Layout.ts` places every region.
- `src/shared/ipc/`, `src/preload/chrome.ts` and `src/main/window/EventManager.ts`: the IPC contract. A new invoke channel goes in `ipc/invoke.ts`, then `CHANNEL_REGIONS` in `src/main/window/ipc.ts`, then the preload. An event goes in `ipc/events.ts`.
- `src/main/tabs/`, `library/` and `settings/SitePermissions.ts`: tabs, the session, history, bookmarks, downloads and site permissions. Read `Tab.ts`.
- `src/main/chats/`: every chat and job, attachments too. Read `Chats.ts`, then `agent.ts`.
- `src/main/tools/` and `src/page/`: what Berry can do in a page. Read `browserTools.ts`, then `pageTarget.ts`.
- `src/main/tools/askFirst.ts`, `src/main/chats/Handoffs.ts` and `src/main/phone/`: approvals, handoffs and Needs you from the phone.
- `src/main/routines/` and `recordings/`: routines and Show Berry how. Read `Routines.ts`.
- `src/main/mascots/` and `src/shared/mascots.ts`: the mascots, their limits, the Gallery and `blueberry://` links. Read `MascotStore.ts`, then `src/main/tools/mascotLimits.ts`.
- `src/main/memory/`: what a mascot remembers. Read `MemoryStore.ts`.
- `src/main/suggestions/`: the new tab page's suggestions. Read `Suggestions.ts`.
- `src/main/desktop/`: the mascot on the desktop. Read `DesktopBerry.ts`.
- `src/main/cloud/`, `remoteJobs/`, `runner/`, `site/` and `supabase/`: the cloud browser, the runner, the relay, the phone page and the server. Read `CloudTabs.ts`, `RunnerJobs.ts` and `runner/src/index.ts`.
- `src/main/mcp/`: apps on this computer over MCP. Read `McpConnector.ts`.
- `src/main/account/` and `settings/`: the account, settings and the AI key. Read `SettingsStore.ts`.
- `src/renderer/chrome/` and `src/renderer/common/`: the one chrome renderer and what it shares. Read `src/renderer/chrome/src/main.tsx`.

## Rules no check holds

Most rules are checks, and each says why when it fails: `eslint.boundaries.mjs` who may import what, `eslint.calls.mjs` who may use a few members, `eslint.fences.mjs` where `fetch`, renderer timers, raw controls and `as unknown as` may go, `eslint.limits.mjs` the size limits, `scripts/oldNames.mjs` the old names and `scripts/runnerElectron.mjs` the runner without Electron. These are the ones they can't hold:

- Only `Layout.ts`, with `floatingPlaces.ts` and `desktopPlaces.ts`, decides where regions go. Don't hard-code a size anywhere else.
- Limits only narrow. A mascot's tools and sites, a routine's sites, and the sites, tools and ask level a job arrives with can take away, never add. A deleted or missing mascot never falls back to Berry.
- Only the user answers an approval or a handoff. Nothing on the runner or the relay, no MCP app and no model can. An app, the phone page or the desktop mascot may answer a question, but never with anything shaped like a code.
- The reason on an approval card comes from code, never from the model or a page. The action's exact words stay on it in full.
- Anything from a page, a server, a link or another app is a stranger's: check it where it comes in, show it as text, and label it untrusted for the model.
- Each secret goes only the way Secrets in ARCHITECTURE.md says. Don't give one a new route.
- No service key or secret belongs in the repo or the app. Supabase gets the publishable key only.
- Where ARCHITECTURE.md says something has no route to a tool, a mascot, the model, MCP, the relay, the phone or the disk, don't add one.
- A `BLUEBERRY_*` switch for tests works only in an unpackaged app, and one that takes an address only on 127.0.0.1.

## Traps

- **A window's `hide` event and `isVisible` on a Mac:** Electron fires `hide` and `show` from the occlusion state, so `hide` also means "covered by another window", `isVisible()` is false for a covered window, and neither fires or changes for a window off-screen, as in tests. Don't use them to tell that the user hid it. `Window.hideBlueberry` calls `DesktopBerry.mainWindowGone` itself.
- **`app.hide()` takes every window:** showing any window afterwards brings the whole app back. That's why Hide Blueberry hides only the main window while the mascot is out.
- **The desktop windows' focus:** a `panel` takes the keyboard without activating Blueberry, and hiding it gives the keyboard back, which is the composer window's whole job. The drop's window is `focusable: false` and never has the keyboard, so a press on it doesn't take the keyboard from the panel either. Tests can't see any of this, because `tests/background.cjs` makes `focus` do nothing.
- **Moving the drop's window makes it judder:** moving or resizing a native window frame by frame isn't synced to the display, and anything timed from main stops when main does, as when the first message loads LangChain. Anything that moves goes in the view as a transform or a size, and nothing the drop says may change its window's size.
- **One shape in two windows:** the composer window draws the prompt box over the drop's, from the drop's own size and place. Both draw `DropShape` at the `anchor` `Layout.ts` gives them, so a change to where or how one draws the drop needs the other too. A test's screenshot has one window's web contents, so it never shows the two together.
- **Global shortcuts in tests:** `tests/fakeShortcut.cjs` replaces `globalShortcut`, so a test never takes a key from the person at the computer. Press one through `globalThis.fakeShortcuts`.
- **Cookie domains don't match the way they look:** Playwright's `clearCookies({ domain })` with a string only matches that exact domain, and a domain cookie's is `.example.com`, so a string misses most of a site. Pass `cookieDomainPattern`. Electron can give a host-only cookie's domain with a dot in front too, so go by `hostOnly`, not the dot.
- **Asking the recorder again starts it:** `nextNotes` installs the watching if it isn't there, so nothing may call it after `finishWatching`. `Watched.ended` stops `Recordings.listen`, and `finish` tells whoever's waiting that it's over rather than waking them with notes.
- **Blank app, but `pnpm dev` works:** the built renderer pages are at `out/renderer/<name>/index.html`. `src/main` must load that path.
- **Packaged app stuck with no window:** a load error in the main process shows a modal dialog, which can sit behind other windows. Declare every runtime import in `dependencies`, including peer dependencies such as `@langchain/core`. pnpm can resolve an undeclared package in development that packaging leaves out.
- **Electron starts as Node:** some shells, including agent shells, export `ELECTRON_RUN_AS_NODE=1`. Unset it to run Electron by hand. `tests/app.ts` already removes it.
- **`executeJavaScript`:** the code is a script, not a function body, so a top-level `return` is a syntax error.
- **Views stack by order:** a tab view covers the chrome beneath it, so CSS in the chrome can't draw over a page.
- **Parked tabs:** a view wholly outside the window gets no size and draws nothing on Windows, so a tab Berry works in behind the user's keeps one corner pixel in the window, under the chrome, which takes any click there. `parkedPage` in `Layout.ts` and `Panels.placeTab` do this.
- **Tests run off-screen:** `tests/background.cjs` keeps the test app off-screen and out of the foreground, so they don't disturb the Mac, on every computer, CI included. Take screenshots with Playwright, not `screencapture`.
- **Asking about site permissions:** Electron has no "not asked yet" answer, so `Notification.permission` and `navigator.permissions.query` say `denied` until the user allows. The request itself still reaches the prompt.
- **`getUserMedia` in tests:** allowing it can raise the Mac's own permission dialog. Tests only ever block it.
- **Real input isn't checked by Electron:** `sendInputEvent` goes wherever the coordinates are, or nowhere. It doesn't reach a frame from another origin, and pages move after a scroll, so aim after they settle. Just before each press, a click's or a drag's, `watchPress` checks the point still lands on the named element and only then watches, stopping a press on anything else, until the tool has read what happened and ends that watch by its id. Once a real press has gone, a click that may not have arrived is said in words, never sent again as a scripted one.
- **Native drags and pickers:** real input on a `draggable` element starts a Mac drag that would catch the user's pointer, and a real click on a dropdown or file field opens a native menu or file picker. Those are scripted.
- **The mascot changes when a click happens:** `aimClick` runs again after the flight, so the press goes where the element is now, and the watch set just before it still stops a press on anything else. Nothing the mascot draws can be hit, so it never needs telling apart. Anything new that waits for it must end through `PageActor`'s waits, or it holds up a job after the mascot has gone.
