# Evals

Measures what Berry can really do on real websites. It launches the built app, sends each job through the real chat with the real model, and records tool calls, model calls, tokens, estimated cost, the answer and a screenshot of the end state.

1. Link `.env` from the main checkout. Runs set Ask before acting to Never, so only add jobs that are safe without approvals. Every job must tell Berry to stop before anything final, and anything with a form belongs on a site made for testing.
2. `pnpm run eval`, or `EVAL_RUN=2 pnpm run eval` for a second pass. `EVAL_JOBS=a,b` picks jobs, and `EVAL_BUDGET` changes the US$10 limit.
3. Look at each end state and write `results/<date>.scores.json`, plus `<date>.notes.md` for the summary. Scores are a person's or agent's judgement: a job that ran isn't a job that worked.
4. `pnpm run eval -g "write report"` writes `results/<date>.md` without running any jobs.
