# Blueberry design

Blueberry is an AI browser that should feel like a good desktop app with one capable colleague inside it. The direction is **Pips**: a quiet window in warm grey, white sheets for pages, and a small family of berries who do the work. A pip is the seed of a fruit and a dot on a die, and both are meant. The mascots are berries, and what they're doing is said in dots.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

**Where this stands**

- **It replaces Bloom.** The old document is at [docs/design/DESIGN-bloom.md](./docs/design/DESIGN-bloom.md), kept only for how screens that aren't redrawn yet behave. Nothing in it binds this one.
- **The app still wears Bloom.** Nothing here is built. This document lands with the first build (tokens, type, the mascot and the pips), not before it, so nobody is sent to tokens that don't exist.
- **The mocks** are in [docs/design/mocks](./docs/design/mocks), and each section below names its own. Where a mock and this document disagree, this document is right.
- **Some of it is new.** Where the better design needed something the app doesn't do yet, it's drawn anyway and listed in section 12, to be built.
- **Not everything is drawn.** Section 11 lists what isn't.

## 1. Principles

1. **The page comes first.** Web pages stay solid and get the space. The chrome stays quiet around them.
2. **One colleague at a time.** Berry comes first and is enough on its own. You can add mascots for jobs you repeat, but you always talk to one, it's always clear which, and there is one place to choose.
3. **Calm by default.** Nothing moves or asks for attention without a reason, and at most one thing moves in any area of the window.
4. **Trust you can see.** The UI always shows what a mascot can see, what it's doing and what it isn't allowed to do, and it asks before anything that matters, in the exact words.
5. **A normal browser first.** Tabs, navigation and bookmarks must be excellent with no account and no AI.
6. **Colour belongs to the mascots.** The chrome is grey and ink. Red means something needs you, and nothing else.
7. **Warm in voice, not in decoration.** The character is in what a mascot says and how it moves, never in scenery.

### What we reject

- Scenery, illustration, gradients or glass behind our own UI.
- An orb, a glow or a cursor standing in for the assistant.
- Tinting the window, the prompt box or Send with a mascot's colour. Lingon is red, and red is taken.
- More than one place to choose who you're asking.
- Dots as decoration. A pip glyph always says something.
- Humanoid companions, or a team you have to manage.
- Promo cards and upsells on the new tab.
- Loops that run when no work is happening.
- A mascot guilt-tripping, fishing for attention, or claiming feelings or a life outside the browser.
- Jokes near permissions, payments, sent messages, data or real failures.
- Reading a page unless the user asked.

## 2. Layout

**Vertical is the default.** Horizontal is a setting that applies without a restart, and it isn't redrawn yet. Both arrange the same components.

| Region | Vertical |
|---|---|
| Sidebar | Left, straight on the ground, with no card of its own. It has two faces, Tabs and Chats |
| Toolbar | A row above the page: back, forward, reload, the address field, the chat panel button |
| Web page | One white sheet, 8px in from the window's right and bottom edges |
| Chat panel | A second sheet on the right, which pushes the page |
| Internal pages | Drawn by the chrome where a page would be: on a sheet when they have content, in the well when they're waiting for one |

Sizes (*to tune*):

| Item | Value |
|---|---|
| Sidebar | 248px default, resizable 200 to 360px, collapses fully |
| Chat panel | 348px default, resizable 320 to 480px |
| Toolbar | 48px, the address field 32px tall and at most 560px wide |
| Gutter round the page | 8px |
| Page sheet radius | 16px |
| Sidebar row | 30px for a tab, 27px for a bookmark or a job's tab |
| Prompt box on the new tab | 640px |
| Working view | 420px |
| Minimum window | 900×600 |
| Minimum page width | 480px |

- **When space runs out:** the sidebar collapses first, then the chat panel closes. The page keeps its minimum width.
- **Collapsed sidebar:** it returns when the pointer reaches the window's left edge, sliding in over the page, so it's an overlay view.

### View stack

From bottom to top:

1. **Chrome view:** one window-sized renderer that draws all our UI.
2. **Tab views:** one solid view per tab. Only the active tab is visible.
3. **Overlay views:** small views for anything that floats over a page, such as menus and the revealed sidebar.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view,** because the chrome view is underneath tab views. The one exception is what's drawn in the page while a mascot works there (see Over a web page).
- **Overlay views are only as large as what they show.** Assume a transparent area blocks clicks.

## 3. Surfaces

There are five, and they're flat. Nothing is glass except the pills drawn on a web page.

| Surface | What it's for |
|---|---|
| **Ground** | The window: the sidebar and the toolbar sit straight on it |
| **Sheet** | Anything with content: a web page, a chat, the chat panel, a card, a menu |
| **Tray** | One step darker than the ground: favourite tiles, the address field, the dock, the group round a job's tabs, the shell round a card |
| **Well** | Where a page will go. The new tab has no page yet, so it has no sheet: an empty well with a faint dot grid that fades towards the middle. The working view sits in a well too |
| **Sheet 2** | A quieter fill on a sheet: your own message, an inset block of exact words, an off button |

- **A card set into a shell.** Anything you type into or have to answer is a white card inside a tray-coloured shell, 4px larger all round, with the shell's radius 4px more than the card's so the corners stay concentric. A line of words can sit in the shell under the card. The prompt box, an approval and "your turn" are all built this way, so they read as one family.
- **Lines, not boxes.** Lists are rows, split by space or one hairline. A card is for one thing that needs you.
- **The active row is a sheet:** white, with a hairline and a small shadow, on the ground or on a tray.

## 4. Tokens

Components use tokens only, never raw colours.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#ECEBE7` | `#131312` | The window |
| `tray` | `#E1E0DB` | `#1F1F1D` | Tucked and recessed surfaces |
| `well` | `#E6E5E0` | `#191918` | Where a page will go |
| `sheet` | `#FFFFFF` | `#272725` | Content |
| `sheet-2` | `#F3F2EF` | `#313130` | Quiet fill on a sheet |
| `ink` | `#151514` | `#EEEDE8` | Text, and the one filled button |
| `ink-2` | `#5F5E5A` | `#A6A49D` | Secondary text |
| `ink-3` | `#6C6A65` | `#97958E` | Labels, times, finished steps |
| `faint` | `#8C8A84` | `#77756F` | Placeholders and hints only, never something that must be read |
| `line` | ink at 9% | white at 9% | Hairlines |
| `dot` | ink at 16% | white at 13% | The dot grid in a well |
| `hover` | ink at 5% | white at 6% | Hovered rows and outline buttons |
| `press` | ink at 9% | white at 10% | Pressed |
| `ask` | `#C62B31` | `#FF6B6B` | Something needs you |
| `ask-bg` | `#FBE4E3` | `#3A1F1F` | Behind `ask` text, where it needs a fill |
| `focus` | `#3F51DC` | `#8FA0FF` | The focus ring, blueberry blue. Its only use in the chrome |

The grey is warm on purpose. A cooler grey and a warmer oat were tried beside it and this one was chosen.

Contrast, measured:

| Text | On ground | On tray | On well | On sheet | On sheet 2 |
|---|---|---|---|---|---|
| `ink`, light | 15.3 | 13.8 | 14.5 | 18.3 | 16.3 |
| `ink-2`, light | 5.4 | 4.9 | 5.1 | 6.5 | 5.8 |
| `ink-3`, light | 4.5 | 4.1 | 4.3 | 5.4 | 4.8 |
| `faint`, light | 2.9 | 2.6 | 2.7 | 3.5 | 3.1 |
| `ink`, dark | 15.9 | 14.1 | 15.0 | 12.8 | 11.1 |
| `ink-2`, dark | 7.5 | 6.6 | 7.1 | 6.0 | 5.2 |
| `ink-3`, dark | 6.2 | 5.5 | 5.9 | 5.0 | 4.3 |
| `faint`, dark | 4.0 | 3.6 | 3.8 | 3.2 | 2.8 |

- **`ink-3` is under 4.5:1 on a tray and in a well in light mode, and on sheet 2 in dark.** Use `ink-2` there for anything that must be read.
- **`ask`** is 4.6:1 on `ask-bg` and on the ground and 5.5:1 on a sheet in light, and at least 5.4:1 in dark.
- **The filled button** is `ground` on `ink`: 15.3:1 light, 15.9:1 dark.
- The mascots' own colours are in section 9.

### Radius, spacing, elevation

- **Radius:** 9px for rows and small chips, 12px for tiles and groups, 16px for sheets and cards in the chat, 24px for the prompt card with 28px for its shell, and full for buttons, pills and Send.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48px. The mocks still carry a few values off this grid, and those go when it's built.
- **Elevation** has three steps, and the last two are the only shadows:

| Step | Light | Dark | Used for |
|---|---|---|---|
| `rim` | A 1px line at ink 7%, and `0 1px 2px` at ink 6% | A 1px line at white 8% | The page sheet, the active row |
| `card-lift` | `rim`, and `0 10px 24px -12px` at ink 20% | A 1px line at white 9%, and the same shadow at black 55% | A card in its shell |
| `lift` | A 1px line at ink 6%, `0 1px 2px` at ink 5%, and `0 14px 34px -10px` at ink 16% | A 1px line at white 7%, and the same shadow at black 60% | Menus, the chat panel, the picture in the working view |

## 5. Typography

Two families, both bundled with the app and never fetched: **Geist** for words, **Geist Mono** for what a mascot is doing. The mocks load them from the network only because they're mocks.

| Size | Family | Used for |
|---|---|---|
| 30px, medium, tight | Geist | The greeting on the new tab |
| 18px | Geist | What you type in the prompt box |
| 15px, regular or medium | Geist | The title of a card that needs you, what you type in a chat, and every message in one |
| 13px | Geist | Everything else: rows, lists, body text outside a chat |
| 12px | Geist | Buttons, pills, secondary lines |
| 11.5px | Geist Mono | Status words, steps, exact words, times |
| 11px | Geist Mono | Section labels, in lower case |

- **Regular and medium only.**
- **Tabular figures** wherever numbers line up, such as times and prices.
- **Mono means "the machine's words":** what a mascot is doing or did, the exact words of what it wants to do, and labels. Never for a mascot's own reply.
- **Status is present tense and ends in two dots** while it's happening: "Scanning fares..". A finished step is past tense with none: "Opened klm.com".
- **Messages in a chat are 15px with a 1.55 line height,** yours and the mascot's, in the page and in the panel, because they're read at length. The mocks still draw them at 13px.

## 6. The pips

One 3×3 grid of dots says what a mascot is doing. Dots are 3px with 2px between them, in the colour of the text beside them. A dot is off (16%), trailing (30 or 55%) or on.

Mock: [mascots-and-pips.html](./docs/design/mocks/mascots-and-pips.html).

| While it happens | The dots | Frame |
|---|---|---|
| Thinking, and a tab loading | One dot chases round the ring | 90ms |
| Reading | Fill row by row | 110ms |
| Scanning | A column sweeps across and back | 170ms |
| Clicking | Centre, plus, all, plus, centre | 150ms |
| Typing | The bottom row fills | 200ms |
| Searching | A diagonal sweeps corner to corner | 130ms |
| Waiting for you | All on in `ask`, dimming and returning round a steady centre | 420ms |

A finished step keeps one still mark for its kind: a diagonal for opened, the top two rows for read, the bottom row for typed, a plus for clicked, a tick for done.

**Where they go, and nowhere else:**

1. **A mascot's face** while it works. The two eyes become the grid (section 9).
2. **Status:** the address field while a mascot drives the tab, and the pills on the page.
3. **Steps in a chat:** moving on the live one, a still mark on each finished one.
4. **A loading tab,** where its favicon will be.
5. **The switch** between two mascots, for the moment between their faces.

They are always beside words, so nothing depends on reading a pattern.

## 7. Motion

Crisp: quick to start, gently settling.

| Kind | Duration |
|---|---|
| Hover, press | about 100ms |
| A menu opening | about 150ms |
| A line sliding out from under a card, a panel | about 280ms |
| Switching mascots, the longest in the chrome | 420ms in all |

- **Easing:** `cubic-bezier(.2, .8, .2, 1)` (*to tune*).
- **One thing moves per area.** The areas are the sidebar, the toolbar, the conversation, the working view and the page. In the sidebar that's the working mascot's own row, and the dock's faces stay still. In a conversation it's the live step. A loading tab and something waiting for you may move as well, since each is a different thing to know.
- **Overshoot is the mascots' alone:** a mascot pops when it arrives. Nothing else in the chrome bounces.
- **Loops** only while real work is happening, stopping as soon as it ends.
- **Interruptible:** every transition can reverse from wherever it is.
- **Web pages:** never animate page content.
- **Reduced motion:** follow the system setting and the CSS media query. Pips show one still frame, a mascot changes with a short fade, and nothing slides.

## 8. Component states

Mock: the controls at the end of [shell-and-chat.html](./docs/design/mocks/shell-and-chat.html).

| State | Treatment |
|---|---|
| Default | Neutral |
| Hover | `hover` behind it. The filled button lightens a step |
| Pressed | `press`, and it shrinks to 96%, in about 100ms |
| Focused | A 2px `focus` ring with a 2px gap in the ground's colour, never removed. The prompt box is the exception: the caret marks focus |
| Current | A sheet: white, hairline, small shadow. The text stays regular, so rows don't shift |
| Off | `tray` behind `faint` text, with a reason where possible, and based on real state |
| Loading | The pips, only while work is really happening |
| Error | `ask` with words and a way forward |

- **Buttons have three roles:** filled in `ink` for the one decision, outlined beside it, and quiet text for everything else. A view has at most one filled button.
- **Send has three states:** off until there's something to send, filled when ready, and a filled stop square while a reply runs. It is always `ink`, never a mascot's colour.
- **A switch between two things** is a segmented control, and the chosen side carries its name: "This Mac", "Cloud". The other side is its icon alone.
- **Menus** are sheets with a 22px radius and `lift`. Rows are 40px, or 46px with a second line, and the hovered row gets a 14px-radius `sheet-2` fill.
- **Favicons:** a page with no icon shows the first letter of its site on a small coloured tile.

## 9. The mascots

Berry is a blueberry, and the others are its cousins. Every mascot is one small flat drawing: a body, two eyes, and whatever grows on top. Berry is "it", and it refers to itself as "I". In the UI the word is **mascot**, and together they're **your mascots**. "Bird" and "flock" are gone from what the user reads.

Mock: [mascots-and-pips.html](./docs/design/mocks/mascots-and-pips.html), which also holds the exact shapes.

### The six

Each is drawn on a 48-unit square, body bottom at 46 so it stands on whatever is under it.

| Berry | Body | Eyes | On top | Replaces |
|---|---|---|---|---|
| Blueberry | `#3F51DC`, a round square | White | A small crown, `#2A39B0` | Kingfisher |
| Lingon | `#DF4B3B`, a round square | Ink `#1D1E27` | A stem and one green leaf | Robin |
| Cloudberry | `#F2AE35`, seven large bumps | Ink | A leaf star | Canary |
| Gooseberry | `#86BF4E`, round, two pale stripes | Ink | A dry tuft | Parakeet |
| Raspberry | `#E86A9B`, ten small bumps | Ink | A leaf star | Flamingo |
| Currant | `#262433`, and `#6C6792` in dark mode | White | A dry tuft | Jackdaw |

- **Berry is the blueberry,** with nothing on. Its saved look changes from Jackdaw to Blueberry.
- **"Replaces"** is how a look saved under the old names carries over, keeping each mascot near the colour its owner chose. *To confirm when it's built.*
- **No colour picker,** because every body has to work in both modes and beside the others.
- **The eyes** are two upright bars, 3.8 by 9 units, 12 apart. Against their body they measure at least 4.1:1 (lingon) and up to 15.2:1 (currant).
- **A body's colour isn't required to stand out from the ground.** Cloudberry is 1.6:1 on the light ground and the currant 3.5:1 on the dark one. So nothing relies on a body alone: the eyes carry the shape, a name is always beside it, and every mood has words. A hairline round the paler bodies in light mode is *to tune*.

### Accessories

Nothing, a crown, a cap, glasses, headphones or a bow, as before. Each sits on the body and covers what grows there. They read down to 14px.

### Moods

Every mood has a text label for assistive technology. The mood names in the code don't change.

| Mood | Meaning | The face |
|---|---|---|
| At rest, sitting | Present, nothing happening | Two bars |
| Curious | Looking at something you asked about | Tilted 10°, eyes up and to one side |
| Thinking, fetching | Working | The eyes become the pips, one dot chasing round |
| Asking | Needs your decision | Round eyes, and a dot in `ask` at its top right |
| Delivered | Finished | Two small arcs |
| Oops | Something went wrong | Two bars slanted down and outwards |
| Off duty | Nothing to do for a long time | Two dashes, at half strength |

### Sizes

One drawing at every size, from 14px in a row to 52px. A row uses 18 to 22px, the pill 20px, the dock 26px, and the one beside the greeting 40px.

### Personality and voice

Warm first, with light humour and a bit of dry wit. Capable, observant and kind.

- Keep messages short, with at most one light touch per message. Most have none.
- Say what was done and what could not be done. Never claim a success that cannot be backed up.
- Use plain language with no jokes for permissions, payments, sent messages, data and real failures.

| Moment | Berry says |
|---|---|
| Meeting you | "Hi, I'm Berry. Tell me what you're working on and I'll go and fetch what you need. I'll always check with you before anything important." |
| Task done | "Found three flights under €200. The cheapest leaves at 05:40, so that one's for the brave." |
| Mistake | "Oops, wrong page. Let me try again from the search results." |
| Asking | "This will send the email to Anna. Send it?" |

### When a mascot may interrupt

A mascot only speaks about work the user started: a finished task, a routine result, or something it can't go on without.

| Level | Behaviour |
|---|---|
| Mood change | Nothing else moves or appears |
| The `ask` dot | On its face in the dock, on its row, and on the Chats side of the sidebar's switch, for as long as it waits. Answering clears it, not looking |
| Asking in the chat | Only when it needs a decision to continue |
| Silent system notification | Something new is waiting, or a routine has news, and the app isn't in front |
| Message on the user's phone | Something is waiting and they're away, only if they connected a bot |

A mascot never opens a modal, takes keyboard focus or makes a sound. A notification never comes during fullscreen or while a tab plays sound, and it says who and what kind of thing it is, never the question, the site or anything typed.

### Turning it off

- **Still:** keeps the mascots and stops all movement. Pips hold one frame.
- **Hide Berry:** removes the character everywhere, replacing it with a plain icon and neutral copy.

Every feature keeps working either way, and turning it off never prompts the user to reconsider.

## 10. Screens

Mock for all of this section unless one is named: [shell-and-chat.html](./docs/design/mocks/shell-and-chat.html).

### Sidebar

Mock: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).

Straight on the ground. Under the window controls is a switch between its two faces, **Tabs** and **Chats**. The dock is at the bottom of both.

**Tabs** is a normal browser, with nothing of the assistant in the way of your tabs:

- **Favourites:** pinned sites as tiles, four to a row, 40px tall on `tray` with a 12px radius. The site's icon is 20px. A small dot under a tile means it's open. The last tile is an outlined plus.
- **Bookmarks:** a labelled section that folds, with folders. A folder row shows how many pages it holds and opens to them behind a dotted line. Rows are 27px with the site's icon. With nothing saved, the section keeps its place and says so in `faint`.
- **A hairline,** then **Tabs** with a count and a plus. The current tab is a sheet, with its close ×. A loading tab shows the pips where its icon will be. An open chat is a tab like any page.
- **A job's tabs aren't yours.** While a job runs, its chat is a row with its mascot's face, on a `tray` group, and the tabs it opened sit under it, indented behind a dotted line. They close when the job ends, except any you took over.

**Chats** is everything the mascots are doing, did and will do:

- **Needs you** comes first, labelled in `ask` with a count. Each row is the asking mascot, the job's name and **Review**, which opens the chat at its card. Whenever anything is here, a dot in `ask` sits on the switch's Chats side, on either face.
- **Working:** each running job, with its mascot's face the pips, and how long it's been going.
- **Routines:** the next three by time, each with the mascot that runs it and when. The arrow on the label opens them all.
- **Earlier:** past chats, newest first, each with the mascot that ran it and its age. **Show more** loads the rest.

**The dock** is on `tray`: every mascot at 26px with its mood for a face, then Settings. It's how you see who is doing what at a glance.

Section labels are 11px mono, lower case, in `ink-3`.

**The dock shows, it doesn't choose.** Pressing a mascot opens its card: its name, what it may do, what you've allowed it without asking and a way to take each back, what it's doing now, its recent chats, and **New chat with** its name, which opens a new tab with it chosen. See [switching.html](./docs/design/mocks/switching.html).

### Toolbar and the address field

Mock: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).

Back, forward and reload in `ink-3`, then the address field, then the chat panel button. On an internal page the field shows that page's name.

**The address field is also where a mascot's status is, for the tab in front.** It has five states:

| State | The field |
|---|---|
| At rest | On `tray`: a lock, the real address with its site in `ink`, and real navigation state |
| A mascot is working here | Turns `ink`, with `ground` text. From the left: the mascot, its face the pips; what it's doing in mono, such as "Scanning fares.."; the site, dimmed; then **Take over**, outlined, and **Stop**, filled |
| It's waiting for you | The same, with its face Asking and "Waiting for you". **Stop** is outlined and **Answer** is filled, and opens the chat at the card |
| Your turn | `ask-bg` with `ask` text: a lock, "Your turn. Berry can't see this tab", and **I'm done**, filled in `ink`, which is the only thing that gives the tab back |
| You press the field | The address again, on a sheet with the focus ring. The mascot stays as a small still chip at its left, and "Enter takes this tab over" is in mono at its right |

- **Stop is only ever here,** in the chrome. Anything a page can see it can fake, so no control is drawn on a page. It's the same as Stop in the chat.
- **Take over** is the same as clicking in the page: the job can't reach the tab any more and is told why. Going somewhere from the field does the same.
- **It replaces the ring** that used to go round the page while Berry read or used it. Nothing else marks the tab from the chrome but the mascot's row in the sidebar.

### New tab

No page yet, so no sheet: the well, with its dot grid, and in the upper middle:

- **The greeting,** "Where to?", at 30px, with the chosen mascot at 40px beside it. It's a mark, not a control.
- **The prompt box,** 640px.
- **Under the box,** two short lists with mono labels. **Waiting for you** comes first, labelled in `ask`, when anything is: each a row on a sheet with the asking mascot, one sentence and **Review**, filled. **Since you left** follows: up to three real things, newest first, such as a chat that finished, a routine's result or what's scheduled next. Each is the mascot's face in its mood, one sentence with the name in medium, and a time in mono. Nothing appears unless it's real.

`Enter` opens anything that looks like an address and asks the mascot about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. The chat panel doesn't open here, because this page has its own box.

### The prompt box

One component everywhere: the new tab, the chat as a page, the chat panel. It is a card set into a shell. Mock for the chips and the menu: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).

- **The card** holds, from the top: chips for what it's been given to read, what you type (18px on the new tab, 15px in a chat), and one row of tools. From the left: **+**, a 32px rounded square on `sheet-2`, then the **This Mac / Cloud** switch. At the right: the **mascot pill**, then **Send**.
- **What it's given to read** is chips at the top of the card: a page, by its icon and site, marked "this page" when it's the one in front, or a file. Each has a ×. No chip means the mascot sees no page. **+** adds one from a menu: This page, An open tab, A file, and Show Berry how, which starts showing a job instead of describing it.
- **The placeholder names who you're asking:** "Ask Berry, or type an address".
- **The cloud switch** is there while the cloud can be used. Choosing a mascot set to work in the cloud starts it on Cloud, and the user can switch it back for one message. It goes away for a mascot that only reads the page in front, since that page isn't in the cloud.
- **The line under the card,** in the shell, is for the chosen mascot's limits and nothing else: in words, with a lock, for as long as that mascot is chosen. Berry, and any mascot with no limits, has no line. What's waiting for you is in the list under the box and on Chats.
- **In a chat** the pill says who and doesn't open, because a chat keeps the mascot it started with. While a reply runs, Send is Stop.

### Choosing a mascot

Mock: [switching.html](./docs/design/mocks/switching.html), which is live.

**One place:** the pill beside Send, on a box that's starting something new. It opens a menu under itself: one row per mascot with its face, its name and what it may do in a mono line, a tick on the current one, and a last line saying `@` in the box does the same. Typing `@` filters by name.

**What changes:**

- The mascot, in the pill and beside the greeting.
- The placeholder.
- The limits line slides out under the card if the new one has limits, and back in if it has none. Berry, and any mascot with no limits, says nothing.
- The cloud switch moves to Cloud for one set to work there, and goes away for one that only reads the page in front.

**What doesn't:** the window's colours, the sidebar, the dock, Send, and every chat already begun.

**The switch takes 420ms:**

| At | What happens |
|---|---|
| 0ms | The old one's eyes shut. The placeholder fades |
| 120ms | The new one pops in with the pips for a face. The name and placeholder change, and the limits line starts to slide |
| 420ms | Its eyes open |

Reduced motion and Still get a short fade.

### Main chat

A full page for talking to a mascot about anything. A chat starts from the new tab and then lives as a tab.

- **On a sheet.** The address field shows the chat's name.
- **The header** is one line: the mascot at rest, its name, and where it runs in mono, such as "on this Mac" or "in the cloud". One started from another app says so the same way.
- **Your messages** are on `sheet-2`, at the right, with a small corner where a tail would be. A mascot's reply is plain text on the sheet.
- **While it works:** an outlined block headed **Working** with how long in mono, then its steps, each a pip mark and a line of mono. Finished ones are `ink-3`, the live one `ink` with moving pips. While a job runs only its latest steps show, under a quiet line that opens the rest.
- **The prompt box** is at the bottom, and you can write while it works.
- **What a step says:** what happened, in the user's terms: "Typed Lisbon in To", "Picked 12 to 16 Dec", "Clicked Search flights". Anything typed is cut at 24 characters. In a password, code or payment field it only ever names the field: "Typed in the password field".

### What a reply can be

Mock: [reply-states.html](./docs/design/mocks/reply-states.html).

- **Asking, for leave to do something.** A card in a shell. The title is what it wants, as one sentence at 15px with addresses cut to their site. Under it, in a mono block on `sheet-2` and never cut, are the exact words from the tool, which are what's being allowed. Then **Allow**, filled, and **Don't allow**, outlined, in that order everywhere: here, on Needs you, on the phone page and in Telegram. The line under the card, with the pips in `ask`, says why it's asking, in words from code and never from a page or the model. Mock: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).
- **Allow has three sizes.** Pressing Allow means just this once. Its arrow opens the other two: **For the rest of this job**, on this site, until the job ends, and **Always on** this site, for this mascot. Anything that pays, sends or deletes asks every time, and its Allow has no arrow. What's allowed for always is listed on the mascot's card, each with a way to take it back.
- **A question.** Lighter on purpose, with no shell, because answering it lets nothing happen: the question at 15px, up to three answers to press, a field for your own with Send, and **Skip** as quiet text. Passwords, codes and card details are never asked for here.
- **Your turn.** A sign-in, a code or a captcha only the user can do. A card in a shell: a lock, "Sign in on" and the site, and that the mascot has stepped back from the tab and can't see it, and what you type goes straight to the site. **Go to the tab**, then **I'm done**, which is the only thing that gives the tab back, and **Not now** as quiet text. The site comes from the tab's address and the words from code, so a page can't write them.
- **Done.** The answer, then one row of chips: the steps folded into one ("7 steps · 1m 48s", which opens them) and each page it used, by icon and title, which open as your own tabs. Then **Copy** and, only after a job that did some work, **Save as routine**, as outlined chips.
- **Something to remember.** Rarely, under a finished reply, one strip on `sheet-2`: the mascot looking curious, the fact as a question, **Remember**, outlined, and **No thanks** as quiet text. Ignoring it is as good as No thanks. When and how seldom this appears, and what can never be kept, are unchanged: see What a bird remembers in the old document.
- **Stopped.** The mascot at rest, "You stopped this after 3 steps.", and **Carry on**.
- **Went wrong.** The mascot in Oops, what happened in plain words, **Try again**, filled, and a way to see the steps.

### The working view

While a job uses tabs, it can be watched. On the right of the main chat, in a well, with a hairline between it and the conversation. The chat panel doesn't have it, because the page is already beside it.

- **A heading** saying where the mascot is, and **Hide work**.
- **A picture** of the tab it's in, on a sheet with `lift`, with the site along its top. The page's own pills are in the picture.
- **The job's tabs** as chips under it: the current one a sheet, a loading one with the pips, then **Go to tab**, outlined, which doesn't take the tab over.
- **A last line** in mono: how many tabs, that they're behind yours and that they close when it's done.

**Pictures protect the user.** They go only to the chrome renderer, through its own channel, and never to the model, a tool, a saved chat or the disk. A tab handed to the user, or taken over by them, shows no picture. The same goes for a page off a mascot's sites, with page access off, for a page that may show a code from the phone, and for one that has crashed or couldn't load. Those states, how often pictures are taken, a narrow window and a job in the cloud aren't redrawn: see The working view in the old document.

### Chat panel

A second sheet on the right, opened with `⌘E` (`Ctrl+E` on Windows), which pushes the page. Its header is the mascot, the chat's name and a close ×. Messages, steps, cards and the prompt box are the same components as the main chat, so the two sizes look like one chat.

### Over a web page

Mock: the last window in [mascots-and-pips.html](./docs/design/mocks/mascots-and-pips.html).

What's drawn in a page while a mascot works there, and only while the user can see that tab:

- **A dotted outline** round the thing it's acting on: 1.5px, a few pixels off the edge, in `focus` (*to tune*).
- **Up to three pills** in the page's lower left: the step it's on, with moving pips, under the two before it, fading to 50% and 30%. Each is a pip mark and a few words in mono. This is the one place glass is used: near-black at 70% with a blur, white text, 30px tall.
- **Waiting for you:** the live pill says so, with the pips in `ask`.
- **The mascot stands on it:** at the outline's top right corner, at 24px, with the pips for a face while it acts and Asking while it waits. It doesn't fly. It's simply at the next thing, with the same pop as a switch.

**It only draws.** No clicks, no box, no effect on the page's layout, no text the page or the agent can read, and out of every screenshot. It's in a closed shadow root in the top layer and works on the strictest content security policy. A pill says what a step says, so in a password, code or payment field it only names the field.

**When it isn't there:** in tabs nobody can see; for 5 seconds after the user's last click or key in the page; on a tab handed to the user; while the keyboard is in a password or code field. **Show on pages** in Settings removes all of it for a site that reacts badly.

A click doesn't wait for the mascot. Whether it waits a short beat so a watcher can follow is *to settle when it's built*.

## 11. Not redrawn yet

These aren't drawn. Until one is, it works as it does today, which [the old document](./docs/design/DESIGN-bloom.md) describes under the same headings. When it's redrawn, anything about it may change, not only its look.

- Onboarding
- The horizontal layout
- Suggestions on the new tab
- Find in page, zoom and printing, the page menu
- Show Berry how
- Routines
- The mascots' page and making one (Flock in the old document), and its memory page
- Gallery and Publishing
- Needs you, and answering from the phone
- History, Downloads, Restoring tabs, A page in trouble, Damaged saved data
- Settings, with Claude and Cloud, and the cloud tab
- A chat on the runner
- Site permissions
- On your desktop
- The public site and the phone page

**To redraw one:** design what would be best, from the parts in sections 3 to 9, look at it in the running app in light and dark, write its section here in the same PR, and delete it from the old document. Don't copy the old look or the old flow to match its neighbours.

## 12. New here, and still open

**Drawn here and not in the app yet,** to be built:

- The sidebar's two faces, and everything on Chats.
- Bookmark folders.
- Allowing for the rest of a job, or always on a site, and the list of what's allowed on a mascot's card.
- The reason under an approval, which needs the tool layer to say why it asked.
- Answers to press on a question.
- Files in the prompt box.
- The address field's states: Answer, Your turn with I'm done, and editing while a mascot works.
- The mascot standing on what it's acting on, in place of the bird that flew.
- Steps and pills that say what was typed.
- Waiting for you on the new tab.
- `@` in the box to choose a mascot.
- The cloud switch going away for a mascot that only reads the page in front.

**Still open:**

- **The horizontal layout** has no sidebar, so Chats needs a home there.
- **Needs you, Routines and the mascots' page** as full pages. Chats and the dock lead to them, and they aren't drawn.
- **The words** "bird" and "flock" are still in the code, in AGENTS.md and in the old document.

## 13. Accessibility

- **Standard:** WCAG 2.2 AA for all our UI. The contrast table in section 4 is measured, and re-measured on real windows.
- **Keyboard:** everything works without a mouse. Tab views are separate native views, so focus does not move between chrome and page by itself. Provide shortcuts to jump between sidebar, address field, page and chat, such as `F6`.
- **Screen readers:** everything is labelled, and a mascot's status changes are announced politely. The pips are hidden from them, because the words beside them say the same.
- **System settings:** follow reduced motion, increased contrast and light or dark.
- **Colour:** never the only signal. `ask` always comes with words, and a mascot always with its name.
- **Targets:** at least 24px.
- **The mascots:** no feature depends on one being visible.

## 14. macOS and Windows

macOS is the primary platform for design and polish. Windows must keep working: CI builds and tests on it, and it gets a visual pass on a real Windows PC before release. Linux is not part of this design.

| | macOS | Windows |
|---|---|---|
| Window controls | Traffic lights, top left | System buttons, top right, with that space kept clear |
| Shortcuts | `⌘` | `Ctrl` |
| Menus | System menu bar | An in-window menu button in the top row, with the same menu |
| Corners | System rounded | Rounded on Windows 11, square on older versions |

The window is a solid colour on both, so nothing depends on a native material. The mocks draw neutral window controls and say "This Mac": the words follow the platform.

## 15. Rules for agents

### Do

- Use tokens for every colour, size and duration.
- Build one component that adapts to both layouts and both chat sizes.
- Get sizes from the layout owner.
- Put anything that floats over a page in an overlay view sized to its content, except what's drawn in the page while a mascot works.
- Keep AI calls and agent actions in the main process, behind the typed IPC contract.
- Show real state: navigation, loading, what a mascot can see and what it may do.
- Add every new component to the gallery, in every state, in light and dark.
- Test with reduced motion and keyboard only.
- Run UI changes and look at them, in light and dark.
- Design what would be best, even where the app can't do it yet, and list it in section 12.

### Don't

- Don't inject styles into web pages for chrome effects. The outline and the pills are the only things drawn there, and they have no controls.
- Don't use raw hex values or hard-coded sizes in components.
- Don't add a colour, weight, font, size or shadow that isn't in this document.
- Don't give the chrome a mascot's colour, and don't use `ask` for anything but something that needs the user.
- Don't add a second place to choose a mascot.
- Don't add pips anywhere but the five places in section 6.
- Don't let more than one thing move in an area, or anything loop without real work behind it.
- Don't let anything that pays, sends or deletes be allowed for later. Those ask every time.
- Don't let a mascot joke about permissions, payments, messages, data or failures.
- Don't let a mascot open modals, take focus, make sounds or speak about work the user didn't start.
- Don't read page content unless the user asked.
- Don't fetch fonts, favicons or anything else for the UI from a third party.
- Don't make any feature depend on a mascot being visible.
