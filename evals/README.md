# Evals

Measures what Berry can really do on real websites. It launches the built app, sends each job through the real chat with the real model, and records tool calls, model calls, tokens, estimated cost, the answer and a screenshot of the end state.

1. Link `.env` from the main checkout. Runs set Ask before acting to Never, so only add jobs that are safe without approvals. Every job must tell Berry to stop before anything final, and anything with a form belongs on a site made for testing.
2. `pnpm run eval`, or `EVAL_RUN=2 pnpm run eval` for a second pass. `EVAL_JOBS=a,b` picks jobs, and `EVAL_BUDGET` changes the US$10 limit.
3. Look at each end state and write `results/<date>.scores.json`, plus `<date>.notes.md` for the summary. Scores are a person's or agent's judgement: a job that ran isn't a job that worked.
4. `pnpm run eval -g "write report"` writes `results/<date>.md` without running any jobs.

## Filling a profile for filming

`evals/seedHistory.ts` gives a new profile folder a few days of realistic visits and chats, relative to today, so the new tab page has suggestions on a fresh install. It's only here for the demo and isn't in the app or its menus.

```
pnpm dlx tsx evals/seedHistory.ts /tmp/blueberry-demo
pnpm exec electron-vite build
env -u ELECTRON_RUN_AS_NODE pnpm exec electron . --user-data-dir=/tmp/blueberry-demo
```

The cards take a few seconds to appear the first time, while the cheap model writes them, which was about 2,300 tokens in the runs so far. After that they show at once. To start again, delete the folder and seed it again.
