# How Blueberry fits together

A walk through the main parts, for someone reading the code for the first time. [AGENTS.md](../AGENTS.md) has the same ground file by file, with every rule, and [DESIGN.md](../DESIGN.md) has the UI.

```mermaid
flowchart LR
  subgraph Mac[Blueberry on the Mac]
    Chrome[Chrome renderer]
    Main[Main process]
    Tabs[Tab views]
    Agent[Agent and browser tools]
  end
  Model[Model provider]
  Supabase[Supabase]
  subgraph Railway[Runner on Railway]
    Runner[Runner]
    Relay[Relay]
  end
  Browserbase[Browserbase]
  Phone[Phone page]
  Apps[ChatGPT and Claude]

  Chrome -- typed IPC --> Main
  Main -- places and loads --> Tabs
  Main --> Agent
  Agent -- tools --> Tabs
  Agent --> Model
  Main -- cloud tabs --> Browserbase
  Main -- rows and functions --> Supabase
  Runner -- same agent code --> Browserbase
  Runner --> Supabase
  Phone --> Supabase
  Apps -- MCP --> Relay
  Relay --> Supabase
```

## Windows, views and the layout

A window is a `BaseWindow` holding a stack of `WebContentsView`s ([src/main/Window.ts](../src/main/Window.ts)). At the bottom is one window-sized chrome view, which draws the sidebar or tab row, the toolbar, the chat panel and the glass. Above it is one view per tab, with no preload and no Node access. On top sit small views for anything that floats over a page: the collapsed sidebar when it slides out ([src/main/Window.ts](../src/main/Window.ts)), the find bar ([src/main/FindBar.ts](../src/main/FindBar.ts)) and the site permission prompt ([src/main/PermissionPromptView.ts](../src/main/PermissionPromptView.ts)).

Views stack by order, so CSS in the chrome can never draw over a page. That's why floating things get views of their own, each only as large as what it shows.

Every chrome view loads the same React renderer in [src/renderer/chrome](../src/renderer/chrome), with a `view` parameter saying which part to draw ([src/main/chromeView.ts](../src/main/chromeView.ts)). Internal pages, such as the new tab page, Flock, Routines, Needs you and Settings, open as tabs with no web view, drawn by the chrome on the same card a web page sits on.

[src/main/Layout.ts](../src/main/Layout.ts) is the only place that decides where regions go. `computeLayout` turns the window size, layout mode and panel widths into rectangles. `Window` places the tab views with them and sends the same rectangles to the chrome renderer, which draws each region there. Nothing else hard-codes a size.

## The typed IPC contract

[src/shared/ipc.ts](../src/shared/ipc.ts) is the one contract between main and the renderer: every channel, its arguments, its result, and which chrome region may call it. It's types only, because the preload is sandboxed and can't load shared runtime code. [src/preload/chrome.ts](../src/preload/chrome.ts) exposes it to the renderer as `chromeAPI`.

`CHANNEL_REGIONS` in [src/main/ipc.ts](../src/main/ipc.ts) lists the regions for each channel, and [src/main/EventManager.ts](../src/main/EventManager.ts) registers every handler through one function that checks the caller first. A call is refused unless it comes from the main frame of one of the named views, at the page that view loaded. So a web page, or a frame inside the chrome, can't call anything, and only the permission prompt can answer a permission request.

## The agent and the browser tools

Every chat goes through [src/main/Chats.ts](../src/main/Chats.ts), which saves it to SQLite and gets the reply from a LangChain agent built in [src/main/agent.ts](../src/main/agent.ts). The model is OpenAI or Anthropic, chosen in `.env`, and LangChain only loads with the first message. A cheaper model from the same provider names chats and does the small jobs elsewhere in the app.

What Berry can do in the browser is in [src/main/browserTools.ts](../src/main/browserTools.ts): `list_tabs`, `read_page`, `find_in_page`, `list_elements`, `click`, `type_text`, `choose_option`, `hover`, `drag`, `press_key`, `screenshot`, `go_to`, `open_tab`, `ask_user`, `hand_to_user` and a few more. They're plain definitions that `agent.ts` wraps as LangChain tools. What they run in a page is in [src/main/pageScripts.ts](../src/main/pageScripts.ts), in an isolated world that shares the page's DOM but not its variables. Scripts in a frame from another origin run in that frame's own world, and nothing it says about itself is believed. Clicks and typing are real mouse and keyboard events sent to the tab where they can be ([src/main/pageInput.ts](../src/main/pageInput.ts)), aimed after the page settles, and a press that would land on anything but the named element is stopped. Frames from another origin, native pickers and drags, and a few fallbacks get scripted input instead.

Tabs a job opens stay behind the user. While a reply runs, its tabs show under the chat in the sidebar, and when it ends they close, except one the user took over or the one the reply points to. Their addresses are saved on the reply. The bird drawn on the page while it works ([src/main/PageActor.ts](../src/main/PageActor.ts) and [src/main/pageActorScript.ts](../src/main/pageActorScript.ts)) only draws, and takes no clicks.

A run has a step limit of 120 model calls. On the last, tools are taken away and the model is asked to write up what it found, once more if it comes back empty, so a long job doesn't end with nothing.

## One set of tools, two kinds of browser

The tools don't use Electron's tab directly. They work through `PageTarget` ([src/main/pageTarget.ts](../src/main/pageTarget.ts)), an interface of what they need: run a script in the page, list frames from other origins, take a screenshot, send input, load an address, wait for it to settle, and hold the page to allowed addresses for the length of an action. `createPageTools` is generic over it.

[src/main/Tab.ts](../src/main/Tab.ts) is the Electron implementation. [src/main/CdpTab.ts](../src/main/CdpTab.ts) is a page in a browser reached over the Chrome DevTools Protocol through `playwright-core`, in plain Node. That's how the same tools run in a Browserbase session ([src/main/browserbase.ts](../src/main/browserbase.ts) and [src/main/cloudBrowser.ts](../src/main/cloudBrowser.ts)), from the app or from the runner, which has no window. Tests use a local headless Chrome in its place ([src/main/localChrome.ts](../src/main/localChrome.ts)).

## Approvals and handoffs

A tool that changes something has a `describe` function, which gives the exact sentence of what will happen. Depending on the Ask before acting setting, and the tool's own `isRisky` check, the call pauses through LangChain's human-in-the-loop middleware and shows a card with that sentence. The user answers through `chat:decide`. If the page changed after they allowed it, nothing happens and the model is told to look again. In the default mode, going to an address asks unless it's plainly safe, such as one the user gave or a plain address on a site the job has reason to be on. That reason never covers an address that could carry data out, such as one with a query.

Cards show in the chat, on Routines and on the Needs you page, which lists everything waiting ([src/renderer/chrome/src/pages/NeedsYouPage.tsx](../src/renderer/chrome/src/pages/NeedsYouPage.tsx)). With a Telegram bot connected, [src/main/Phone.ts](../src/main/Phone.ts) sends the same items from jobs on this computer to the user's phone through [src/main/TelegramChannel.ts](../src/main/TelegramChannel.ts), and answers go back through the same `chat:decide`.

A sign-in, code or captcha is a handoff. `hand_to_user` gives the tab to the user, and no job can reach it until they press I'm done. A code sent from the phone is typed into the field by [src/main/codeEntry.ts](../src/main/codeEntry.ts), the only thing that can use a held tab. The model is only told that a code went in, and for an hour `Chats` takes the code out of anything it's told in case the page shows it again, and that tab gives no screenshots.

## Mascots and their limits

The flock is saved in `mascots.json` by [src/main/MascotStore.ts](../src/main/MascotStore.ts), with Berry always first and never on file. The rules are in [src/shared/mascots.ts](../src/shared/mascots.ts): `parseMascotDraft` checks anything that becomes a mascot, whether typed, copied from the Gallery or sent from the phone, and `narrowSites` combines two lists of sites so the result can only be smaller.

A mascot's limits reach `createPageTools` as `limits`. Tools it wasn't given are dropped. `TOOL_NEEDS` says what each tool needs, and a tool missing from it goes to no limited mascot. Anything off its sites is refused before it's asked about, read or opened, and a screenshot is withheld while a frame from another site is on the page. Its name and instructions go into the prompt through [src/main/mascotNote.ts](../src/main/mascotNote.ts), after the safety rules, but no limit or approval ever reads the prompt.

The Gallery ([src/main/Gallery.ts](../src/main/Gallery.ts) and [src/main/mascotCatalog.ts](../src/main/mascotCatalog.ts)) copies exactly the version the user reviewed, through the same checks. [src/shared/publishing.ts](../src/shared/publishing.ts) holds the extra rules for anything from strangers. `blueberry://` links are read by [src/main/mascotLink.ts](../src/main/mascotLink.ts), which accepts only `blueberry://mascot/<uuid>` and only opens the review.

## Memory

What a bird remembers is in `memory.json` ([src/main/MemoryStore.ts](../src/main/MemoryStore.ts)), apart from the mascot, so copying or publishing one can't take it along. After a job, `Chats` only asks the cheap model for an offer when `statesAHabit` in [src/main/mascotMemory.ts](../src/main/mascotMemory.ts) finds the user's own words saying something goes beyond this job. The model gets what the user typed, their answers and the site names, never a page or a step. An offer becomes a fact only when the user accepts it through `memory:decide`. `relevantFacts` picks what goes into each job, and `memoryNote` puts it in the prompt as preferences.

## Suggestions

[src/main/Suggestions.ts](../src/main/Suggestions.ts) decides what the birds on the new tab page say. [src/main/suggestionDigest.ts](../src/main/suggestionDigest.ts) builds what the cheap model reads: browsing sessions, search queries, chats, routines, the flock and earlier feedback, each item with a short id. Page text and full addresses aren't in it. The model proposes prompts, routines or new mascots citing those ids, at most about once an hour, and `verifyProposals` in [src/main/suggestionProposals.ts](../src/main/suggestionProposals.ts) drops any that cites an id that isn't there, or whose words on the card hold a number its evidence doesn't. Its sites are narrowed to the ones in its evidence, and a routine whose schedule doesn't match when the user really looked becomes a prompt instead. Without a model, the repeated-pattern rules in [src/main/suggestionPatterns.ts](../src/main/suggestionPatterns.ts) fill in.

History from another browser comes in through [src/main/browserHistory.ts](../src/main/browserHistory.ts), which copies a Chromium profile's `History` file to a temporary folder, reads only address, title and time, and deletes the copy.

## The cloud path

Settings > Cloud ([src/main/CloudTabs.ts](../src/main/CloudTabs.ts)) keeps a Browserbase API key and project id, encrypted with `safeStorage`. Do this in the cloud sends a chat to the runner whenever one is linked and has accepted (below). Otherwise it runs `Chats.send` with `cloud: true`, on `CdpTab`s in a Browserbase session the app holds, and its pages show as cloud tabs with the live view locked until the user takes over. Sign-ins come along one site at a time through [src/main/cloudLogins.ts](../src/main/cloudLogins.ts), after Touch ID or a confirm, into a Browserbase Context that keeps them between sessions.

To keep going with the Mac off, jobs become rows in Supabase. The tables and rules are in [supabase/migrations](../supabase/migrations). Nobody inserts into or updates the job and approval tables directly: every write is a security definer function that checks who's calling, and owner and runner are told apart by the `cloud_runner_links` row the owner offered and the runner accepted. `start_cloud_job` sends a job, and `decide_cloud_approval`, the only function that writes a decision, refuses any runner.

The runner ([runner/](../runner)) is a plain Node service for Railway. It signs in as a Supabase user of its own with the publishable key, claims its owner's jobs, and runs each with the app's own `Chats.runTask` ([runner/src/job.ts](../runner/src/job.ts)), so the agent, tools, limits and approvals are the same code. It writes steps and approvals back as rows and waits for the owner's answer. In the app, [src/main/RunnerJobs.ts](../src/main/RunnerJobs.ts) shows those jobs as chats and finds ones started elsewhere. Routines marked to run with the Mac off are synced to the server, and the runner starts them when due ([runner/src/routines.ts](../runner/src/routines.ts)).

The phone page ([site/app/](../site/app)) is static. [site/app/api.js](../site/app/api.js) talks to Supabase with the publishable key and the user's own session, reads their jobs and their shared flock, and writes only through the same functions. Notifications from [runner/src/push.ts](../runner/src/push.ts) carry only whether a job needs the user or finished.

The relay ([runner/src/relay.ts](../runner/src/relay.ts)) is an MCP endpoint on the runner for ChatGPT and Claude, behind OAuth ([runner/src/relayAuth.ts](../runner/src/relayAuth.ts)). When the owner signs in, their session is used once to make a grant and then signed out. Each later call goes through a `relay_*` function that checks the grant and acts for the owner for that one thing. There's no relay function that decides anything. A relay job can also run on the Mac: [src/main/MacJobs.ts](../src/main/MacJobs.ts) claims it while Blueberry is open and its switch is on, and runs it as an ordinary chat.

Local MCP, for Claude Code and Claude Desktop on the same computer, is separate: [src/main/McpConnector.ts](../src/main/McpConnector.ts) serves on 127.0.0.1 with a token, and [src/main/mcpTools.ts](../src/main/mcpTools.ts) turns each job into `Chats.send`, with every limit and approval as in a chat.

## Local data

Everything is saved in the app's user data folder.

| What | Where | Code |
|---|---|---|
| Chats | `chats.db` | [src/main/ChatStore.ts](../src/main/ChatStore.ts) |
| History | `history.db` | [src/main/HistoryStore.ts](../src/main/HistoryStore.ts) |
| Routines and their runs | `routines.db` | [src/main/RoutineStore.ts](../src/main/RoutineStore.ts) |
| Settings | `settings.json` | [src/main/SettingsStore.ts](../src/main/SettingsStore.ts) |
| Open tabs and layout | `session.json` | [src/main/Session.ts](../src/main/Session.ts) |
| Bookmarks and pinned sites | `bookmarks.json`, `pinned.json` | [src/main/BookmarkStore.ts](../src/main/BookmarkStore.ts) |
| The flock | `mascots.json` | [src/main/MascotStore.ts](../src/main/MascotStore.ts) |
| What birds remember | `memory.json` | [src/main/MemoryStore.ts](../src/main/MemoryStore.ts) |
| Suggestions and feedback | `suggestions.json` | [src/main/Suggestions.ts](../src/main/Suggestions.ts) |
| Downloads | `downloads.json` | [src/main/Downloads.ts](../src/main/Downloads.ts) |
| Site permissions | `site-permissions.json` | [src/main/SitePermissions.ts](../src/main/SitePermissions.ts) |
| Account session | `account.json` | [src/main/Account.ts](../src/main/Account.ts) |
| Telegram bot | `phone.json` | [src/main/TelegramChannel.ts](../src/main/TelegramChannel.ts) |
| Cloud key and sign-ins | `cloud.json`, `cloud-logins.json` | [src/main/CloudTabs.ts](../src/main/CloudTabs.ts), [src/main/cloudLogins.ts](../src/main/cloudLogins.ts) |
| MCP token | `mcp.json` | [src/main/McpConnector.ts](../src/main/McpConnector.ts) |

The SQLite files are opened through `node:sqlite` by [src/main/database.ts](../src/main/database.ts). A damaged file is moved aside, never deleted, and the app starts empty for it and says so. Any other failure to open one leaves the file alone and uses an in-memory database for that launch. The account session, the Telegram token, the cloud key and the MCP token are encrypted with Electron's `safeStorage`, and none of them is sent to a renderer.
