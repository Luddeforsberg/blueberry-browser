# The cloud runner

A small Node service that runs a bird's job in the cloud browser while your Mac is closed. Blueberry puts the job in Supabase when you choose **Do this in the cloud** from the composer's **+**. The runner takes it from there, works on a Browserbase session in your own Context, so the sites you brought along are signed in, and writes each step back. If the job needs your approval it waits, and you answer in Blueberry's Needs you. A job with no answer for 30 minutes stops.

It runs the app's own code, `Chats.runTask` with the same agent, tools, mascot limits, approvals and step limit as a chat. It never answers an approval.

## How it signs in

The runner is a Supabase user of its own, such as `runner@yourdomain`, signed in with its email and password and the publishable key, and its session refreshes like the app's. It only uses Supabase's new keys: no service key, no secret key and no JWT secret.

You link it to your account in Blueberry, and it accepts the link when it starts, naming your account back. Until both sides have, it can't see anything. Once linked it can read your unfinished jobs, claim them, write their steps, reply, error and live view, ask for approvals and read your answers, all through the `runner_*` functions. Nobody can send a job until a runner has accepted, so nothing waits in a queue no runner takes from. It can't start jobs, stop or delete them, or decide an approval by any route: `decide_cloud_approval` refuses a runner outright, and nobody can write those tables directly. One runner per owner, and one owner per runner.

## Deploy

1. **Run the migrations.** In the Supabase SQL editor, run `supabase/migrations/20261102000000_cloud_jobs.sql`, after the Gallery's, then `supabase/migrations/20261103000000_phone.sql`, for the phone page, then `supabase/migrations/20261104000000_cloud_conversations.sql`, for follow-ups, and then `supabase/migrations/20261105000000_cloud_routines.sql`, for routines that run with the Mac off, and then `supabase/migrations/20261106000000_cloud_relay.sql`, so Settings can show the address for ChatGPT and Claude.
2. **Create the runner's user.** In the Supabase dashboard, Authentication > Users > Add user > Create new user, with an email of its own and a long random password. Tick Auto Confirm User. Don't use your own account.
3. **Link it in Blueberry.** Signed in to your Blueberry account, open Settings > Cloud > With your Mac off, type the runner's email and press **Link**. It says it's waiting for the runner.
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

   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional, for notifications on the phone page. `pnpm run push:keys` prints a pair. The subject is `mailto:` and your own address. Without them nothing goes to the phone, and the log says so once |

   | `RELAY_PUBLIC_URL`, `RELAY_SECRET` | Optional, for ChatGPT and Claude (see below). The service's public address, such as `https://blueberry-runner.up.railway.app`, and at least 32 random characters, from `openssl rand -base64 32` |
   | `RELAY_STATE_FILE` | Optional, a file on a Railway volume such as `/data/relay.json`, so connections survive a redeploy |

   `BROWSERBASE_CONTEXT_ID` is optional. Each job carries the Context id from the app, which is where the sites you brought along are.
6. **Check.** The log says `Runner started, using Browserbase.` and `Linked to its owner.`, and Settings > Cloud > With your Mac off says jobs run on it within about ten seconds. After that the log has one line per job: its id and how it went. Nothing else: no prompt, page, cookie, code, password or key.

## The phone page

`site/app/` lets you follow and answer these jobs from your phone, and start new ones, with the computer off. It's static and goes up with the rest of `site/`:

1. In `site/config.js`, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `VAPID_PUBLIC_KEY` to the public key from `pnpm run push:keys`. Never the private key.
2. `npx netlify login`, then `npx netlify link` for a site you have or `npx netlify init` for a new one.
3. `pnpm run site:deploy`, which runs `npx netlify deploy --prod --dir site`. `netlify.toml` sets the headers.
4. Open `https://<your site>/app/` on the phone, sign in with your Blueberry account, and on an iPhone add it to the Home Screen and open it from there before pressing **Turn on**.

When the runner asks, it sends a push that says only "Berry needs you", and when a job ends, "Berry finished". Nothing of the job is in it. Your birds show there once Blueberry on the Mac is signed in with this runner linked: it shares their names, looks and limits, never what they remember.

To revoke it, press **Unlink** in Settings, or change the runner user's password or delete it in Supabase.

## From ChatGPT and Claude

With `RELAY_PUBLIC_URL` and `RELAY_SECRET` set, the runner also serves a remote MCP server at `/mcp`, so ChatGPT and Claude on the web or the phone can give your birds jobs with the Mac off. Each job is started as you, through `start_cloud_job` with your own session, exactly as the phone page sends one, and runs here like any other. It shows in Blueberry and on the phone page as a chat in the cloud. Its tools are `list_agents`, `start_job` (a task, a bird by name or id, and sites that can only narrow it), `get_job`, `list_jobs` and `stop_job`. Nothing there can answer an approval, a question or a sign-in: those wait for you in Blueberry or on the phone.

1. **A public domain.** In Railway, the service's Settings > Networking > Generate Domain. Railway gives it HTTPS and sets `PORT`, which the relay listens on.
2. **Set `RELAY_PUBLIC_URL`** to that address and **`RELAY_SECRET`** to a long random string, and redeploy. The log says `Relay listening on port …`, and Settings > Cloud > With your Mac off shows the address to paste, `https://<domain>/mcp`, once the runner has linked.
3. **Keep connections across redeploys (optional).** Add a volume to the service, mounted at `/data`, and set `RELAY_STATE_FILE=/data/relay.json`. Without it, connections live in memory and ChatGPT or Claude ask you to sign in again after each deploy. The file is sealed with `RELAY_SECRET`, so changing the secret also means signing in again.
4. **ChatGPT:** Settings > Apps & Connectors > Advanced settings, turn on Developer mode, then create a connector with the address and OAuth as the authentication. **Claude:** Settings > Connectors > Add custom connector, with the address.
5. **Sign in** on the page that opens with your own Blueberry account, the one in `BLUEBERRY_RUNNER_OWNER`. No other account can connect, and nobody else's password is sent anywhere.

How it signs in: OAuth 2.1 with PKCE (S256), dynamic client registration and refresh tokens, from the MCP SDK's auth router. ChatGPT and Claude only get the relay's own random tokens, kept here only as hashes. Your Supabase refresh token stays on the runner, in memory and, with a state file, sealed. Registered clients are signed rather than stored, and may only send their code back to ChatGPT, Claude or an app on the same computer. Sign-in tries are limited per address. The password goes to Supabase once and never to a log or the disk.

One thing this changes: while someone is connected, the runner holds your own session, not just its own. The relay never calls `decide_cloud_approval` and has no route to it, but the database can no longer tell the runner process from you for that session. Disconnect in ChatGPT or Claude, or change your password, to end it.

## Try it locally

```sh
pnpm run runner:build
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BLUEBERRY_RUNNER_EMAIL=… BLUEBERRY_RUNNER_PASSWORD=… BLUEBERRY_RUNNER_OWNER=… \
  LLM_PROVIDER=openai OPENAI_API_KEY=… \
  BLUEBERRY_RUNNER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm run runner:start
```

`BLUEBERRY_RUNNER_CHROME` uses a headless Chrome with a throwaway profile instead of Browserbase, and `BLUEBERRY_RUNNER_CDP` one already running on 127.0.0.1. `tests/runner.spec.ts` runs it this way against the real migration.

## Not tried yet

None of this has run on Railway, real Supabase or real Browserbase, and no real push has been sent to a phone. The relay has only been tried with the MCP SDK's own client against a fake Supabase, never with real ChatGPT or Claude. In particular, whether Browserbase lets the runner's session use the Context while the app's own session is still open on it.
