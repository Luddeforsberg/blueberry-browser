# Blueberry

An AI browser built with Electron, React and TypeScript. [DESIGN.md](./DESIGN.md) is the source of truth for all UI, so read it before changing anything visible. [ROADMAP.md](./ROADMAP.md) has the plan and how we build it, so read it before starting a feature.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Run the app with hot reload |
| `pnpm run typecheck` | Typecheck main, preload, tests and renderers |
| `pnpm run lint` | Lint. Warnings are allowed, errors fail CI |
| `pnpm run test` | Run unit tests in `src/` with Vitest |
| `pnpm exec electron-vite build` | Build into `out/` |
| `pnpm run test:e2e` | Run Playwright against `out/`, so build first |
| `pnpm exec electron-builder --dir` | Package an unsigned app into `dist/` |
| `pnpm run verify` | Typecheck, lint, unit tests, build and end-to-end tests, the same as CI on macOS |

CI runs typecheck, lint, unit tests and build on macOS and Windows. The end-to-end tests run on macOS for every PR, and on Windows only for pushes to `main`. It doesn't package the app. GitHub Actions is out of minutes for now, so CI shows red without running anything. Run `pnpm run verify` instead.

## Architecture

- `src/main`: the Electron main process. `Window` owns a `BaseWindow` with one window-sized chrome view underneath, one `WebContentsView` per tab above it, an overlay view on top for the collapsed sidebar when it floats over the page, and another for the find bar (`src/main/FindBar.ts`).
- `src/main/Layout.ts`: the only place that decides where regions go. `Window` places the tab views with it and sends it to the chrome renderer, which draws each region at those rects. Don't hard-code sizes anywhere else.
- `src/shared/ipc.ts`: the one IPC contract. Every channel, its arguments, its result and which chrome view may call it live here. Add a channel here first, then to `CHANNEL_REGIONS` in `src/main/ipc.ts`, and then to the preload.
- `src/preload`: one sandboxed preload per chrome view, typed against the contract. The `.d.ts` files beside them expose those types to the renderers.
- `src/main/EventManager.ts`: registers every IPC handler, and rejects calls from any view or frame other than the one the contract names.
- `src/shared/library.ts` and `src/main/MockLibrary.ts`: bookmarks and routines. The mock serves sample data from the Paper mockups through the same IPC the real local store will use, so replacing it doesn't touch the UI.
- `src/main/Chats.ts`, `ChatStore.ts` and `agent.ts`: every chat runs through `Chats`, which saves to SQLite and gets replies from a LangChain agent. Keys come from `.env` (see `.env.example`). LangChain loads on the first message, so startup never waits for it. A cheap model from the same provider names each chat once it has a topic, and a title the user chose is never replaced.
- `src/main/browserTools.ts`: what Berry can do in the browser, as plain tool definitions that `agent.ts` hands to LangChain. Each call shows in the chat as a step, saved with the reply. While Berry can see a page, the tools reach every open tab. Otherwise they reach only the tabs that chat opened itself, which open behind it, until the user goes to one. A tool with `describe` changes something. Depending on the Ask before acting setting and its `isRisky`, it pauses on an approval card that says exactly what will happen, through LangChain's human-in-the-loop middleware, and does nothing if the page has changed since the user allowed it. `pageScripts.ts` holds what they run in the page, in an isolated world.
- `src/main/SettingsStore.ts`: saved settings in the user data folder. Validate anything new in `sanitizeSettings`.
- `src/renderer/chrome`: the one chrome renderer, drawing the sidebar or tab row, toolbar, chat panel, glass, and internal pages such as the new tab page, which open as tabs with no web view. The overlay view loads the same page with `?view=overlay`. Shared code lives in `src/renderer/common`.
- `src/renderer/common/components/Mascot.tsx`: Berry, behind `<Mascot mood size>`. Screens use the chrome's `Berry` wrapper, which applies Show Berry and Keep Berry still. Replace the artwork here without touching screens, and add new components to the gallery page (View > Component Gallery).
- `src/renderer/chrome/src/components/Composer.tsx` and `ChatMessage.tsx`: the one composer and message layout, used by the new tab page, the main chat and the chat panel. Change them here so the chats stay alike.
- Web pages run in `Tab` views with no preload and no Node access.

## Traps

- **Blank app, but `pnpm dev` works:** the built renderer pages are at `out/renderer/<name>/index.html`. `src/main` must load that path.
- **Packaged app stuck with no window:** a load error in the main process shows a modal dialog, which can sit behind other windows. Declare every runtime import in `dependencies`, including peer dependencies such as `@langchain/core`. pnpm can resolve an undeclared package in development that packaging leaves out.
- **Electron starts as Node:** some shells, including agent shells, export `ELECTRON_RUN_AS_NODE=1`. Unset it to run Electron by hand. `tests/app.ts` already removes it.
- **`executeJavaScript`:** the code is a script, not a function body, so a top-level `return` is a syntax error.
- **Preloads load nothing but `electron`:** they're sandboxed, so a shared runtime import becomes a chunk the preload can't `require`, and the chrome loses its API. Preloads may only `import type` from other files.
- **Views stack by order:** a tab view covers the chrome beneath it, so CSS in the chrome can't draw over a page.
- **Tests run off-screen:** outside CI, `tests/background.cjs` keeps the test app off-screen and out of the foreground, so they don't disturb the Mac. Take screenshots with Playwright, not `screencapture`.
- **Formatting:** existing files aren't Prettier-clean, which is most of the lint warnings. Don't run `pnpm format` over files you aren't otherwise rewriting.
