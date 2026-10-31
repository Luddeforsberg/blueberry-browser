# Blueberry strategy

Research from 31 October 2026 by a Codex agent (gpt-6.1-sol), using public sources only. Nobody tested Strawberry hands-on or checked its security, and public complaints are few and often old. Three claims were checked against their sources: pricing, routines waiting while Strawberry is closed, and the February review. The rest wasn't rechecked.

**Status: a recommendation, not a decision.** Decisions go in [ROADMAP.md](../ROADMAP.md).

## Recommendation (judgement)

Target **small research agencies producing recurring competitor and pricing reports**. This is a hypothesis, not proven demand. Build an **evidence workbook, an exception inbox, then task budgets**, in that order.

Positioning: **"Blueberry turns browser research into client-ready evidence. Every finding has a source; every gap stays visible."**

## Where Strawberry is weak

The ranking is judgement, not a survey.

1. **Reliability and supervision, the strongest opening.** A [Reddit user on 24 October 2026](https://www.reddit.com/r/AI_Agents/comments/1xe5ard/unpopular_opinion/) tried three times to automate email plus Google Sheets and found setup and monitoring more tiring than doing it by hand. A [Swedish review on 21 February 2026](https://www.zentreprenor.se/test-av-ai-agenten-strawberry-browser/) reports it often getting stuck. These are single workflows, not failure rates.
2. **Speed and unpredictable cost.** A [Reddit user](https://www.reddit.com/r/browsers/comments/1jdx1er/comment/nmkdxaz/) reported a task taking ten times their manual effort, using 80% of their credits in five days, and cancelling. The February review says credits are spent on failed attempts too. Strawberry added [cheaper effort modes on 21 October](https://strawberrybrowser.com/updates/feature-update-2026-10-21), so old complaints may not hold today.
3. **Trust and resource use.** [Early users](https://www.reddit.com/r/browsers/comments/1jdx1er/anyone_tried_strawberry/) mention uncertainty about credentials, heavy resource use and download warnings. None of this shows malware or data theft. Its [privacy policy](https://strawberrybrowser.com/legal/privacy-policy) says it has a SOC 2 Type II report, which wasn't inspected.
4. **Unattended work: a documented gap, unproven demand.** ["Routines run while Strawberry is open on your computer. Anything that comes due while it is closed waits for you to open it again."](https://strawberrybrowser.com/features/routine-automation) Closed-computer running and mobile are [described as future work](https://strawberrybrowser.com/updates/feature-update-2026-08-15).
5. **Onboarding: a weak case.** [Product Hunt reviews](https://www.producthunt.com/products/strawberry/reviews) mostly praise it (4.8 from 13 reviews).

## Audience and pricing

Strawberry targets business teams in sales, recruiting, research and operations, and its policy limits it to business use. [Pricing](https://strawberrybrowser.com/pricing): Free 500 credits, Intern $20 for 6,000, Part-Time $85 for 25,000, Full-Time $250 for 75,000. Top-ups cost $0.01 a credit. Plan credits don't roll over, and top-ups do.

Candidate audiences (judgement):

| Audience | The job | Why they'd switch |
|---|---|---|
| **Small research agencies (recommended)** | Weekly competitor and pricing evidence for clients | Less checking, visible uncertainty, reusable deliverables |
| Small-company operations analysts | Reconciling supplier portals against a spreadsheet | Preview changes, isolate exceptions, resume safely |
| Boutique recruiters | Evidence-backed candidate shortlists | Clear evidence and bounded spend. Recruiting is already a Strawberry strength |

## Feature bets

Estimates are judgement, for 1-2 engineers using agents on a narrow first version. No bet is proven to be globally new.

| Bet | What it is | Who overlaps | Size and risk | 60-second demo |
|---|---|---|---|---|
| **1. Evidence workbook** | Each table cell opens its source excerpt and timestamp, conflicts stay flagged, exports to CSV plus evidence | [Strawberry's reports and reviewable activity](https://strawberrybrowser.com/updates/feature-update-2026-10-01), though not per claim | 2-4 weeks. Dynamic pages and extraction errors are hard. A source shows where a claim came from, not that it's true | Excellent: click a surprising number and see its evidence |
| **2. Exception inbox** | Berry finishes independent rows, queues blocked ones with reasons, and resumes only those | [Strawberry's pause and recovery](https://strawberrybrowser.com/updates/beta-0-1-0-updates), not per row | 1-2 weeks. Dependencies and duplicate actions | Excellent: fix one blocked row without redoing the rest |
| **3. Task budgets** | A spending limit, deadline and minimum useful output, with partial results near a limit | [Strawberry's effort modes](https://strawberrybrowser.com/updates/feature-update-2026-10-21) and credit pauses | 1-2 weeks. Delayed usage data and parallel calls | Strong: stops inside the budget with usable results |
| **4. Safe batch changes** | A row-by-row diff, one trial item, then run and read each change back | [Strawberry's editable approvals](https://strawberrybrowser.com/updates/feature-update-2026-10-01), not batches | 3-5 weeks for one site. Web apps have no reliable undo | Excellent: catches a changed record before submitting |
| **5. Explicit task boundaries** | A task names its allowed tabs, accounts and destinations | [Comet Enterprise](https://www.perplexity.ai/enterprise/comet), [BrowserOS](https://www.browseros.com/) | 2-4 weeks. Prompt injection remains a risk | Strong: refuses an unrelated sensitive tab |
| **6. Durable work** | Checkpoints that survive restarts, and later remote running | [Neon Make](https://www.operaneon.com/lp-b), [ChatGPT Work](https://learn.chatgpt.com/docs/browser) | 2-3 weeks local, 8-12+ cloud. Cloud means holding sign-ins | Strong restart demo, weak first investment |

Generic skills, approvals, local AI and background work are crowded. [Perplexity already offers phone approvals](https://www.perplexity.ai/personal-computer-setup), so that isn't unique.

## Growth

**Best demo, 75 seconds:**

- **0-15s:** Open [Asana](https://asana.com/pricing), [Linear](https://linear.app/pricing) and [ClickUp](https://clickup.com/pricing) pricing. Ask: "Compare the cheapest suitable paid plan for ten people. Separate annual commitment, monthly billing and AI extras. Cite every figure."
- **15-40s:** Berry fills the workbook, with real progress visible. Say so if time is compressed.
- **40-60s, the reaction:** Click a tempting headline price. It reveals its billing commitment and the supporting excerpt, and an unresolved condition stays marked unresolved.
- **60-75s:** Export the comparison with evidence, exceptions and the task's real cost.

**Cheapest demand test:** Ask ten agency researchers for a recent report and measure their checking time. Deliver the workbook by hand using Blueberry as it is, for a $50 paid pilot. Look for three payments and two repeat requests before building much.

**Where to show it:** LinkedIn and X first, then research communities with permission. Product Hunt after repeat use, and Show HN once there's a working product. Measure paid repeat use and reduced checking time, not launch votes.

## What it suggests cutting

- **Routines:** saved research jobs, a manual rerun, one schedule and honest run history. No event triggers yet.
- **Companions:** no general builder yet. Berry plus one saved research brief.
- **Memory:** editable project instructions, without inferred personal memory.
- **Context:** chosen tabs and source-linked answers first. PDFs and attachments when pilots need them.
