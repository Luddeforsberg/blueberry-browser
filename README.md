# Blueberry

An AI browser that works on your behalf. Grow a flock of birds for the jobs you repeat, and it notices what you do and offers to take it over.

<!-- video -->

![Competitor Watch reading Linear's changelog, with the working view beside the chat](docs/images/hero.jpg)

## What it does

Blueberry is a browser first, designed for the Mac: tabs, history, bookmarks, downloads, find, zoom and site permissions, in a window made to look like the skin of a blueberry. Berry, a jackdaw with a blueberry in its beak, lives in the chat panel and on the new tab page, and does jobs in the browser when you ask.

### The flock

Berry is the first of a flock. Each bird has a name, a look, instructions and limits: which sites it may use, and whether it may go to pages, click and type. Limits only take away. A bird limited to two sites can't read or open anything else, and no bird has a setting that skips an approval. Chats and routines run as whichever bird you choose.

### The Gallery

Starter birds for work, such as Prospector, Meeting Prep and Competitor Watch, come with the app. With a server set up, people can sign in, publish their own, and browse what others published. Every entry shows its permissions in plain words before you add it, and a copy is yours from then on. Each published bird has a public page on the site, whose Open in Blueberry button hands the app a `blueberry://mascot/<id>` link. A link only opens the review, and never adds or runs anything.

### Suggestions

The new tab page offers work it noticed you trying to get done: a search you repeat, the same pricing pages checked every week, a routine that keeps failing. A cheap model reads a digest of your recent browsing, chats and routine results, at most about once an hour, and proposes work citing items in it. Code then checks each proposal: the items it cites must exist, and the sites, the numbers in what the card says, and any schedule must come from them. A suggestion only fills in a prompt, a routine or a new bird for you to confirm. To start with something on the first day, onboarding and Settings can bring in the last 90 days of history from Chrome, Arc, Brave or Edge.

### Show Berry how

Press it, do the job once, and press Stop. Berry writes up what it saw as notes you can read and trim, then a cheap model turns them into a routine: a name, numbered steps and the values that might change. Its sites come from the notes, and a run can't go anywhere else. It watches only the tab in front, only between start and Stop, and never keeps what's typed into a password or payment field.

### Routines

A routine is instructions, a bird and a schedule: when you ask, once, daily, weekly or monthly. A run works like a chat with no page, opens its own tabs behind you and closes them when it ends. Each keeps its last 50 runs with their steps and reports.

### Working behind you

Tabs a bird opens stay behind the one you're on, so you keep browsing while it works. Clicking, typing or navigating in one of its tabs takes it over, and the bird leaves it alone. In the main chat, the working view beside the conversation shows a live picture of the job's tab with the bird working in it. On the page itself the bird flies to what it's about to click and pecks it before the real click, and Stop Berry sits in the toolbar where no page can reach it.

### Needs you

Every approval, question and sign-in waiting on you is on one page, as a plain list. A sign-in, code or captcha is handed to you in its tab, and the bird can't see that tab until you press I'm done. With your own Telegram bot connected, the same items from jobs on this computer reach your phone while Blueberry is open: Allow and Don't allow as buttons, a reply to answer a question, and a code typed straight into the page by code the model can't call.

### The cloud

With a Browserbase API key and project id in Settings > Cloud, a bird can work in a browser in the cloud instead, watched live in a cloud tab and taken over the same way. You can bring chosen sites' sign-ins along, one site at a time, after Touch ID or a confirm. With a Supabase project and the runner deployed on Railway, cloud jobs and scheduled routines keep going with the Mac closed. The phone page at `site/app/` follows them from anywhere: start a job as any bird, answer approvals, take over the live view for a sign-in, and get a notification that only says "Berry needs you" or "Berry finished". See [runner/README.md](runner/README.md).

### From other AI apps

Settings > Claude lets Claude Code, Claude Desktop and other apps on the same computer hand whole jobs to your birds over MCP, on 127.0.0.1 with a token. With the runner deployed, its relay lets ChatGPT and Claude on the web start jobs too, after you sign in with OAuth, and those jobs run in the cloud, or on your Mac while Blueberry is open and a switch in Settings allows it. In every case the job is an ordinary chat with the usual limits, and the app that started it can't allow anything.

### What a bird remembers

When you say something is a habit ("I always", "from now on") or ask it to remember, one quiet line under the reply offers to keep it. Nothing is kept until you say yes. Each bird's page in Flock shows every word it remembers, to edit or forget, and later jobs say what they went in with. Memory stays on this computer, apart from the bird, so it never goes with a copy or anything published.

### Berry on the desktop

Turned on in Settings, the bird waits tucked behind an edge of the screen, above every app. `⌥Space` opens a prompt from anywhere, and the job runs in the browser where you're signed in. It never reads the screen, the clipboard or another app.

## Safety

- By default, a bird stops before anything risky on an approval card with the exact sentence of what will happen, and does nothing if the page changed after you allowed it. A job on the cloud runner never asks less than that.
- A bird's limits only narrow what it can do, and are enforced in the tool layer, not the prompt.
- A bird never asks for a password or code. A sign-in, code or captcha is handed to you in its tab, which no job can reach until you're done, and a code sent from your phone is typed by code the model can't call. The model is only told that a code went in.
- Only you can answer an approval. No MCP app, relay client or cloud runner can.
- The working view's pictures go only to the window, never to the model or the disk, and a cloud live view never goes to the model.
- No service key is in the repo, the app or the runner. Everything uses Supabase's publishable key and a signed-in user's session.

## More screenshots

<table>
<tr>
<td width="50%"><img src="docs/images/approval.jpg" alt="An approval card with the exact text Berry would type into a sales form"><br>An approval card says exactly what will happen before anything does.</td>
<td width="50%"><img src="docs/images/flock.jpg" alt="The Flock page with six birds on wires"><br>The flock: Berry and five birds from the Gallery, each with its own limits.</td>
</tr>
<tr>
<td width="50%"><img src="docs/images/new-tab.jpg" alt="The new tab page with two suggestions on the art blueberry"><br>Suggestions on the new tab page, written from what you browsed.</td>
<td width="50%"><img src="docs/images/show-berry-how.jpg" alt="The notes Berry took while watching a job, before it becomes a routine"><br>Show Berry how: the notes from one recorded job, before they become a routine.</td>
</tr>
</table>

## How it's built

- Electron 45 with `BaseWindow` and one `WebContentsView` per tab, React 19, TypeScript, Tailwind and Vite through electron-vite.
- LangChain for the agent, with OpenAI or Anthropic models.
- SQLite through `node:sqlite` for chats, history and routines, and JSON files for the rest.
- `playwright-core` over CDP for the cloud browser, on Browserbase.
- Supabase for accounts, the Gallery and cloud jobs, with row-level security and security definer functions, tested on real Postgres in WebAssembly with PGlite.
- A plain Node runner for Railway, and a static site for Netlify with no build.
- Vitest for unit tests and Playwright for end-to-end tests against the built app.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) walks through how it fits together.

## Running it

You need Node 24 or later and pnpm.

```sh
pnpm install
cp .env.example .env    # set LLM_PROVIDER and one key, OPENAI_API_KEY or ANTHROPIC_API_KEY
pnpm dev
```

That's the whole browser, with Berry, the flock, routines, Suggestions, Show Berry how, Needs you and the bundled Gallery. The rest needs something set up:

- **Accounts and publishing to the Gallery** need a Supabase project with the migrations in `supabase/migrations`, and `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`.
- **The public mascot pages and the phone page** are in `site/`, deployed to Netlify with `pnpm run site:deploy` after setting `site/config.js`.
- **Cloud jobs** need a Browserbase API key and project id in Settings > Cloud. Keeping them going with the Mac off, the phone page's jobs and the relay for ChatGPT and Claude need the runner. [runner/README.md](runner/README.md) has the steps.
- **Replies from the phone** to jobs on this computer need a Telegram bot of your own, connected in Settings > Phone. Jobs on the cloud runner are answered in the app or on the phone page instead.

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
| `pnpm run eval` | Run Berry on real websites with the real model, which costs money. See [evals/README.md](evals/README.md) |
| `pnpm run site:build` | Regenerate what `site/` and the bird drawn on pages take from the app. Run it after changing any of them |
| `pnpm run site:deploy` | Deploy `site/` to Netlify, as it is, with `netlify.toml`. Needs `npx netlify login` and a linked site first |
| `pnpm run push:keys` | Print a new VAPID key pair for notifications on the phone page |
| `pnpm run runner:build` | Bundle the cloud runner into `runner/dist/`. `pnpm run runner:start` runs it |
| `pnpm run verify` | Typecheck, lint, unit tests, build and end-to-end tests, the same as CI on macOS |

## How it was made

Blueberry was built with coding agents: Claude Code wrote the changes, and Codex reviewed them. Each feature was one PR, merged in order before the next began, so the [closed pull requests](https://github.com/Luddeforsberg/blueberry-browser/pulls?q=is%3Apr+is%3Aclosed) read as the build history. GitHub Actions is out of minutes for now, so `pnpm run verify` runs locally in place of CI, and each PR says what it printed.

What Berry can do is measured on real websites with the real model, through the jobs in [evals/](evals/). On the first run, 14 of 29 jobs were done on every run. After the work on the agent, 25 of 29 were, though 17 of those ran once. The results and notes are in [evals/results/](evals/results/).

It began as a fork of the Blueberry Browser challenge repo.
