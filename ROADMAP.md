# Blueberry roadmap

The plan and how we build it. The goal comes from the README: a browser that is better than Strawberry, not a copy of it. We catch up only where people would otherwise not switch, then win where Strawberry is weak.

The promise we're testing: **give Blueberry the job, carry on with your day, and come back to verified work.**

## Order of work

There is no fixed date. Each stage starts when the one before it holds up in real use.

### 1. A browser you can use every day

| Work | State |
|---|---|
| Find in page, zoom, right-click menu on pages, print | Next |
| Downloads, and asking before a site uses the camera, microphone, location and so on | Next |
| Saved history with a history page, restoring tabs after a restart, recovering from a crashed page | Next |
| Real pinned sites, no sample account, importing bookmarks and history from other browsers | After saved history |

### 2. The AI features people expect

| Work | State |
|---|---|
| Real routines: create, schedule, run, run history. Replaces the last sample data | Next |
| Companions: saved assistants with their own instructions and files | After routines |
| Editable memory | With companions |
| Ask about selected text, chosen tabs, PDFs and attachments, with answers linking to their sources | After routines |

Not planned before stage 3: app connections, extensions, meeting notes, generated slides. We can add one later if it serves the audience we choose.

### 3. Why people switch

Decided from [docs/STRATEGY.md](./docs/STRATEGY.md), which covers where Strawberry falls short, who we're for and how we show it. Candidates so far:

- Tasks that survive a closed window or a lost connection, where Strawberry's routines wait until the browser reopens.
- Results with a receipt: what changed, what was skipped and how it was checked.
- Teaching a routine by doing it once, then testing it before it's scheduled.
- Help from your phone: approvals and sign-ins while you're away.
- Deadlines and budgets that change how Berry works, with useful partial results.

## How we build

- **One branch and one PR per working feature, from the latest `main`.** Don't stack PRs. Each runs in its own worktree.
- **Every PR goes through the `ship` skill, without its babysit step.** That means `self-check`, proof, `review-loop` and `file-pr`. While GitHub Actions is out of minutes, its red checks mean nothing and nobody waits for them.
- **`pnpm run verify` replaces CI.** It runs what CI runs on macOS. Put the result in the PR. Windows isn't checked until CI returns.
- **The project manager agent merges.** It merges PRs one at a time and reruns `verify` on anything `main` has moved under.
- **The user merges anything that lets Berry do more without asking.** Say so at the top of the PR.
- **Tests stay small:** unit tests plus one end-to-end test of the main flow. If a test fails with no link to the change, rerun it once and move on. Look into it only if the same test keeps failing. Don't write tests for test helpers.
- **Fake models only prove plumbing.** A change to what Berry does also needs a real run with the key in `.env`, on real sites, and the PR says what it cost. Link `.env` from the main checkout into your worktree when you need it. Never print it or commit it.
- **New screens are built from [DESIGN.md](./DESIGN.md), with no mockup step.** Look at them in the running app in both layouts, light and dark, and attach what you saw. A screen DESIGN.md doesn't cover yet gets a section there in the same PR.
- **No dead controls.** Anything visible works, or says why it can't yet. Remove sample data when the real feature arrives.
- **Keep this file current.** Update the state column in the PR that finishes the work.
