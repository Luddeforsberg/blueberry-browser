# Blueberry

An AI browser that works on your behalf. Grow a flock of birds for the jobs you repeat, and it notices what you do and offers to take it over.

<!-- video -->

![Hedda reading ArcticStartup's job board for Swedish startups that just raised, with the working view beside the chat](docs/images/hero.jpg)

## What it does

Blueberry is a browser first, designed for the Mac: tabs, history, bookmarks, downloads, find, zoom and site permissions, in a window made to look like the skin of a blueberry. Berry, a jackdaw with a blueberry in its beak, does jobs in the browser when you ask, and you can grow a flock of other birds beside it, each with its own name, look, instructions and limits.

Strawberry has all of that too. The sections below are where Blueberry tries to do better than Strawberry does today, each starting from what's missing there. What I say about Strawberry is how I understand it as of November 2026.

### Jobs that keep going when you leave

Strawberry's routines run on your own computer, so they only run while it's open and awake. The Monday 08:00 report doesn't happen if the laptop is closed in your bag, and a long job means leaving the lid open with the browser busy until it's done. You end up working around your computer's schedule.

In Blueberry, any job or routine can run in a browser in the cloud instead. Close the laptop on the train and the job keeps going. The morning routine runs at 08:00 whether the Mac is on or not, and the summary is there when you open it. The job gets its own browser on Browserbase, signed in to the sites you chose to bring along, so it never takes over your tabs or slows your computer down. A small runner on Railway starts and follows it with the Mac off, as the same bird with the same limits and the same approvals as at your desk. You can start one from the phone app, or from ChatGPT or Claude, wherever you are.

https://github.com/user-attachments/assets/8ebaa847-59be-474e-abe8-1e6d920da65d

### Answering from your phone

Strawberry marks a chat that needs you, for a sign-in or anything else, but only on the computer. That's where agents lose most of their time: not doing the work, but waiting for you. Start four jobs before lunch, one stops for a 2FA code and another for a yes, and you come back an hour later to two jobs that never moved.

In Blueberry, whatever a job is waiting on comes to your phone. It buzzes at the table, you tap Allow or type the code, and the job carries on while you eat. You come back to finished work instead of a queue of questions, so the hour away still counted. Jobs in the cloud show up in the phone app, which you add to your home screen, and where you can start a new job on the way back too. Jobs on your Mac come through your own Telegram bot. On either you can allow or refuse a step, answer a question, or type a code straight into the page, where the model never sees it. With several agents running at once, it's one list on your phone for all of them, so none of them sits idle waiting for you. The app and Telegram are channels behind a small interface, so WhatsApp or iMessage could come next.

https://github.com/user-attachments/assets/2c7e9282-9c0f-45e0-bd75-cb5776344987

### Your birds, from ChatGPT and Claude

Strawberry lets you connect MCP servers to it, but it isn't one itself, so nothing else can use it. Most people will keep ChatGPT or Claude open next to whatever browser they use, so Blueberry doesn't try to replace them. It gives them your browser. Claude Code and Claude Desktop on the same computer can hand whole jobs to your birds over MCP, and with the runner deployed, so can ChatGPT and Claude on the web. The chat keeps its threads and plans, and the bird brings your logins and what it sees in the browser. Plan outreach in ChatGPT, then ask it to have a bird find the twenty leads, and it does it in your browser, signed in. You get something out of Blueberry without switching browsers all at once, which also fits where Strawberry seems to be heading, as an agent platform rather than only a browser.

https://github.com/user-attachments/assets/b761dab6-19f4-47fe-bdc8-c8fb45393c8e

### Show Berry how

Strawberry's advice for making a routine is to talk it through with your companion, which still means describing the job well enough in words, and that's harder than doing it. It has no built-in way to just show it. In Blueberry you press Show Berry how, do the job once, and press Stop. Berry writes up what it saw as notes you can read and trim, and a cheap model turns them into a routine with numbered steps and the values that might change. It watches only the tab in front, only between start and Stop, and never keeps what's typed into a password or payment field.

https://github.com/user-attachments/assets/75840a08-d130-4bf6-a9ae-34090096a391

### The Gallery

Strawberry gives each companion a public page you can send to someone, and nine official companions to pick from, but there's nowhere to browse what other people made. That's a real gap: a new user often can't see why they'd want more than one assistant. The Gallery shows them: browse the birds other people use for sales, recruiting or research, and add one before you've even thought of the job yourself. It also doubles as marketing, since people share their birds and see how often they're added. It has starter birds for work, such as Prospector, Meeting Prep and Competitor Watch, and, with a server set up, the birds other people published. Every entry shows its instructions and permissions word for word before you add it, and the copy is yours from then on. Each published bird also has a public page you can send to a colleague, whose Open in Blueberry button opens its review in the app through a `blueberry://` link. A link never adds or runs anything.

https://github.com/user-attachments/assets/2c6150c0-9418-4077-883b-445d2ad0a127

### Suggestions that keep coming

The hard part of a new agent is knowing what to ask it. Strawberry's suggestions mostly happen once, at onboarding. Its companion reads your imported history and what you tell it, then suggests your role, apps to connect and a first task, and the Routines page offers routine ideas such as a morning summary or industry news. As far as I know, none of it keeps changing as you work, and nothing suggests a new companion. In Blueberry, suggestions on the new tab page keep coming from what you actually do. At most about once an hour, a cheap model reads a digest of your recent browsing, chats and routine runs and proposes a prompt, a routine or a new bird, and code checks each one against what it cites before it shows. They change as your week does. On the first day, Blueberry can bring in the last 90 days of history from Chrome, Arc, Brave or Edge, so the first suggestions are already about you.

https://github.com/user-attachments/assets/9d6a5aff-b464-427e-b61e-298dcad6accc

### Berry on the desktop

In Strawberry, work starts inside the browser, but most work happens in other apps. You're in Slack or Mail, see something worth looking into, and hand it to Berry with `⌥Space` without switching apps. Turned on in Settings, Berry waits tucked behind an edge of the screen, above every app. The job runs in the browser where you're signed in. It never reads the screen, the clipboard or another app. Later it could work on the desktop itself.

https://github.com/user-attachments/assets/41e38ba9-bc74-4f5c-8847-5d0c17a92315

### The rest

The flock itself, routines on a schedule, jobs that work in tabs behind yours with a live picture of them beside the chat, and birds that keep a habit only when you say yes and show every word they keep. Strawberry has all of these, and they work much the same here. Blueberry needs them because everything above is built on them. The same goes for the safety rules below, which every AI browser needs.

## How it grows

Three of the features above are also how Blueberry gets users and keeps them.

- **Every shared bird is a landing page.** A published bird gets a public page showing what it's told, what it's allowed to do, and an Open in Blueberry button. People share the birds they make, the add count tells the next person it's worth trying, and each share brings someone new to Blueberry.
- **It starts where people already are.** Through the relay, people in ChatGPT and Claude can use your birds without switching browsers. They get something out of Blueberry first and switch later.
- **It keeps giving people a reason to come back.** Most people drop a new agent because they don't know what to use it for. Strawberry's suggestions mostly come once, at onboarding. In Blueberry they keep coming from what you actually do, including new birds for the jobs you repeat, so a week in there's still something new worth handing over. Importing your history means even the first ones are about you.

## Safety

- By default, a bird stops before anything risky on an approval card with the exact sentence of what will happen, and does nothing if the page changed after you allowed it. A job on the cloud runner never asks less than that.
- A bird's limits only narrow what it can do, and are enforced in the tool layer, not the prompt.
- A bird never asks for a password or code. A sign-in, code or captcha is handed to you in its tab, which no job can reach until you're done, and a code sent from your phone is typed by code the model can't call. The model is only told that a code went in.
- Only you can answer an approval. No MCP app, relay client or cloud runner can.
- The working view's pictures go only to the window, never to the model or the disk, and a cloud live view never goes to the model.
- No service key is in the repo, the app or the runner. Everything uses Supabase's publishable key and a signed-in user's session.

## More screenshots

Every feature above, in screenshots: [docs/screenshots](docs/screenshots/README.md).

<table>
<tr>
<td width="50%"><img src="docs/images/approval.jpg" alt="An approval card with the exact text Berry would type into lemlist's contact sales form"><br>An approval card says exactly what will happen before anything does.</td>
<td width="50%"><img src="docs/images/flock.jpg" alt="The Flock page with Berry, Hedda, Otis, Ines and Juno on wires"><br>The flock: Berry and four birds of your own, each with its own limits.</td>
</tr>
<tr>
<td width="50%"><img src="docs/images/new-tab.jpg" alt="The new tab page with three suggestions on the art blueberry: a prompt, a routine and a new bird"><br>Suggestions on the new tab page, written from what you browsed.</td>
<td width="50%"><img src="docs/images/show-berry-how.jpg" alt="The notes Berry took while watching a job on ArcticStartup, before it becomes a routine"><br>Show Berry how: the notes from one recorded job, before they become a routine.</td>
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

A packaged app (`pnpm exec electron-builder --dir`) doesn't bundle `.env`. It reads it from its user data folder, `~/Library/Application Support/blueberry-browser/.env` on a Mac, so copy it there.

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
