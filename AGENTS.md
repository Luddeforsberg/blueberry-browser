# Blueberry

An AI browser built with Electron, React and TypeScript. [DESIGN.md](./DESIGN.md) is the source of truth for all UI, so read it before changing anything visible.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Run the app with hot reload |
| `pnpm run typecheck` | Typecheck main, preload, tests and renderers |
| `pnpm run lint` | Lint. Warnings are allowed, errors fail CI |
| `pnpm exec electron-vite build` | Build into `out/` |
| `pnpm run test:e2e` | Run Playwright against `out/`, so build first |
| `pnpm exec electron-builder --dir` | Package an unsigned app into `dist/` |

CI runs typecheck, lint, build and the end-to-end tests on macOS and Windows. It doesn't package the app.

## Architecture

- `src/main`: the Electron main process. `Window` owns a `BaseWindow` with one `WebContentsView` per region and tab.
- `src/preload`: one preload per chrome renderer. The `.d.ts` files beside them type what each renderer sees, so keep the two in sync.
- `src/renderer/topbar` and `src/renderer/sidebar`: the chrome renderers. Shared code lives in `src/renderer/common`.
- Web pages run in `Tab` views with no preload and no Node access.

## Traps

- **Blank app, but `pnpm dev` works:** the built renderer pages are at `out/renderer/<name>/index.html`. `src/main` must load that path.
- **Packaged app stuck with no window:** a load error in the main process shows a modal dialog, which can sit behind other windows. Declare every runtime import in `dependencies`, including peer dependencies such as `zod` for `ai`. pnpm can resolve an undeclared package in development that packaging leaves out.
- **Electron starts as Node:** some shells, including agent shells, export `ELECTRON_RUN_AS_NODE=1`. Unset it to run Electron by hand. `tests/app.ts` already removes it.
- **`executeJavaScript`:** the code is a script, not a function body, so a top-level `return` is a syntax error.
- **Views stack by order:** a tab view covers the chrome beneath it, so CSS in the chrome can't draw over a page.
- **Formatting:** existing files aren't Prettier-clean, which is most of the lint warnings. Don't run `pnpm format` over files you aren't otherwise rewriting.
