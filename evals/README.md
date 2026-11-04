# Evals

Measures what Berry can really do on real websites. It launches the built app, sends each job through the real chat with the real model, and records tool calls, model calls, tokens, estimated cost, the answer and a screenshot of the end state.

1. Link `.env` from the main checkout. Runs set Ask before acting to Never, so only add jobs that are safe without approvals. Every job must tell Berry to stop before anything final, and anything with a form belongs on a site made for testing.
2. `pnpm run eval`, or `EVAL_RUN=2 pnpm run eval` for a second pass. `EVAL_JOBS=a,b` picks jobs, and `EVAL_BUDGET` changes the US$10 limit. A job that runs as a Gallery mascot only runs when named.
3. Look at each end state and write `results/<date>.scores.json`, plus `<date>.notes.md` for the summary. Scores are a person's or agent's judgement: a job that ran isn't a job that worked.
4. `pnpm run eval -g "write report"` writes `results/<date>.md` without running any jobs.

## Bringing in history from sample data

`evals/seedBrowserFolder.ts` makes a folder that looks like a computer with Chrome on it, using the same sample visits. `BLUEBERRY_BROWSER_DATA` points an unpackaged app at it, and a packaged app ignores it. Use a new profile folder so onboarding shows, and no real browser folder is touched.

```
pnpm dlx tsx evals/seedBrowserFolder.ts /tmp/blueberry-demo-browsers
pnpm exec electron-vite build
env -u ELECTRON_RUN_AS_NODE BLUEBERRY_BROWSER_DATA=/tmp/blueberry-demo-browsers pnpm exec electron . --user-data-dir=/tmp/blueberry-demo-import
```

The birds need a model, so link `.env` into a worktree first. To start again, delete `/tmp/blueberry-demo-import`. The visits are relative to the day they were written, so reseed the browser folder on the day you use it.

## Filling a profile with sample data

`evals/seedHistory.ts` gives a new profile folder a few days of realistic visits and chats, relative to today, so the new tab page has suggestions on a fresh install. It's only for trying the app, and isn't in the app or its menus.

```
pnpm dlx tsx evals/seedHistory.ts /tmp/blueberry-demo
pnpm exec electron-vite build
env -u ELECTRON_RUN_AS_NODE pnpm exec electron . --user-data-dir=/tmp/blueberry-demo
```

The cards take a few seconds to appear the first time, while the cheap model writes them, which was about 2,300 tokens in the runs so far. After that they show at once. To start again, delete the folder and seed it again.

## Checking suggestions with the real model

`evals/suggestionsCheck.ts` fills a new folder with two weeks of made-up history, chats and a routine that failed twice, then asks the real cheap model for suggestions once, through the app's own `Suggestions` class. It prints what the old rules would show, what the model proposed, what got past the checks and what the new tab would show, and leaves the digest it sent and the reply in the folder. It refuses a folder that isn't empty. Link `.env` first.

```
pnpm dlx tsx evals/suggestionsCheck.ts /tmp/blueberry-suggestions-check
env -u ELECTRON_RUN_AS_NODE pnpm exec electron . --user-data-dir=/tmp/blueberry-suggestions-check
```

The app then shows the checked cards without asking again within the hour.
