# Blueberry roadmap

The plan and how we build it. The goal is a browser that is better than Strawberry, not a copy of it.

The promise we're testing: **give Blueberry the job, carry on with your day, and come back to verified work.**

## What this is for

Blueberry is an assignment from Charles at Strawberry, and the README's challenge text is out of date. The brief: act as CEO and CTO and build what would make Blueberry beat Strawberry, ideally by naming something concrete that's weak in Strawberry today and solving it better. Creativity and thinking about growth count most, and code counts less. The result is a video of about two minutes sent to Charles with this repo. If it looks good, the next step is a day at Strawberry, continuing Blueberry and presenting at the end.

So work is chosen by what improves the video, the growth story or the case against Strawberry. It doesn't need to work perfectly, but what the video shows has to be real.

## Order of work

No date is set. More time and more thought count in our favour, but what's finished comes first, so one thing at a time, merged before the next starts.

**The product:** instead of one Berry, you grow a flock. Each mascot has a name, a look, instructions and skills. Blueberry notices what you repeat and suggests a routine or a new mascot for it, you can publish them to a gallery, and a team can keep a private library. It interrupts you only when it truly needs you. Strawberry's companions are the comparison: set up by hand and shared by email, as far as public sources show.

| # | Work | State |
|---|---|---|
| 1 | **A good agent:** keeping progress at the step limit, real mouse and keyboard, hover, drag, iframes, and asking the user mid-job. Every mascot runs on this. Measured by `evals/`, starting from 14 of 29 jobs done on every run. Stop at about 20, or when the demo jobs work | Next |
| 2 | **Try Strawberry by hand:** its companion builder and one real job, so the claims against it are first-hand | Needs the user, before the gallery |
| 3 | **Mascot profiles, local:** create, name, choose a look, write instructions and pick skills. Chats and routines run as a chosen mascot. A look is one drawing with changeable colours and an accessory. A skill is what we already have: allowed sites, allowed tools, routines and instructions | After the agent |
| 4 | **Suggestions:** from history and routines, Berry proposes a routine or a new mascot, also on the start page. The bar is "you've done this three times", so it works without weeks of data | After profiles |
| 5 | **Needs-you inbox:** every waiting approval, 2FA code and captcha in one place, with a mocked phone notification. Passwords never reach the model or the chat | After suggestions |
| 6 | **Gallery with sign-in:** a small hosted service, sign-in with GitHub or Google, publish and browse. Accounts arrive here, as the first thing that needs them | After the inbox |
| 7 | **Team library:** private sharing, choosing between shared memory and your own copy | After the gallery |
| 8 | **Deadlines on tasks:** "finish by 14:00", with a countdown and useful partial results rather than a predicted end time | If time remains |
| 9 | **Growth:** landing page, a one-page plan for one sharp audience, and the launch video | Once the demo is filmable |
| 10 | **Repo clean-up and sending:** a new README replacing the challenge text, a short architecture walkthrough, the two-minute video script in Swedish, a rehearsed demo run, and access to the private repo for Charles | Last |

Already done: find, zoom, page menu and print; downloads and site permissions; history, tab restore and crash recovery; real pinned sites and no sample account; the real-site evaluation; routines. Page abilities is in progress.

Parked unless the demo needs them: evidence workbook (a strong candidate for the day at Strawberry, with unfinished work in its worktree), files, helpers, exception inbox, task budgets, importing, keys in the app, signed updates and a Windows pass.

## How we build

- **One branch and one PR per working feature, from the latest `main`.** Don't stack PRs. Each runs in its own worktree.
- **Every PR goes through `self-check`, proof and `file-pr`.** One `review-loop` round only for changes that touch what Berry may do, permissions or secrets. While GitHub Actions is out of minutes, its red checks mean nothing and nobody waits for them.
- **`pnpm run verify` replaces CI.** It runs what CI runs on macOS. Put the result in the PR. Windows isn't checked until CI returns.
- **The project manager agent merges.** It merges PRs one at a time and reruns `verify` on anything `main` has moved under.
- **The user merges anything that lets Berry do more without asking.** Say so at the top of the PR.
- **Tests stay small:** one end-to-end test of the main flow, plus unit tests only for real logic. If a test fails with no link to the change, rerun it once and move on. Look into it only if the same test keeps failing. Don't write tests for test helpers.
- **Fake models only prove plumbing.** A change to what Berry does also needs a real run with the key in `.env`, on real sites, and the PR says what it cost. Link `.env` from the main checkout into your worktree when you need it. Never print it or commit it.
- **New screens are built from [DESIGN.md](./DESIGN.md), with no mockup step.** Look at them in the running app in both layouts, light and dark, and attach what you saw. A screen DESIGN.md doesn't cover yet gets a section there in the same PR.
- **No dead controls.** Anything visible works, or says why it can't yet. Remove sample data when the real feature arrives.
- **Keep this file current.** Update the state column in the PR that finishes the work.
