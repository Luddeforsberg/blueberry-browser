# The cloud runner

A small Node service that runs a bird's job in the cloud browser while your Mac is closed. Blueberry puts the job in Supabase when you press **Cloud** and then **Keeps going** in the composer. The runner takes it from there, works on a Browserbase session in your own Context, so the sites you brought along are signed in, and writes each step back. If the job needs your approval it waits, and you answer in Blueberry's Needs you. A job with no answer for 30 minutes stops.

It runs the app's own code, `Chats.runTask` with the same agent, tools, mascot limits, approvals and step limit as a chat. It never answers an approval: its database role can ask but can't decide.

## The key it uses

The runner signs in to Supabase as its own role, `blueberry_runner`, with a token that also names your user. Row-level security keeps it to your jobs, the column grants keep it to the columns it writes, and only `decide_cloud_approval` writes a decision, which only a signed-in user can call. It isn't the service key, and it isn't your session, which could answer approvals.

You make the token on your own computer with the project's JWT secret. The secret stays with you, and only the token goes to Railway.

## Deploy

1. **Run the migration.** In the Supabase SQL editor, run `supabase/migrations/20261102000000_cloud_jobs.sql`, after the Gallery's.
2. **Make the token.** Find your user id under Authentication > Users and the JWT secret under Project Settings > JWT Keys (the legacy JWT secret). Then:

   ```sh
   SUPABASE_JWT_SECRET='…' node runner/mintToken.mjs <your user id>
   ```

   It lasts a year. Make a new one to replace it, and rotate the JWT secret to revoke every one.
3. **Create the service.** From the repo root, with `railway login` done:

   ```sh
   railway init            # or `railway link` to an existing project
   railway up
   ```

   `railway.json` builds `runner/Dockerfile` with one replica.
4. **Set its variables** in the Railway dashboard, or with `railway variables --set NAME=value`:

   | Variable | What |
   |---|---|
   | `SUPABASE_URL` | Your project's address, `https://….supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | The publishable key, `sb_publishable_…`. A secret key is refused |
   | `BLUEBERRY_RUNNER_TOKEN` | The token from step 2 |
   | `LLM_PROVIDER` | `openai` or `anthropic` |
   | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | The model key. `LLM_MODEL` chooses a model, as in the app |
   | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | The same Browserbase account as Settings > Cloud |

   `BROWSERBASE_CONTEXT_ID` is optional. Each job carries the Context id from the app, which is where the sites you brought along are.
5. **Check the log.** It says `Runner started, using Browserbase.`, then one line per job: its id and how it went. Nothing else: no prompt, page, cookie, code or key.

## Try it locally

```sh
pnpm run runner:build
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BLUEBERRY_RUNNER_TOKEN=… LLM_PROVIDER=openai OPENAI_API_KEY=… \
  BLUEBERRY_RUNNER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm run runner:start
```

`BLUEBERRY_RUNNER_CHROME` uses a headless Chrome with a throwaway profile instead of Browserbase, and `BLUEBERRY_RUNNER_CDP` one already running on 127.0.0.1. `tests/runner.spec.ts` runs it this way against the real migration.

## Not tried yet

None of this has run on Railway, real Supabase or real Browserbase. In particular: whether Supabase accepts a token signed with the legacy JWT secret on a project that has moved to the new signing keys, and whether Browserbase lets the runner's session use the Context while the app's own session is still open on it.
