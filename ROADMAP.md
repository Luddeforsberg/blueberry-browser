# Blueberry roadmap

The plan and how we build it. The goal comes from the README: a browser that is better than Strawberry, not a copy of it. We catch up only where people would otherwise not switch, then win where Strawberry is weak.

The promise we're testing: **give Blueberry the job, carry on with your day, and come back to verified work.**

## Order of work

There is no fixed date. Each stage starts when the one before it holds up in real use.

### 1. A browser you can use every day

| Work | State |
|---|---|
| Find in page, zoom, right-click menu on pages, print | Done |
| Downloads, and asking before a site uses the camera, microphone, location and so on | Next |
| Saved history with a history page, restoring tabs after a restart, recovering from a crashed page | Next |
| Real pinned sites, and no sample account | After saved history |

### 2. An agent that can do the job

Berry has 9 tools today: `list_tabs`, `read_page`, `find_in_page`, `list_elements`, `scroll_page`, `click`, `type_text`, `go_to` and `open_tab`. `evals/` measures what they can really do. Its results set the order here.

| Work | State |
|---|---|
| Real-site evaluation: a repeatable set of jobs with a scorecard | Done, first results in `evals/results/` |
| Hands: real mouse and keyboard input, iframes, shadow DOM, a screenshot tool, dropdowns, keys, hover, waiting, back, closing tabs, link addresses | After the evaluation |
| Long jobs: trimming old page text from context, a visible plan, asking the user mid-job, spotting loops, a higher step limit with a budget, model failover | After the evaluation |
| Sign-ins: the user takes over for passwords and 2FA, and these never reach the model, then Berry carries on | After hands |
| Files: uploads, downloads, a folder you choose, PDFs, and reports or tables as results | After long jobs |
| Helpers: splitting a job into parts that run at once, and one view of all running tasks | After long jobs |

### 3. The AI features people expect

| Work | State |
|---|---|
| Real routines: create, schedule, run, run history. Replaces the routine sample data | Done |
| Saved briefs: reusable setups with editable instructions and files. A full companion builder and automatic memory wait until people ask for them | After the agent stage |
| Ask about selected text, chosen tabs, PDFs and attachments, with answers linking to their sources | After routines |

Not planned before stage 5: app connections, extensions, meeting notes, generated slides. We can add one later if it serves the audience we choose.

### 4. Why people switch

We're building for **general power users**: people who already hand real work to an AI and are tired of checking it. [docs/STRATEGY.md](./docs/STRATEGY.md) has the research. Strawberry's clearest weakness in it is the time spent supervising and checking agents, so we win on trust and less checking.

| Work | State |
|---|---|
| Evidence workbook: every cell in a result opens its source, and conflicts and gaps stay flagged | Right after saved briefs |
| Exception inbox: Berry finishes what it can, queues what's blocked with the reason, and resumes only those | After the workbook |
| Task budgets: a spending limit and deadline, with useful partial results | After the inbox |

Still candidates, not scheduled: tasks that survive a closed window, explicit task boundaries, safe batch changes, teaching a routine by doing it once, deadlines that change how Berry works, and help from your phone (Perplexity already offers phone approvals).

### 5. Ready for other people

Onboarding comes once there's something worth arriving at, before anyone outside tries it:

- Importing bookmarks, history, passwords and sign-ins from Chrome, Safari, Arc and Firefox.
- Real accounts, which need a server. What they're for (sync, shared companions, paying for model use) gets decided from the strategy work.
- Keys and models set in the app rather than `.env`, signed updates, and a Windows pass.

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
