# Blueberry roadmap

The plan and how we build it. The goal comes from the README: a browser that is better than Strawberry, not a copy of it. We catch up only where people would otherwise not switch, then win where Strawberry is weak.

The promise we're testing: **give Blueberry the job, carry on with your day, and come back to verified work.**

## What this is for

Blueberry is an assignment from Charles at Strawberry, and the README's challenge text is out of date. The brief: act as CEO and CTO and build what would make Blueberry beat Strawberry, ideally by naming something concrete that's weak in Strawberry today and solving it better. Creativity and thinking about growth count most, and code counts less. The result is a video of about two minutes sent to Charles with this repo. If it looks good, the next step is a day at Strawberry, continuing Blueberry and presenting at the end.

So work is chosen by what improves the video, the growth story or the case against Strawberry. It doesn't need to work perfectly, but what the video shows has to be real.

## Order of work

No date is set. Plan for about a week of evenings and weekends, then book it when the demo is good.

| # | Work | State |
|---|---|---|
| 1 | **Evidence workbook, the main feature:** Berry researches across sites and fills a table. Each cell opens its source with the quote highlighted. A separate checker flags anything unsupported or conflicting, and the table exports | Next |
| 2 | **Try Strawberry by hand:** run the demo job in Strawberry's free plan and record what happens, so the claim against it is first-hand | Needs the user, before the video |
| 3 | **Berry in the demo job:** only the abilities and long-job fixes the demo job needs, found by running it | During the workbook |
| 4 | **Berry as a guide:** the mascot reacts to the workbook, so it has a feel Strawberry lacks. See DESIGN.md section 8 | After the workbook |
| 5 | **Growth:** landing page, a one-page growth plan for one sharp audience, and the demo job as the launch video | After the workbook |
| 6 | **Repo clean-up:** a new README that explains the product and how it fits together, replacing the challenge text | Before sending |
| 7 | **Sending it:** the script for the two-minute video, a rehearsed demo run, and giving Charles access to the private repo | Last |

Already done: find, zoom, page menu and print; downloads and site permissions; history, tab restore and crash recovery; real pinned sites and no sample account; the real-site evaluation; routines. Page abilities is in progress.

Parked unless the demo needs them: sign-ins, files, helpers, saved briefs, exception inbox, task budgets, importing, accounts, keys in the app, signed updates and a Windows pass. Real mouse and keyboard, and the rest of long jobs, are parked on the same terms.

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
