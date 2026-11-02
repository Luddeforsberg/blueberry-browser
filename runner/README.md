# The cloud runner

A small Node service that runs a bird's job in the cloud browser while your Mac is closed. Blueberry puts the job in Supabase when you press **Cloud** and then **Keeps going** in the composer. The runner takes it from there, works on a Browserbase session in your own Context, so the sites you brought along are signed in, and writes each step back. If the job needs your approval it waits, and you answer in Blueberry's Needs you. A job with no answer for 30 minutes stops.

It runs the app's own code, `Chats.runTask` with the same agent, tools, mascot limits, approvals and step limit as a chat. It never answers an approval.

## How it signs in

The runner is a Supabase user of its own, such as `runner@yourdomain`, signed in with its email and password and the publishable key, and its session refreshes like the app's. It only uses Supabase's new keys: no service key, no secret key and no JWT secret.

You link it to your account in Blueberry, and it accepts the link when it starts, naming your account back. Until both sides have, it can't see anything. Once linked it can read your unfinished jobs, claim them, write their steps, reply, error and live view, ask for approvals and read your answers, all through the `runner_*` functions. It can't start jobs, stop or delete them, or decide an approval by any route: `decide_cloud_approval` refuses a runner outright, and nobody can write those tables directly. One runner per owner, and one owner per runner.

## Deploy

1. **Run the migration.** In the Supabase SQL editor, run `supabase/migrations/20261102000000_cloud_jobs.sql`, after the Gallery's.
2. **Create the runner's user.** In the Supabase dashboard, Authentication > Users > Add user > Create new user, with an email of its own and a long random password. Tick Auto Confirm User. Don't use your own account.
3. **Link it in Blueberry.** Signed in to your Blueberry account, open Settings > Cloud > Runner, type the runner's email and press **Link**. It says it's waiting for the runner.
4. **Create the service.** From the repo root, with `railway login` done:

   ```sh
   railway init            # or `railway link` to an existing project
   railway up
   ```

   `railway.json` builds `runner/Dockerfile` with one replica.
5. **Set its variables** in the Railway dashboard, or with `railway variables --set NAME=value`:

   | Variable | What |
   |---|---|
   | `SUPABASE_URL` | Your project's address, `https://….supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | The publishable key, `sb_publishable_…`. Anything else is refused |
   | `BLUEBERRY_RUNNER_EMAIL`, `BLUEBERRY_RUNNER_PASSWORD` | The runner's user from step 2 |
   | `BLUEBERRY_RUNNER_OWNER` | Your own Blueberry account's email, the one that linked it. The runner only accepts that link |
   | `LLM_PROVIDER` | `openai` or `anthropic` |
   | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | The model key. `LLM_MODEL` chooses a model, as in the app |
   | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | The same Browserbase account as Settings > Cloud |

   `BROWSERBASE_CONTEXT_ID` is optional. Each job carries the Context id from the app, which is where the sites you brought along are.
6. **Check.** The log says `Runner started, using Browserbase.` and `Linked to its owner.`, and Settings > Cloud > Runner says it's your runner within about ten seconds. After that the log has one line per job: its id and how it went. Nothing else: no prompt, page, cookie, code, password or key.

To revoke it, press **Unlink** in Settings, or change the runner user's password or delete it in Supabase.

## Try it locally

```sh
pnpm run runner:build
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BLUEBERRY_RUNNER_EMAIL=… BLUEBERRY_RUNNER_PASSWORD=… BLUEBERRY_RUNNER_OWNER=… \
  LLM_PROVIDER=openai OPENAI_API_KEY=… \
  BLUEBERRY_RUNNER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm run runner:start
```

`BLUEBERRY_RUNNER_CHROME` uses a headless Chrome with a throwaway profile instead of Browserbase, and `BLUEBERRY_RUNNER_CDP` one already running on 127.0.0.1. `tests/runner.spec.ts` runs it this way against the real migration.

## Not tried yet

None of this has run on Railway, real Supabase or real Browserbase. In particular, whether Browserbase lets the runner's session use the Context while the app's own session is still open on it.
