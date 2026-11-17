# Blueberry design

Blueberry is an AI browser that should feel like a good desktop app with one capable colleague inside it. The direction is **Pips**: a quiet window in light grey, white sheets for pages, and a small family of berries who do the work. A pip is the seed of a fruit and a dot on a die, and both are meant. The mascots are berries, and what they're doing is said in dots.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

**Where this stands**

- **It replaces Bloom.** The old document is at [docs/design/DESIGN-bloom.md](./docs/design/DESIGN-bloom.md), kept only for how screens that aren't redrawn yet behave. Nothing in it binds this one.
- **Three builds are in.** Tokens, type, the mascots, the pips, the window in both layouts (sidebar or tab row, dock, toolbar and address field), the new tab, the main chat, the chat panel, what a reply can be, the working view, Settings and the account menu wear Pips. The mascot on web pages still wears Bloom's layout in Pips colours, until it's built.
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

**Vertical is the default.** Horizontal is a setting that applies without a restart. Both arrange the same components. Mock for horizontal: [horizontal-layout.html](./docs/design/mocks/horizontal-layout.html).

| Region | Vertical | Horizontal |
|---|---|---|
| Sidebar | Left, straight on the ground, with no card of its own. It has two faces, Tabs and Chats | None. Tabs are a row, Chats and the dock are in the toolbar, bookmarks are a bar |
| Tab row | None | The top row: tabs, a mascot's job as a group, then + |
| Toolbar | A row above the page: back, forward, reload, the address field, the chat panel button | Edge to edge: back, forward, reload, the address field, downloads, the chat panel button, Chats, the dock, the account button, and off a Mac the app's menu |
| Bookmarks bar | None | Favourites, then bookmarks, under the toolbar. Not there with nothing saved |
| Web page | One white sheet, 8px in from the window's right and bottom edges | The same, 8px in at the sides and bottom |
| Chat panel | A second sheet on the right, which pushes the page | The same |
| Internal pages | Drawn by the chrome where a page would be: on a sheet when they have content, in the well when they're waiting for one | The same |

Sizes (*to tune*):

| Item | Value |
|---|---|
| Sidebar | 248px default, resizable 200 to 360px, collapses fully |
| Chat panel | 348px default, resizable 320 to 480px |
| Toolbar | 48px, the address field 32px tall and at most 560px wide |
| Horizontal rows | Tab row 42px, toolbar 44px, bookmarks bar 30px |
| Horizontal tab | Equal shares up to 196px, down to 36px with only its icon. The one in front keeps room for its name |
| Chats over the page | 296px wide |
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
3. **Overlay views:** small views for anything that floats over a page, such as menus, the revealed sidebar, and in the horizontal layout Chats and a mascot's card.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view,** because the chrome view is underneath tab views. The one exception is what's drawn in the page while a mascot works there (see Over a web page).
- **Overlay views are only as large as what they show.** Assume a transparent area blocks clicks. The one exception is what opens from the horizontal toolbar: its view covers everything under the toolbar's own row, so a press anywhere outside the panel closes it, as with a menu.

## 3. Surfaces

There are five, and they're flat. Nothing is glass except the pills drawn on a web page.

| Surface | What it's for |
|---|---|
| **Ground** | The window: the sidebar and the toolbar sit straight on it |
| **Sheet** | Anything with content: a web page, a chat, the chat panel, a card, a menu |
| **Tray** | One step darker than the ground: favourite tiles, the address field, the dock, the group round a job's tabs, the shell round a card |
| **Well** | Where a page will go. The new tab has no page yet, so it has no sheet: an empty well with a faint dot grid that fades towards the middle. The working view sits in a well too |
| **Sheet 2** | A quieter fill on a sheet: your own message, an inset block of exact words, an off button |

- **A card set into a shell.** Anything you type into or have to answer is a `card` inside a tray-coloured shell, 4px larger all round, with the shell's radius 4px more than the card's so the corners stay concentric. A line of words can sit in the shell under the card. The prompt box, an approval and "your turn" are all built this way, so they read as one family.
- **Lines, not boxes.** Lists are rows, split by space or one hairline. A card is for one thing that needs you.
- **The active row is a sheet:** white, with a hairline and a small shadow, on the ground or on a tray.

## 4. Tokens

Components use tokens only, never raw colours.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#F5F5F6` | `#131312` | The window |
| `tray` | `#E8E8EB` | `#1F1F1D` | Tucked and recessed surfaces |
| `well` | `#F0F0F2` | `#191918` | Where a page will go |
| `sheet` | `#FFFFFF` | `#272725` | Content |
| `sheet-2` | `#F3F3F5` | `#313130` | Quiet fill on a sheet |
| `card` | `#FFFFFF` | `#313130` | A card set into a shell in a chat: the prompt box, an approval, your turn. A sheet in light, and a step up from the sheet in dark, so it doesn't sink into the page it's on |
| `card-2` | `#F3F3F5` | `#3D3D3B` | Quiet fill on a card: the off Send, the +, the page chip, the exact words |
| `ink` | `#141416` | `#EEEDE8` | Text, and the one filled button |
| `ink-2` | `#5C5C61` | `#A6A49D` | Secondary text |
| `ink-3` | `#69696E` | `#97958E` | Labels, times, finished steps |
| `faint` | `#8A8A8F` | `#77756F` | Placeholders and hints only, never something that must be read |
| `line` | ink at 9% | white at 9% | Hairlines |
| `dot` | ink at 16% | white at 13% | The dot grid in a well |
| `hover` | ink at 5% | white at 6% | Hovered rows and outline buttons |
| `press` | ink at 9% | white at 10% | Pressed |
| `ask` | `#C62B31` | `#FF6B6B` | Something needs you |
| `ask-bg` | `#FBE4E3` | `#3A1F1F` | Behind `ask` text, where it needs a fill |
| `focus` | `#3F51DC` | `#8FA0FF` | Blueberry blue: the focus ring, and a switch that's on. Nothing else in the chrome |

**The light paper is a light, neutral grey, a shade towards cool.** A warm grey was the first choice, and was tried in the running app beside a neutral grey of the same lightness and this lighter one, which was chosen. Every neutral in light mode has the same faint tint, so nothing looks tinted against its neighbour. Dark mode keeps its own greys.

**How the light surfaces step,** from furthest back to nearest: `tray` (232), `well` (240), `ground` (245), then `sheet` (255). The window is nearly white, so a sheet is told from the ground by its edge, the `rim`, `chip` or `up` shadow it always carries there, more than by its fill. What's set into the ground, such as the address field, the switch strips and the dock, is a `tray`, the darkest step, so it reads as a hollow. `sheet-2` (243) is only for a quiet fill on a sheet or a card: a field, a hovered row, your own message. It's close to the ground's own colour, so it never goes straight on the ground or the well, where it would vanish: there a fill is a `tray`, and anything raised is a sheet with `chip`.

Contrast, measured:

| Text | On ground | On tray | On well | On sheet | On sheet 2 |
|---|---|---|---|---|---|
| `ink`, light | 16.9 | 15.0 | 16.2 | 18.4 | 16.6 |
| `ink-2`, light | 6.1 | 5.4 | 5.8 | 6.6 | 6.0 |
| `ink-3`, light | 5.0 | 4.5 | 4.8 | 5.5 | 4.9 |
| `faint`, light | 3.2 | 2.8 | 3.0 | 3.4 | 3.1 |
| `ink`, dark | 15.9 | 14.1 | 15.0 | 12.8 | 11.1 |
| `ink-2`, dark | 7.5 | 6.6 | 7.1 | 6.0 | 5.2 |
| `ink-3`, dark | 6.2 | 5.5 | 5.9 | 5.0 | 4.3 |
| `faint`, dark | 4.0 | 3.6 | 3.8 | 3.2 | 2.8 |

- **`ink-3` is only just 4.5:1 on a tray in light mode, and under it on sheet 2 in dark.** Use `ink-2` there for anything that must be read.
- **`ask`** is 4.6:1 on `ask-bg`, 5.1:1 on the ground and 5.5:1 on a sheet in light, and at least 5.4:1 in dark.
- **The filled button** is `ground` on `ink`: 16.9:1 light, 15.9:1 dark.
- The mascots' own colours are in section 9.

### Radius, spacing, elevation

- **Radius:** 9px for rows and small chips, 12px for tiles and groups, 16px for sheets and cards in the chat with 20px for the shell round one, 24px for the prompt card with 28px for its shell, and full for buttons, pills and Send.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48px. The mocks still carry a few values off this grid, and those go when it's built.
- **Elevation** has five steps. Everything that is a surface of its own has an edge you can see: a hairline and a soft shadow under it, never a flat fill on a flat ground.

| Step | Light | Dark | Used for |
|---|---|---|---|
| `rim` | A 1px line at ink 7%, and `0 1px 2px` at ink 6% | A 1px line at white 8% | The page sheet |
| `chip` | A 1px line at ink 9%, and `0 1px 2px` at ink 7% | A 1px line at white 10%, and `0 1px 2px` at black 40% | A raised button, the chosen side of a switch, a hovered row on the well |
| `up` | A 1px line at ink 7%, `0 1px 1px` at ink 4%, `0 3px 6px -1px` at ink 5%, and `0 10px 20px -8px` at ink 10% | A 1px line at white 8%, and `0 10px 20px -8px` at black 50% | The active row in the sidebar |
| `card-lift` | `rim`, and `0 10px 24px -12px` at ink 20% | A 1px line at white 9%, and the same shadow at black 55% | A card in its shell |
| `lift` | A 1px line at ink 6%, `0 1px 2px` at ink 5%, and `0 14px 34px -10px` at ink 16% | A 1px line at white 7%, and the same shadow at black 60% | Menus, the chat panel, the picture in the working view |

## 5. Typography

Two families, both bundled with the app and never fetched: **Geist** for words, **Geist Mono** for what a mascot is doing. The mocks load them from the network only because they're mocks.

| Size | Family | Used for |
|---|---|---|
| 30px, medium, tight | Geist | The greeting on the new tab |
| 20px, semibold, tight | Geist | A page's title, such as History or Your mascots |
| 15px, regular or medium | Geist | The title of a card that needs you, what you type in any prompt box, and every message in a chat |
| 14px | Geist | Everything else: rows, lists, body text outside a chat. A row's name is medium |
| 13px | Geist | Buttons, and the second line of a row |
| 12px, medium | Geist | Section labels, in words with a capital, in `ink-2`. Status pills |
| 12px | Geist Mono | The exact words of what a mascot wants to do |
| 11.5px | Geist Mono | Status words, steps, times, counts |
| 11px | Geist Mono | A key on a keycap |

- **Regular and medium,** and semibold for a page's title alone.
- **Tabular figures** wherever numbers line up, such as times and prices.
- **Mono means "the machine's words":** what a mascot is doing or did, the exact words of what it wants to do, a time, a count, a key. Never a label, never a value such as On or Not set up, never a mascot's limits, and never a mascot's own reply. A page of lower-case mono reads as a terminal, which this isn't.
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

1. **A mascot's face** while it works. The two eyes become the grid (section 9). Beside a reply that's still running, the face is the pips: on a bare Thinking line they move, and the face and the words are the whole indicator, with no pips of its own on the line. Beside the working line they hold still, because the line's own pips and the live step's are what move there.
2. **Status:** the address field while a mascot drives the tab, and the pills on the page.
3. **Steps in a chat:** moving on the live one, a still mark on each finished one.
4. **A loading tab,** where its favicon will be.
5. **The switch** between two mascots, for the moment between their faces.

They are always beside words, so nothing depends on reading a pattern.

**A step's kind comes from the tool that made it,** and picks its pips:

| The step | While it happens | Once it's done |
|---|---|---|
| Opening a page, going back, closing a tab | Thinking | The diagonal |
| Reading a page, fetching one, looking at it | Reading | The top two rows |
| Looking over its elements, scrolling, checking tabs | Scanning | The top two rows |
| A search, on the web or in the page | Searching | The top two rows |
| A click, a hover, a drag, a choice | Clicking | The plus |
| Typing, a key | Typing | The bottom row |
| Asking you, or handing you a tab | Waiting for you, in `ask` | The tick |
| Waiting a moment, and a step with no kind, from before kinds or from the cloud | Thinking | The tick |

## 7. Motion

Crisp: quick to start, gently settling.

| Kind | Duration |
|---|---|
| Hover, press | about 100ms |
| A menu opening | about 150ms |
| A line sliding out from under a card, a panel | about 280ms |
| Switching mascots, the longest in the chrome | 420ms in all |

- **Easing:** `cubic-bezier(.2, .8, .2, 1)` (*to tune*).
- **One thing moves per area.** The areas are the sidebar, the toolbar, the conversation, the working view and the page. In the sidebar that's the working mascot's own row, and the dock's faces stay still. In a conversation it's the working line: its pips and the live step's move together, as one indicator of one job. The one stated exception is in there: the live line's words shimmer with its pips, a band of `ink` passing through `ink-3` every 2.4s, linear, and the dots and their words count as one thing. Only the live line does it, the Thinking line or the live step, in the chat and the chat panel, and it stops with the pips under Keep Berry still and reduced motion, where the words are plain `ink`. A loading tab and something waiting for you may move as well, since each is a different thing to know.
- **Overshoot is the mascots' alone:** a mascot pops when it arrives. Nothing else in the chrome bounces.
- **Loops** only while real work is happening, stopping as soon as it ends.
- **Interruptible:** every transition can reverse from wherever it is.
- **Web pages:** never animate page content.
- **Reduced motion:** follow the system setting and the CSS media query. Pips show one still frame, the live line's words stop shimmering, a mascot changes with a short fade, and nothing slides.

## 8. Component states

Mock: the controls at the end of [shell-and-chat.html](./docs/design/mocks/shell-and-chat.html). The sizes, edges, pills and buttons as they are now: [polish.html](./docs/design/mocks/polish.html), which wins where the two differ.

| State | Treatment |
|---|---|
| Default | Neutral |
| Hover | `hover` behind it. The filled button lightens a step |
| Pressed | `press`, and it shrinks to 96%, in about 100ms |
| Focused | A 2px `focus` ring with a 2px gap in the ground's colour, never removed. The prompt box is the exception, and so are the fields in the cards that make a mascot, which are built like it: the caret marks focus |
| Current | A sheet with `up`. The text stays regular, so rows don't shift |
| Off | `tray` behind `faint` text, with a reason where possible, and based on real state |
| Loading | The pips, only while work is really happening |
| Error | `ask` with words and a way forward |

- **Buttons have three roles:** filled in `ink` for the one decision, raised beside it, and quiet text for everything else. A view has at most one filled button, and a row in a list never carries one. A button is 32px tall with 13px medium text, or 28px where it belongs to a row. Filled has a 1px highlight along its top edge, white at 14%, and `0 1px 2px` at ink 25% under it. Raised is a sheet with `chip`, in `ink`: it replaces the outlined button everywhere, because a faint outline on a sheet reads as off.
- **A row's own action shows on the row you're on:** Chat on a mascot, Pick up on a suggestion, as a 28px raised button on the hovered or focused row, with a faint arrow at rest. A decision is never hidden this way: Allow and Don't allow are always both on screen.
- **State is a pill, never a mono word.** 24px tall, 12px medium, on `sheet-2`: "Not set up" in `ink-2`; "Connected" or "On" in `ink` after a 6px dot in `focus`; and in `ask` on `ask-bg` after an `ask` dot when it needs you, with what's wrong in two or three words. When there's a next step it's a raised button beside the pill, named for what it does: **Set up**, **Try again**.
- **Icons** are 16px at a 1.75 stroke, in `ink-2` at rest and `ink` on anything current. An icon that stands for a thing, such as a connection, sits on a 32px tile with a 10px radius, `sheet-2` and a hairline, in `ink`.
- **A row in a group** has its name at 14px medium and one line under it at 13px in `ink-2`. Text that doesn't fit is rewritten shorter before it's cut with an ellipsis.
- **A section label** is words with a capital, 12px medium in `ink-2`, with its count and its + on the same line.
- **The dot grid never sits behind text.** It fades out behind anything that's read.
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

Every feature keeps working either way, and turning it off never prompts the user to reconsider. Settings has the two as one choice, under Mascots: Moving, Still or Hidden.

## 10. Screens

Mock for all of this section unless one is named: [shell-and-chat.html](./docs/design/mocks/shell-and-chat.html).

### First run

Mocks: [first-run.html](./docs/design/mocks/first-run.html), and [first-run-after-trying.html](./docs/design/mocks/first-run-after-trying.html) for the key, history and What I can see, which wins where the two differ.

The first launch is Berry and one card in the middle of an empty window: the well with its dot grid, and no sidebar, toolbar or tabs yet, because there's nothing to browse with until it's set up. Each step is the card that makes a mascot (Your mascots): 520px wide, set into a shell, Berry standing on its top edge at 64px, the step in mono (`2 / 5`), a question at 20px semibold in Berry's voice, one line under it, and the answer. In the shell: a round Back, a dot for each step with the current one long, and the filled button, which Enter presses.

| Step | It says | The answer | The button |
|---|---|---|---|
| | Hi, I'm Berry. | Berry at 88px and the greeting at 30px medium. Two sentences on what it does and that it always asks before anything that matters, and under them, in `ink-3`, that this takes two minutes and all of it can be changed later. No step number | Get started, with **I already have an account** as a link across from it |
| 1 | First, who are you? | Your name, Email and Password, each a 40px field under its label, the password with an eye to show it and "At least 8 characters." under it. The line under the question says what an account is for: publishing mascots, jobs in the cloud and answering from your phone, and that what you browse stays on this computer | Create account |
| 2 | Make it yours. | The card is 680px and in two halves. On the left, Theme and Tabs as the pictures from Settings. On the right, on `tray`, a small drawing of the window that changes as they're pressed, and the real window changes with it | Continue |
| 3 | Give me a brain. | OpenAI and Anthropic as two tiles side by side, 60px tall, each with the service's own mark in `ink`, its name and what it gives ("GPT models", "Claude models"). The chosen one is a sheet with a 1.5px `ink` ring. Under them is one field, 46px, "Paste your OpenAI key", with **Paste**, raised, inside it at its end. Under the field, one line at 12.5px in `ink-3` saying it's kept encrypted on this computer and that you pay the service for what's used, and across from it **Get a key**, which opens the service's own page for making one. The line under the question says only that Berry thinks with an AI service, using a key that's yours | Try the key, then Continue |
| 4 | Shall I bring your history over? | The browsers found, as rows to choose from, each with its own icon on a 34px tile, read from the app installed on this computer, never drawn by us or fetched. The chosen row is a sheet with a 1.5px `ink` ring and a check. Then three short lines: what comes across, what never does, and that it stays here | Bring it in, with **Skip** under the card |
| 5 | What I can see. | One statement on `sheet-2`, with an eye: "I read a page only when you ask, and the chat always shows which one. That part isn't a setting." Then, under *Up to you*, three rows that are the real settings: Ask before I act, as When risky or Always, then Suggestions from your history and Offers to remember what you tell me, as switches. Nothing in the list is there only to be read. The line under the question says one thing is always true and the rest are real settings, here or later | Start browsing |

- **An account is asked for on the first run and can't be skipped.** A problem is said under the field it's about, in `ask`: an email already in use, a password that's too short, no connection. **I already have an account** turns the card into "Welcome back." with Email and Password, **Sign in**, and **Make a new account** as a link. Signed in that way, the name step is done. A copy with no server has no account step, and the dots are one fewer.
- **Ask before I act** offers When risky and Always here. Never is only in Settings, where what it risks is said.
- **Only the first run asks.** Signing out later, in Settings, leaves the browser as it is, and what needs an account says so where it's used, as today.
- **The key isn't done until Berry has answered with it.** Try the key sends one short message to the service. While it waits, the field shows the key as its service's prefix, dots and its last four characters with a lock, and at the field's end the pips moving and "Trying it.." in mono. When it works, a Works pill takes their place, Berry answers in words under the field, "Hello, Sam. That works. I can think now.", and the button becomes Continue. A key the service turns down leaves the key in the field, with a hairline in `ask` round it and a sentence under it in `ask` naming the service and what to check. One that couldn't be tried, because the service wasn't reached, says that instead.
- **The key may be put off.** Under the card, **I'll do this later**, and that without a key Berry can't answer but everything else works. A chat with no key then says so and offers **Add a key**, which opens Settings where it's kept.
- **Where the key lives.** It's typed in the chrome's own form and goes to the main process once. It's kept encrypted on this computer, as the cloud's key is, and never comes back to a page of ours: Settings shows only the service and the key's last four characters. Settings > Connections has **AI service** first, with the service's mark, its name and those characters, or Not set up, and its page one step in is the same two tiles and field, with **Remove**. A key saved here is used before one in the `.env` file, which stays for development, and it's only ever sent to its own service's address. **Paste** takes what's on the clipboard only if it has the shape of that service's key, and says so if it doesn't, and choosing the other service empties the field. No tool, mascot, app or phone can reach it.
- **History** is only a step when another browser is found. Only addresses, page titles and visit times from the last 90 days come across, from every profile of that browser, and never passwords, cookies or what was typed. While it comes across, the chosen row shows the pips moving and "Bringing it in.." in mono at its end, and the button can't be pressed. Afterwards the row says how many visits came across, with a Done pill, or that it couldn't read them, which can be tried again or skipped.
- **Leaving part way** keeps what's been done: an account that was made stays made, and the next launch starts at the first step that isn't done.
- **Moving between steps** is the same 200ms slide as making a mascot, with Berry staying where it stands.

**Then the new tab, with First jobs.** Where suggestions will be once there's something to suggest from, a group labelled First jobs, with how many are done in mono ("1 of 3"), and a row for each: a ring that becomes a check, what it is at 14px medium, and one line on why. Bring your history in, a first job to try, which puts its words in the prompt box and sends nothing, and meeting a mascot that only reads, which opens Plain Words in the Gallery. With the key put off, **Give Berry a key** is first. A row that's done is struck through and can't be pressed, **Try it**, raised, shows on the row you're on, and the group goes when every row is done or **Hide** is pressed.

### Sidebar

Mock: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).

Straight on the ground. Under the window controls is a switch between its two faces, **Tabs** and **Chats**. The dock is at the bottom of both.

**Tabs** is a normal browser, with nothing of the assistant in the way of your tabs:

- **Favourites:** a favourite is a bookmark kept on top, as a tile. Same things, two places: a saved site is in one or the other, and the star in the address field counts both. Tiles go four to a row, 40px tall on `tray` with a 12px radius, with the site's icon at 22px. The tile whose site is the tab in front looks selected, as the current tab does: a sheet lifted with `up`. A favourite open in a tab behind gets no mark, and pressing it goes to that tab. With no favourites there's nothing here at all.
- **Moving between them is dragging,** with the menu saying the same. Drag a bookmark up onto the tiles to keep it on top where it's dropped, a tile down into the bookmarks to make it a plain bookmark there, or a tile along the others to reorder. A thin `ink` line shows where it lands, and what's dragged follows the pointer as a row on a sheet. While a bookmark is dragged with no favourites yet, a dashed, tile-high row says "Drop to keep on top". Escape puts it back. A bookmark's menu has **Keep on Top**, a tile's **Move to Bookmarks**, and both **Remove Bookmark**, so the keyboard reaches all of it through the menu key. The app menu's **Keep This Page on Top** does it for the page in front.
- **Bookmarks:** a labelled section that folds, with folders. A folder row shows how many pages it holds and opens to them behind a dotted line. Rows are 32px, as every row in the sidebar is, with the site's icon at 18px. With nothing saved, the section keeps its place and says so in `faint`.
- **A hairline,** then **Tabs** with a count and a plus. A row is 32px with its name at 14px in `ink` and its icon in `ink-2`. The current tab is a sheet lifted with `up`, with its close ×. A loading tab shows the pips where its icon will be. An open chat is a tab like any page.
- **A job's tabs aren't yours.** While a job runs, its chat is a row with its mascot's face, on a `tray` group, and the tabs it opened sit under it, indented behind a dotted line. They close when the job ends, except any you took over.

**Chats** is everything the mascots are doing, did and will do. Mock: [sidebar-chats.html](./docs/design/mocks/sidebar-chats.html).

- **New chat** is the first row, with a plus, in `ink-2`. It opens a new tab with the keyboard in the box, as the plus on Tabs does.
- **Needs you** comes next, labelled in `ask` with a count. Each row is a sheet with `chip`: the asking mascot, the job's name, and the waiting pips in `ask` at its end. Pressing it opens the chat at its card. Whenever anything is here, a dot in `ask` sits on the switch's Chats side, on either face.
- **Working:** each running job, with its mascot's face the pips, and how long it's been going.
- **Done:** chats that finished while you were somewhere else, and that you haven't opened since. The label counts them, "1 new", and each row has its name in medium and a dot in `focus` at its end. Opening one moves it to Earlier. A chat that finished in front of you never comes here, and neither does one you stopped. One that ended in an error does, since you'll want to know. Somewhere else means its tab wasn't the one in front when the reply ended.
- **Routines:** the next three by time, each with the mascot that runs it and when. The arrow on the label opens them all.
- **Earlier:** past chats, newest first, each with the mascot that ran it and how long ago. **Show more** loads the rest.
- **A row is the button,** from edge to edge, and carries no button of its own. What can be done to a chat, renaming and deleting it, is in its menu: the context menu, and a quiet ⋯ that takes the place of the time on the row you're on, by pointer or keyboard.
- **A group with nothing in it isn't shown,** label and all. With no chats at all, New chat is followed by one line in `faint` saying that chats and what the mascots are doing show up here.
- **Times are written one way,** in mono at the row's end. Something going on is how long so far in minutes and seconds, `0:48`, and `1:02:05` past an hour. The past is how long ago: `now` under a minute, `12m`, `2h`, then the weekday for a week, `Sat`, yesterday included, then the date, `3 Nov`. The future is when: the time today, `14:00`, then `tomorrow`, the weekday for a week, then the date. `rowTime` in `shortWords.ts` is the one place this is written, and the mascot's card in the dock uses it too.

**The dock** is on `tray`: every mascot at 26px with its mood for a face, each in a 28px place. It's how you see who is doing what at a glance. Beside it, outside the tray, is the account button. Berry and four fill it at the sidebar's usual width, and more scroll along it.

**A new profile starts with a flock,** so the dock and the pill have someone to show: Berry, and four starters from the Gallery, Plain Words, Competitor Watch, Meeting Prep and Newsletter Builder, one of each berry but the gooseberry. They're ordinary copies, to edit or delete, and they come once: deleting them never brings them back, and a profile that already has mascots of its own gets none.

Section labels are words with a capital, 12px medium in `ink-2`, with a count in mono and a + or an arrow on the same line.

**The dock shows, it doesn't choose.** Pressing a mascot opens its card, above the dock and inside the sidebar: its name, what it may do, what you've allowed it without asking and a way to take each back, what it's doing now, its recent chats, and **New chat with** its name, which opens a new tab with it chosen. Under that, **All your mascots** in quiet text opens the mascots' page, which nothing else in the sidebar leads to. See [switching.html](./docs/design/mocks/switching.html).

### The account menu

Mock: [account-menu.html](./docs/design/mocks/account-menu.html).

**You're beside the dock:** a 30px round button to its right, straight on the ground, with the first letter of your name on a sheet with its rim, or of your email until you've given a name. Signed out, it's a person glyph on `tray`. The dock keeps its room for Berry and four. While the menu is open the button has an `ink` ring.

**The menu opens above the button, inside the sidebar,** as wide as the sidebar's rows, so it needs no overlay there. It's a sheet with a 16px radius and `lift`, and its rows are 32px like the sidebar's own, because it sits among them:

- **Who you are:** your name over your email, or the email alone with no name. Signed out, it says "Not signed in" beside a filled **Sign in**, which opens Settings at Account. With no server set up there's no account at all, so there's nothing here, and the button keeps the person glyph and is named as the menu.
- **Theme:** Light, Dark and System as one segmented control, each with its icon and its name. It changes at once, and it's the same setting as in Settings. In dark the strip is `ground` with the chosen one on `sheet-2`, since `sheet-2` on the sheet would read as raised.
- **Settings, History** and **Downloads,** each with its shortcut in mono, the app menu's own, written as the platform writes it: `⇧⌘J` on a Mac, `Ctrl+Shift+J` on Windows. Settings opens General.
- A hairline, then **Your mascots, Routines** and **Gallery.** Your mascots has Berry's face for its icon.
- A hairline, then **Sign out,** only while signed in.

It's the one way in to those pages that's always on screen. Choosing a row closes the menu. So do Escape and a press outside, and the keyboard goes back to the button. It opens with the keyboard on its first row. Up and down move through the rows, with the theme's three as one row, and left and right through the three. A mascot's card and the menu open in the same place, one at a time.

**With tabs on top** the button comes after the dock in the toolbar, at 28px, and the menu opens under it, 232px wide against the window's right edge, in the overlay view like Chats and a mascot's card. **With the sidebar collapsed,** the button is in the sidebar that slides in over the page, and the menu opens there the same way.

**Your name** is yours to give, under Account. It's kept on this computer only: it's never sent to the server, put in a prompt or published. It's trimmed, at most 60 characters, with no control characters or line breaks, and an empty one clears it.

### Toolbar and the address field

Mock: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html).

Back, forward and reload in `ink-3`, then the address field, then the chat panel button. On an internal page the field shows that page's name.

**The address field is also where a mascot's status is, for the tab in front.** It has five states:

| State | The field |
|---|---|
| At rest | On `tray`: a lock, the real address with its site in `ink`, and real navigation state. A star at its end bookmarks a web page, filled when it's saved, since the toolbar has no other place for it |
| A mascot is working here | Turns `ink`, with `ground` text. From the left: the mascot, its face the pips; what it's doing in mono, such as "Scanning fares..", or "Thinking.." between its own words; the site, dimmed; then **Take over**, outlined, and **Stop**, filled. Take over is there only on a tab the job opened |
| It's waiting for you | The same, with its face Asking and "Waiting for you". **Stop** is outlined and **Answer** is filled, and opens the chat at the card |
| Your turn | `ask-bg` with `ask` text: a lock, "Your turn. Berry can't see this tab", and **I'm done**, filled in `ink`, which is the only thing that gives the tab back |
| You press the field | The address again, on a sheet with the focus ring. The mascot stays as a small still chip at its left, and "Enter takes this tab over" is in mono at its right |

- **Stop is only ever here,** in the chrome. Anything a page can see it can fake, so no control is drawn on a page. It's the same as Stop in the chat.
- **Take over** is the same as clicking in the page: the job can't reach the tab any more and is told why. Going somewhere from the field does the same. On one of the user's own tabs, which a job reaches only while it can see the page, there's nothing to take back yet, so only Stop shows.
- **Beside the field,** on the right, only what has real state: downloads, the zoom when it isn't 100%, and, while the sidebar is closed, what it would say about work elsewhere.
- **It replaces the ring** that used to go round the page while Berry read or used it. Nothing else marks the tab from the chrome but the mascot's row in the sidebar.

**Typing offers what you most likely mean.** While the field is being edited and has text, a menu sheet opens 8px under it, as wide as the field, with up to six 40px rows: open tabs that match, with "Switch to tab" (never the tab in front, a job's own tab, or one of our pages unless its name matches plainly); saved sites, marked "Bookmark"; pages from the history, one per page, visited often and recently first, with when in words ("Today", "Yesterday", a weekday, a date); a search for the words, or "Open" for what looks like an address; and last, after a hairline, **Ask Berry about "…"** with ⌘↵ or Ctrl ↵, which starts a chat with no page as the new tab's box does, on this computer. Each row leads with the site's icon, a star, a clock, a magnifier, an arrow or the mascot's face, then the title at 14px medium, the address at 13px in `ink-2`, and the action at 13px in `ink-2` at the right. Nothing is chosen until Down or Up chooses a row, which fills it with `sheet-2`, shows ↵ and puts its address or words in the field. With nothing chosen, Enter does what it always did. Two or more letters that start a host the person has visited or saved complete inline as selected text, and that page becomes the first row, chosen. Deleting never completes. Escape closes the list and drops the completion, and a second Escape puts the page's address back. The list closes on blur, on going somewhere, and when the field is emptied. It belongs to the editing state only, and it's an overlay view of its own, since a tab's view covers the chrome.

### New tab

No page yet, so no sheet: the well, with its dot grid, and in the upper middle:

- **Placed by the page area's height,** not the window's: the middle of the empty box sits at 43% of it, and the greeting never comes nearer the top than 48px. The lists flow on under the box, so on a short page they scroll, and from about 740px a waiting row and four suggestions fit with nothing pushed off the bottom.

- **The greeting,** "Where to?", at 30px, with the chosen mascot at 40px beside it. With a name from the first run or Settings it's "Where to, Sam?", which is the one place the name is said. It's a mark, not a control.
- **The prompt box,** 640px.
- **Under the box,** 26px down, at most two lists with labels in words. **Waiting for you** comes first, labelled in `ask`, when anything is: each a row on a sheet with `chip`, with the asking mascot, one sentence and **Review**, raised, since a row in a list never carries a filled button. **Suggestions** follows, 16px under it. Mock: [under-the-prompt-box.html](./docs/design/mocks/under-the-prompt-box.html).
- **Waiting for you reads as a sentence:** the asking mascot's name in medium, "wants to" and what it would do with addresses cut to their site, then the job's name in `ink-2`. A question or a sign-in is already a sentence, so it's shown as it is.
- **Suggestions is one list of at most four rows,** in this order: the newest finished chat to **pick up**, one at most; then what Blueberry noticed, in the order it comes; then mascots to **try**, filling what's left, with the ones not chosen when the page opened first. It doesn't reorder while the page is open. Nothing is made up: every row is a real chat, a suggestion that passed its checks, or a mascot with an example from a real run. With nothing to show there's no list and no label.
- **A row** has two lines and a 14px radius: the mascot's face at 26px, its title at 14px medium in `ink`, and under it a sentence on why it's there at 13px in `ink-2`, each cut with an ellipsis. The whole row is the button. At its right is a faint arrow, and on the row you're on, by pointer or keyboard, what pressing it does as a 28px raised button in its place.

| Kind | Its button | Face | Title, then reason | Pressing it |
|---|---|---|---|---|
| A chat to pick up | Pick up | its mascot, delivered | its title, then who finished it and when, and "Pick up where it stopped." | opens the chat |
| A prompt you repeat | Use | Berry | the suggestion, then why | puts the prompt in the box |
| A routine | Set up | its mascot | the suggestion, then why | opens a filled-in routine to save |
| A mascot | Make it | the draft's look, curious | the suggestion, then why | opens a filled-in mascot to save |
| A mascot to try | Try | it, at rest | its example prompt, then its name and the first sentence of what it's for, since the renderer has no Gallery line for it there | chooses it, with the switch, and puts the example in the box |

- **Its states:** at rest it's plain; hovered or focused it's a sheet with `chip`, and focused it also has the standard ring; and **used**, while the box holds what it put there, it stays a sheet with `chip`, until the box is emptied or changed.
- **A suggestion can be dismissed:** a × at the row's end, its own button beside the row's, shows on hover and while the row has the keyboard. Chats to pick up and mascots to try have none.
- **With the sidebar collapsed,** a row of quiet buttons under the suggestions leads to Needs you, Routines, your mascots and Settings. The horizontal layout has none, since Chats, the dock and the menu are in its toolbar.

`Enter` opens anything that looks like an address and asks the mascot about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. The chat panel doesn't open here, because this page has its own box.

### The prompt box

One component everywhere: the new tab, the chat as a page, the chat panel. It is a card set into a shell. Mock for the chips: [the-plus.html](./docs/design/mocks/the-plus.html). For the menu: [the-plus-menu.html](./docs/design/mocks/the-plus-menu.html).

- **The card** holds, from the top: chips for what it's been given to read, what you type, at 15px everywhere, over at least 50px on the new tab and 34px in a chat, and one row of tools. In a chat the card is 16px in a 20px shell, as an approval is, so the chat's cards read as one family, and its tools are the new tab's size. In a chat the card is `card`, which in dark is a step up from the page so it doesn't sink into it, and what's quiet on it is `card-2`: the +, the chips and the off Send. The mascot pill stays `sheet`, a step down from the card in dark, so it still reads as a pill. The new tab's card stays `sheet` on the well, where it already stands out. From the left: **+**, a 32px rounded square on the card's quiet fill, then the **This Mac / Cloud** switch. At the right: the **mascot pill**, then **Send**.
- **What it's given to read** is chips at the top of the card, each with its ×: the page in front, by its icon and site and marked "this page"; an open tab, by its icon, title and site; a picture, by a small thumbnail and its name; any other file, by an icon, its name and a short fact where there's one worth saying, such as "3 pages" or "cut short". Chips are 28px on the card's quiet fill. No chip means the mascot sees no page and no file. Once sent, the same chips sit over the message, at the right, without ×.
- **+ opens a menu** under the box on the new tab, and above it in a chat, as wide as the card. While it's open the + is turned to a × on `press`, and pressing it closes the menu. From the top: **This page**, in the chat panel while the page in front isn't a chip already; the user's **open tabs** under a label in words; a hairline; **A file**; and on the new tab **Show Berry how**. A row is one line: an icon, what it adds, and a quiet note at the right at 13px in `ink-3`, which is a tab's site, "or drop it on the box" for a file and "makes a routine" for Show Berry how. The main chat has no page in front, so no This page.
- **The open tabs are in the menu itself,** newest first, so adding one is a single press. Up to four are listed. With more, three are, over **All 7 tabs**, which swaps the menu for the whole list under a quiet way back. A tab that can't go stays in the list, off, with why under its title in place of its site: "You're signing in there, so it stays yours" for a tab handed to the user, "Berry is working in it" for one another job is using, "Already added". Not listed: the tab in front, which is This page; Blueberry's own pages, which have nothing to read; and tabs a job opened, which aren't the user's to give. A mascot limited to sites is offered only tabs on them, and a line under the label says so in `permissionsInWords`'s words, "Deal Watcher only visits prisjakt.nu". With no tab to offer, one row, **An open tab**, stays in their place, off, and says why: "No other tabs are open".
- **A file** opens the system's dialog. Pictures (PNG and JPEG), PDFs and plain text files, up to five a message and 10 MB each. Anything else is a chip in `ask` with the reason, such as "Videos can't be read", which never goes while the rest still do. Dropping files on the box does the same: while they're over it the shell takes a 1.5px `ink` ring and the card says "Drop to add" in place of its contents, at its own size. Pasting a picture or a file adds it, and pasted words stay typing.
- **Rows that are ruled out stay and say why,** in `faint`, with the reason as their second line. A job going to the cloud can't take a tab from here: "A tab here can't go along to the cloud". One that runs with this computer off can't take a file either, and says so the same way. Chips already in the box take the same reason in `ask`, and don't go.
- **A file stays with its chat.** Its contents are kept with the chat on this computer and go to the AI service again with each later message, so it can be asked about, and are deleted with the chat. A tab's text and picture go with its own message only, and the mascot may work in that tab for the rest of the chat, asking as it does anywhere, until you click, type or go somewhere in it yourself. From then on it's yours again, and the chat has it only if you add it again.
- **The placeholder names who you're asking:** "Ask Berry, or type an address".
- **The cloud switch** is there while the cloud can be used. Choosing a mascot set to work in the cloud starts it on Cloud, and the user can switch it back for one message. It goes away for a mascot that only reads the page in front, since that page isn't in the cloud.
- **The line under the card,** in the shell, is for the chosen mascot's limits and nothing else: in words, with a lock, for as long as that mascot is chosen. Berry, and any mascot with no limits, has no line. What's waiting for you is in the list under the box and on Chats.
- **In a chat** the pill says who and doesn't open, because a chat keeps the mascot it started with. While a reply runs, Send is Stop.

### Choosing a mascot

Mock: [switching.html](./docs/design/mocks/switching.html), which is live.

**One place:** the pill beside Send, on a box that's starting something new. It opens a menu under itself: one row per mascot with its face, its name and what it may do in a line of words at 13px, a tick on the current one, and a last line saying `@` in the box does the same. Typing `@` filters by name. Until `@` is built, that last line is **New mascot** instead, which opens the form for one. The menu opens above the pill in a chat, where the box sits at the bottom.

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
- **No line on top.** The conversation starts at the top of the sheet. The mascot is beside each reply, and the address field has the chat's name. Where a chat runs is only said when it isn't here: a cloud chat's first reply, and a runner chat's, starts with a quiet line in mono, the cloud icon and "in the cloud", over its words. One started from another app says so the same way, with no icon: "from Claude Code".
- **One column.** The conversation and the prompt box share one column, at most 720px wide with 28px either side, so they line up however wide the page is.
- **Your messages** are on `sheet-2`, at the right, with a small corner where a tail would be. A mascot's reply is plain text on the sheet, with its face, 24px, to the left of its first line. It hangs 36px out in the gutter, so the words keep the column. Where the page is too narrow for that, the column's sides grow from 28px to 36px. Beside the Working line the face lines up with it. With Berry hidden there's no face.
- **One face per reply,** in the mood of what it's doing: the pips while it runs, asking while a card or a question waits, Oops when it went wrong, and at rest otherwise, stopped included. Stopped and went wrong say so in the reply, under its words, so their face is the reply's.
- **While it works, one line leads the reply,** and stays for the job's whole life. Mock: [chat-and-asking.html](./docs/design/mocks/chat-and-asking.html). It's mono, with no outline round it: the moving pips, **Working**, and how long. Under it are the steps, each a pip mark and a line of mono. Finished ones are `ink-3`, the live one has moving pips and its words shimmer (section 7). Steps of one kind in a row on one site are one line, "Read 3 pages on klm.com", which opens to show them. What the mascot says between steps is in its own voice, at 15px in `ink-2`, where it said it. While a job runs only its latest steps show, and the line opens the rest. Between steps the last line says "Thinking..", and while a card waits for you it says "Waiting for you.." with the pips in `ask`. A reply with no steps yet has that line alone, where its words will start.
- **When it ends, the line folds where it is:** "Worked 0:48", then "7 steps on klm.com" and a faint arrow, in `ink-3`, above the answer. Pressing it opens the steps in place. The steps never move under the answer, so how it got there and what it found never look alike. A reply that used no tools has no line, and one saved before replies kept their time has no "Worked". The time and the words between steps are saved with the reply for the screen only: the model, the cloud and other apps never get them.
- **A group's words** come from its kind: "Opened 3 pages on klm.com", "Read 3 pages on klm.com", "Looked over klm.com 3 times", "Searched the web 3 times", "Clicked 3 times on klm.com", "Typed 3 times on klm.com", "Waited 3 times". The live step, asking, and anything worth seeing on any trail are never in a group, and words said between two steps keep them apart.
- **The prompt box** is at the bottom, and you can write while it works.
- **What a step says:** what happened, in the user's terms: "Typed Lisbon in To", "Picked 12 to 16 Dec", "Clicked Search flights". Anything typed is cut at 24 characters. In a password, code or payment field it only ever names the field: "Typed in the password field".

### What a reply can be

Mock: [reply-states.html](./docs/design/mocks/reply-states.html).

- **Asking, for leave to do something.** A card in a shell. The title is what it wants, as one sentence at 15px with addresses cut to their site. Under it, at 12px mono in an inset well on `card-2` with a hairline and a 10px radius, and never cut, are the exact words from the tool, which are what's being allowed. Then **Allow**, filled, and **Don't allow**, raised, both 32px, in that order everywhere: here, on Needs you, on the phone page and in Telegram. Mocks: [sidebar-address-approvals.html](./docs/design/mocks/sidebar-address-approvals.html) and [chat-and-asking.html](./docs/design/mocks/chat-and-asking.html).
- **It says why it's asking,** in the shell under the card, starting "Asking because": "Asking because this could carry data, marked above." The tool layer gives the reason as a code (`ASK_REASONS` in `src/shared/asking.ts`), and the sentence for each code is written in the app, so nothing a page or the model wrote is ever in that line. Where the reason is about a piece of the exact words, that piece is marked in them, in `ask` on `ask-bg`, and the line says "marked above" only then. A card with a mark always shows the exact words, even where the sentence would say the same. A card with no reason has no line. The sentences are `REASON_WORDS` in `src/renderer/chrome/src/askingWords.ts`, one for every code or it doesn't compile.
- **Keys.** While the keyboard is on the card, Enter allows and Escape doesn't, and each button shows its key as a keycap, only then, since a key that does nothing is a dead control. The card is its shell and everything in it, so a click on the card puts the keyboard there. On a button, Enter presses that button, as it does anywhere, so Enter on Don't allow never allows: ↵ shows on Allow only while the keyboard is on the card itself or on Allow. The keyboard is never put on a card in a chat, so Enter in the prompt box always goes to what's typed. While a reply runs the box takes no new message, so the words stay in it to send once it's done. On Needs you the open card has it. A key held down doesn't count, and neither does one pressed in the first half second a card is there or takes the keyboard, so answering one card can't answer the next. No key answers your turn: only pressing I'm done gives a tab back.
- **Allow has three sizes.** Pressing Allow means just this once. Its arrow opens the other two: **For the rest of this job**, on this site, until the job ends, and **Always on** this site, for this mascot. Anything that pays, sends or deletes asks every time, and its Allow has no arrow. What's allowed for always is listed on the mascot's card, each with a way to take it back.
- **A question.** A card in a shell, with the question at 15px and, where the mascot offered them, up to three answers as rows to press, 40px each on `card-2`. There's no field in the card. The prompt box under it is where you answer, and says so, "Answer Berry, or pick one above", or just "Answer Berry" where none were offered, so a chat has one place to type, and what's sent while a question waits is its answer. In the shell under the card: **Skip** as quiet text on the left, and a ? on the right, a 28px icon in `ink-3`, which shows "Passwords and codes go in the page, never here." in a small sheet beside it, in the shell, so it never covers an answer, while the pointer or the keyboard is on it. While the keyboard is on the card, A, B and C pick an answer, and the rows show those keys, but not while it's in Needs you's field, where they're letters. Escape does nothing on a question. An answer is words only: with a file or a tab added in the box, it isn't sent and stays there. Passwords, codes and card details are never asked for here.
- **When it asks.** When you typed the request in one of Blueberry's own prompt boxes and it leaves open something that would change the result, such as which market or how many, the mascot asks before it starts, two questions at most, each its own card, and carries on with your answer in the same reply. It asks the same way when a job comes down to a choice only you can make between things it found. It never asks for a simple lookup, or for what it can find out itself. For a long job a wrong start would waste, it may instead answer with a short plan to confirm, which is an ordinary reply that your next message answers. A routine, the cloud, another app and the mascot on the desktop never ask before starting, as nobody may be there, and a question from one of those waits on Needs you.
- **Your turn.** A sign-in, a code or a captcha only the user can do. A card in a shell: a lock, "Sign in on", "Enter the code on" or "Solve the captcha on" and the site, and that the mascot has stepped back from the tab and can't see it, and what you type goes straight to the site. **Go to the tab**, then **I'm done**, which is the only thing that gives the tab back, and **Not now** as quiet text. The site comes from the tab's address and the words from code, so a page can't write them. The line under the card says the mascot waits here until you say so, with the pips in `ask` held still, because the live step above is already moving.
- **When the user is on the tab already,** Go to the tab goes, and **I'm done** is the filled one.
- **Done.** The folded line, the answer, then what it found: each page it used as a chip on `sheet` with `chip`, with its icon, title and site, which open as your own tabs. Then **Copy** and, only after a job that did some work, **Save as routine**, on the last reply only: 28px icons in `ink-3` with no words and no outline, each with its name as a tooltip and to assistive technology. They show only while the pointer is on that reply or the keyboard is in it, and their row keeps its height the rest of the time, so nothing moves. Copy turns to a tick for a moment once it's copied. The chips are what the reply found, so they always show. There's no thumbs up or down until pressing one would do something. A step worth seeing on any trail, something asked, refused or handed back, still shows under the line while it's folded.
- **Something to remember.** Rarely, under a finished reply, one strip on `sheet-2`: the mascot looking curious, the fact in the words it would be kept in, **Remember**, raised, and **No thanks** as quiet text. Ignoring it is as good as No thanks. When and how seldom this appears, and what can never be kept, are unchanged: see What a bird remembers in the old document.
- **Stopped.** The folded line and what it found, as for done, then "You stopped this after 3 steps.", with the reply's face at rest, and **Carry on**, raised, which says "Carry on" as you.
- **Went wrong.** The reply's face in Oops, what happened in plain words under anything it did write, and **Try again**, filled, which says "Try again" as you. The folded line above opens its steps.

### The working view

While a job uses tabs, it can be watched. On the right of the main chat, 420px wide, in a well whose dot grid comes in towards the bottom, with a hairline between it and the conversation. The chat panel doesn't have it, because the page is already beside it. A job with no tab shows nothing.

- **A heading** saying where the mascot is ("Berry is on klm.com"), or that it's waiting: "Waiting for your OK", "Has a question for you", or "Waiting for you" for a tab handed over. Once the job ends it says "Done", "Stopped here" or "It didn't finish". At its right, **Hide work**, which hides the view, and stops the pictures, until **Show work** at the right of the working line. Once the job has ended the line has folded, and nothing to bring back: the reply's chips have its pages. While a card or a question waits, **Answer in the chat** is beside it, which goes to the card. A tab handed over is answered in the tab, so it has none.
- **A picture** of the tab it's in, on a sheet with `lift`, the page's own shape, with its icon and site along its top on `sheet-2`. The page's own pills, and the mascot standing on what it acts on, are in the picture, because the tab counts as watched while it's on screen.
- **A tab the user has,** handed over or taken over, is only that top row, with "You have this tab" at its end, and no picture.
- **The job's tabs** as chips under it: the one it's in a sheet with its rim, the others on `tray`, a loading one with the pips for its icon. Pressing another goes to that tab, to watch. Then **Go to tab**, raised, which goes to the one it's in. Neither takes the tab over.
- **A last line** in mono: how many tabs, that they're behind yours, and, while it works, that they close when it's done.
- **No room:** with less than 900px of page, one line above the prompt box says where the mascot is or that it's waiting, with its face held still and **Go to tab** in mono, and pressing it goes there. There's no picture and nothing is captured.

**What it doesn't have any more,** from Bloom's working view, and where that went:

- **The mascot standing on the picture's edge,** on its own or when it was done. Its mood is on its row in the sidebar and in the address field, and the heading says how it ended.
- **Small pictures of the job's other tabs.** The chips name them, and pressing one goes there, as the pictures did.
- **"Been on…",** the sites it had visited. Each step names its site, and once it's done the pages it used are chips under the reply.
- **Stop.** It's in the address field and the prompt box, the only two places it's drawn.
- **How long it's been going.** That's on the working line in the conversation.

**Pictures protect the user.** They go only to the chrome renderer, through its own channel, and never to the model, a tool, a saved chat or the disk. A tab handed to the user, or taken over by them, shows no picture. The same goes for a page off a mascot's sites ("Scout isn't allowed on this site"), with page access off ("Berry can't see this page"), for a page that may show a code from the phone, and for one that has crashed or couldn't load ("No picture of this page"). Only tabs this job has used are pictured, and only while the chat is in front and the view is showing. A job in the cloud shows its cloud tab's own live view, locked, or the test browser's pictures. How often pictures are taken is unchanged: see The working view in the old document.

### Chat panel

A second sheet on the right, opened with `⌘E` (`Ctrl+E` on Windows), which pushes the page. Its header is the mascot, the chat's name, **New chat** and a close ×. Messages, steps, cards and the prompt box are the same components as the main chat, so the two sizes look like one chat: the steps sit under the same working line, and the prompt box keeps its mascot pill. A reply's face is 20px here, in line with an 8px gap, since the panel has no gutter to hang it in.

- **Empty,** it shows the face of whoever the pill says, 40px, over "Ask about this page, or anything else." Choosing another mascot in the pill changes it.
- **One box everywhere.** The panel's prompt box and cards are the main chat's, `card` cards in `tray` shells. Mock 03 drew them as `sheet-2` cards in a `well` shell, to sit back from the panel's white sheet. Tried in the app, a grey card made an approval look switched off and took away the lift that marks it as needing you, and the page chip, `sheet-2` on `sheet-2`, all but vanished. In dark the two were nearly the same. So the panel keeps the one box.

### Over a web page

Mock: the last window in [mascots-and-pips.html](./docs/design/mocks/mascots-and-pips.html).

What's drawn in a page while a mascot works there, and only while the user can see that tab:

- **A dotted outline** round the thing it's acting on: 1.5px, a few pixels off the edge, in `focus` (*to tune*).
- **Up to three pills** in the page's lower left: the step it's on, with moving pips, under the two before it, fading to 50% and 30%. Each is a pip mark and a few words in mono. This is the one place glass is used: near-black at 70% with a blur, white text, 30px tall.
- **Waiting for you:** the live pill says so, with the pips in `ask`.
- **The mascot stands on it:** at the outline's top right corner, at 24px, with the pips for a face while it acts and Asking while it waits. It doesn't fly. It's simply at the next thing, with the same pop as a switch.

**It only draws.** No clicks, no box, no effect on the page's layout, no text the page or the agent can read, and out of every screenshot. It's in a closed shadow root in the top layer and works on the strictest content security policy. A pill says what a step says, so in a password, code or payment field it only names the field.

**When it isn't there:** in tabs nobody can see; for 5 seconds after the user's last click or key in the page; on a tab handed to the user; while the keyboard is in a password or code field. **On the page they work in**, in Settings under Mascots, removes all of it for a site that reacts badly.

A click doesn't wait for the mascot. Whether it waits a short beat so a watcher can follow is *to settle when it's built*.

### Horizontal layout

Mock: [horizontal-layout.html](./docs/design/mocks/horizontal-layout.html). Three rows above the page, all placed by the layout owner: the tab row, the toolbar, and the bookmarks bar. The page keeps its gutter and radius. Everything in it is the vertical layout's own parts, arranged in a row.

- **The tab row.** Tabs take equal shares up to 196px, down to 36px, where only the icon shows. The tab in front is the sheet with its rim, and keeps its name when the others have lost theirs. Hover is `tray`. A hairline sits between two neighbours that are neither in front nor hovered. A loading tab shows the think pips where its icon would be. **+** comes right after the last tab. The window's buttons keep their corner: on the left on a Mac, on the right on Windows.
- **A mascot's job keeps its tabs together,** after the user's tabs: a `tray` group with the mascot's face, the job's name, then its tabs, and the waiting pips in `ask` at its end while it needs you. It's the row's version of the sidebar's job block. Pressing the face or the name opens the chat.
- **The toolbar runs edge to edge,** 44px tall with 28px buttons. Back, forward and reload, then the address field filling everything up to the tools, with no maximum width here, in the same five states. Then downloads, the chat panel button, **Chats**, the dock, the account button, and off a Mac the menu at the very end.
- **Chats** is a `tray` pill with the word, and the `ask` dot while anything needs you. It opens a panel under itself, 296px wide, with the sidebar's Chats face: New chat, needs you, working, done, routines, earlier. Its arrows lead to Needs you and Routines.
- **The dock** is a `tray` pill with every mascot's face at 22px. Pressing one opens its card, the same as in the sidebar, under it. Its **All your mascots** leads to the mascots' page. When the faces don't all fit beside an address field of at least 320px, it folds to the chosen mascot, any that are asking or working, and a count of the rest, which opens the mascots' page.
- **Chats and a card open over the page,** in an overlay view, since a tab's view covers the chrome. Escape or a press anywhere outside closes them, and the keyboard goes back to what opened them. Opening a chat or a page from them closes them too.
- **The bookmarks bar:** favourites first, as icon tiles, the one in front selected as in the sidebar, then a hairline, then bookmarks with icon and name. Dragging between the two and the right-click menus work as in the sidebar. With nothing saved there's no bar at all.
- **The new tab** is the vertical layout's. Settings is in the account menu, so nothing else needs a link under the box.

### Settings

Mock: [settings.html](./docs/design/mocks/settings.html).

A page in a tab, on the frame (A page in a tab): the sheet, in one column 620px wide. The title is 20px semibold. Under it is a switch with five sections, as wide as the column and built like the sidebar's Tabs and Chats switch: a `tray` strip 32px tall, with the current section a sheet with `chip`. There's no list down the side, because beside the sidebar it would be a second one. Each section is short enough to need no scrolling at the usual window size. The account menu opens General, and another page can open Settings at any section.

**A group is a heading and its rows,** straight on the page, with no sheet around them. The heading is 15px semibold in `ink`, with a hairline under it as long as the rows' own, and 32px over it. A group's name is never weaker than the rows it names, which a small grey label over rows in 14px medium was. **A row** is 52px, or taller with a second line, with a hairline between rows that starts where the text does. Its name is on the left at 14px medium in `ink`, and on the right is one control: a switch, a segmented control, a quiet value with a raised button, a state as a pill, or an arrow to a page one step in. A row that opens something is a button from edge to edge. A row gets one sentence of explanation at most, in `ink-2` at 13px, which may run to a second line. Anything longer goes behind a quiet **More** at its end, or on a page one step in. Where setting something up needs a field, as on the pages behind Connections, it sits under the row's name at the row's full width.

- **A switch** is 34 by 20px. On is `focus` with a white knob, and off is `sheet-2` with a hairline.
- **A choice with a picture:** Theme and Tabs are small drawings of the window, 86 by 56px, with a hairline round each, since a light window is nearly the colour of the sheet it's drawn on, and the name under each. The chosen one has a 1.5px `ink` ring with a 2px gap. System is half light and half dark.
- **App icon** is whose face is on Blueberry's icon in the taskbar or Dock, and what's behind it (mock: [show-berry-how-and-app-icon.html](./docs/design/mocks/show-berry-how-and-app-icon.html)). The row has its name, one line, and the icon as it is now at 72px at its end. Under it, *Who*: Berry, then each of the user's mascots, as the icon itself at 56px with the name under it. Then *Behind it*, at 44px: **Paper** and **Night**, which carry the dot grid fading towards the middle, **Its colour**, a pale tint of the mascot's own colour, and **Glow**, white fading to that colour. The chosen one in each has a 1.5px `ink` ring with a 2px gap, as a choice with a picture has. The icon is a square with rounded corners, a quarter of its width, with the mascot's face at about two thirds of it. It changes at once, and is set again each time Blueberry opens. A pinned shortcut, and the icon shown while Blueberry is closed, stay the one the app ships with, which the systems don't let a running app change, and the line under the row says so. That shipped icon is Berry on Paper, the same drawing, so the default and the shipped one are the same picture. A mascot that's deleted hands the icon back to Berry.

**The sections:**

- **General.** Under *Look*: Theme (Light, Dark, System), Tabs (On the side, On top) and App icon. Under *Browsing*: When Blueberry opens (Your tabs, A new tab), Save files to with **Change**, and Ask where to save each file.
- **Mascots.** Under *At work*: Ask before acting (When risky, Always, Never), with a line under it saying what the chosen one means, and for Never what that risks. Then On the page they work in, and On your desktop, whose line names the shortcut or says another app has it. Under *How they look*: one choice, Moving, Still or Hidden, in place of two switches. Under *What they offer*: Suggestions and Offers to remember, each saying in one line what it sends.
- **Privacy.** What leaves this computer, and Site permissions with how many sites have an answer saved. Under *History*: History, which opens the History page, and bringing it in from another browser, only when there's a browser to bring from.
- **Connections.** Phone, Claude and other apps, and Cloud. Each is a row with its icon on the 32px tile, one line on what it's for, its state as a pill and an arrow to its page. Phone is Not set up, Pairing while a phone is being connected, or Connected. Claude and other apps is Not set up, On, or Couldn't start in `ask`. Cloud is Not set up, Ready, Session open while one runs, or Session still open in `ask` when the provider didn't confirm the last end. Not set up has **Set up**, raised, in place of the arrow, which opens the same page as the row, and Session still open has **Try again**, which ends the session again.
- **Account.** Your name and email with **Sign out**. Under *You*: Name with **Change**, which makes it a field in the row, and Email. Under *Published in the Gallery*: each mascot you've published, with **Copy link** and **Unpublish**. Signed out, it's the sign-in form and one line on what an account is for. With no server, one row says this copy isn't set up for accounts.

**One step in.** A row's arrow opens its page in the same tab and the same column: a quiet back button naming the section it came from, the page's title at 20px semibold, a line or two on what it is, then groups as above. The back button, the toolbar's Back and the Back shortcut all return to the section, because where Settings is lives in its tab, which is also how a restored session and another page find a section or a page. Two are drawn:

- **What leaves this computer** gathers what used to be rows of text, in three groups: *Goes to the AI service* (your messages with the page you ask about, always, the tabs and files you attach, with the message you attach them to and, for a file, each later one in that chat, what a routine is told to do, when it's saved, to name it, and each time it runs, then Suggestions and Offers to remember with their state), *Only when you start it* (publishing a mascot, a cloud job, answering from your phone) and *Stays here*. It only says. The switches are in Mascots. Exactly what Suggestions and Offers to remember send is behind each row's **More**.
- **Cloud:** the Browserbase key and session, the sites it's signed in to with **Add a site**, and what runs with this computer off. Add a site takes the keyboard to the field under the sites. The runner and ChatGPT or Claude keep their controls from before: the runner's email with **Link**, the address to copy with its steps and **Disconnect**, and the switch to run their jobs here.

The pages behind Phone, Claude and other apps, Site permissions and bringing in history aren't drawn. Until they are, each keeps what it has today, laid out in these groups and rows.

### Your mascots

Mocks: [your-mascots.html](./docs/design/mocks/your-mascots.html) and [making-a-mascot.html](./docs/design/mocks/making-a-mascot.html).

A page in a tab, on the frame (A page in a tab), built like Settings: the sheet, one column 620px wide, rows straight on the page. The dock, the account menu and New mascot in the chooser lead here. Where the page is lives in its tab, as in Settings, so Back, the toolbar's Back and a restored session all find the list, a mascot, one of its parts or its memory.

**The list.** The title at 20px semibold, with **Gallery** raised and **New mascot** filled on its right, and one line under it. Then a row per mascot, Berry first, straight on the page. A row is 62px and is a button from edge to edge that opens the mascot's page:

- Its face at 36px, in the mood it's in: the pips while it works, round eyes with the `ask` dot while it waits for you.
- Its name at 14px medium, and one line at 13px in `ink-2` on what it's for: Berry's own line, or the first sentence of its instructions, cut at a word. The Gallery's one-line description isn't on this page without asking the server, so it isn't used.
- On the right, its limits in plain words at 13px in `ink-3`, with no pill, only where they're narrower than Berry's, in a few words (`narrowerLimits`): "Reads only", "This page · reads only", "Only klm.com". While it works, the pips and the site it's on in mono, or **working** with no page open, and while it waits, a **Needs you** pill in `ask` in place of its limits, the only pill on the page. Only the pips move: the face beside them holds still.
- **Chat**, which starts a new chat with it, is a 28px raised button that shows on the row you're on, by pointer or keyboard, in place of its limits, with a faint arrow after it.

There are no cards and nothing to stand on. With mascots hidden a row starts with the plain icon.

**A mascot's own page** is short. On top, straight on the page, is who it is: its face at 64px, its name at 20px semibold, the first three lines of what it's for, with the rest behind its row below, its limits as pills in the Gallery's words (`permissionsInWords`), and **Chat**. Under *Change* is one row for each part, showing what it is now and an arrow: Look, Name, What it's for and Limits. Under *Its things*: What it remembers with a count, Routines with their names and **New routine**, In the Gallery with its state as a pill (Published, Not published, or A copy), only where there's a Gallery server, and for a copy from the Gallery one line saying only its author can publish it, and Works in the cloud as a switch, only where the cloud is set up. Last, alone, **Delete** and its name in `ask`, which asks first. Nothing on this page needs Save, because each part saves where it's changed. Berry's page has no *change* group and no Delete.

**Making one is four questions,** one at a time, asked in the mascot's own voice. Each is a card set into a shell, 520px wide, like the prompt box. The mascot being made stands on the card's top edge at 72px, and changes as the answers do. In the card: the step in mono (`2 / 4`), the question at 20px semibold, one line under it, and the answer. In the shell under the card: a round Back on the left, four dots in the middle with the current one long, and the filled button on the right.

| Step | It asks | The answer | The button |
|---|---|---|---|
| 1 | What do I look like? | The six berries, then the six things to wear, drawn on the chosen berry. The berries not chosen are asleep, and the chosen one wakes. It starts on one picked at random, and **Surprise me** picks again, with a name | Continue |
| 2 | What's my name? | One field, 30px, centred | Continue, once there's a name |
| 3 | What should I do for you? | A text box at 15px. Under it, *Or start from* in words and up to three of the bundled starters the user hasn't added, by name. Pressing one fills in its words and nothing else | Continue, once there are words. There's no Skip, because a mascot can't be saved without being told what it's for |
| 4 | Where can I go, and what can I do there? | Any site or Only these sites, with each site a mono chip with its ×, and Add a site. Then Go to pages, Click and choose, and Type, each a switch | Add and its name |

- **The limits step uses plain words.** Its line says it can always read the pages it's allowed on, that it still asks before anything risky, and that no limit changes that. A site that isn't one is said under the chips in `ask`, and so is Only these sites with none.
- **It ends on a card that reads it back:** the mascot looking pleased, *Added to your mascots* as a label in words, its name at 30px, what it's for, its limits as pills, and **Give it a job**, which opens a new tab with it chosen, beside **Done**, which opens its page.
- **Leaving** part way keeps nothing.
- **Moving between steps** is a 200ms slide of the card's contents, and the mascot stays where it stands. Reduced motion and Still get a fade.
- A suggestion that offers a mascot opens the same steps with its answers filled in.

**Changing a part** is the same card, alone, one step in from the mascot's page: the mascot on top, the part's name as a label in words where the step number was, and **Cancel** and **Save** in the shell. Works in the cloud isn't a step, because all it does is preset a switch.

**What it remembers** is one step in from its page: the title with its name, one line saying that only what the user said yes to is kept, on this computer. An offer waiting for an answer is a card in a shell on top, with where it came from as a label in words, the words at 15px, and **Remember** and **Don't**. Then a group for each place, *Anywhere* first, with a row per thing and **Change** and **Forget** on each. Change makes the row a field. **Forget everything** is last, in `ask`. With nothing kept, the mascot and the sentence saying when it may ask stand alone on the page.

### A page in a tab

Mocks: [fewer-cards.html](./docs/design/mocks/fewer-cards.html), and [pages-and-routines.html](./docs/design/mocks/pages-and-routines.html) for the steps.

Every page of Blueberry's own that opens in a tab uses one frame, from one component, so they can't drift apart: the sheet, as a chat is, and one column 620px wide, which scrolls as a whole. There's no well and no dot grid, because the page has arrived.

- **Lists sit straight on the page.** A card is for what you type into or have to answer (section 3): the prompt box, an approval, a question, a step. A list is never in one, and neither is a group of settings. A page of white cards on grey reads as any app's, and the rows are what's being looked at.
- **On top,** the title at 20px semibold, with the page's own actions on its right: at most one filled, raised for what starts something, and quiet text for what's used now and then, such as **Clear…** or **Open folder**. Under it, one line in `ink-2` on what the page is, only where the title doesn't say it.
- **A group** is what it's called and its rows. Over named settings, as in Settings and on a mascot's own page, that's a heading (Settings). In a list, where it only divides rows of content, such as the days of History or what a routine is waiting on, it's a label in words, 13px medium in `ink-2`, with a count beside it in mono in `faint`.
- **A row** has 8px inside each end and an 11px radius, so the row you're on, by pointer or keyboard, fills with `hover` from edge to edge. A row that opens something is a button from edge to edge. Between rows of two lines is a hairline that starts where the text does, and it goes from above and below the row you're on. Rows of one line, as in History, have no hairlines.
- **The end of a row** is plain words or mono: a time, when it's next, a limit. On the row you're on, what can be done takes its place, as 28px buttons (section 8). A pill is kept for the state that needs you, so it's the one thing on the page that looks like that.
- **Nothing to show** is the mascot, where the page is about it, and one sentence, in the middle of the page with no sheet around them. It's never an empty page with a heading.
- **One step in** works as in Settings: a quiet back button naming where it came from, in the same tab and the same column, and where the page is lives in its tab, so Back, the toolbar's Back and a restored session find it.
- **A search field,** where a page has one, is beside the title's actions: 32px, round, on `sheet-2`, 190px wide, and wider while it has the keyboard. It doesn't take the keyboard when the page opens. The first key typed on the page goes to it, so searching is still just typing, and no ring is lit before the user has done anything.

Settings, Your mascots, Routines, History, Downloads and Needs you are on it. The Gallery moves to it when it's redrawn.

### Routines

Mock: [pages-and-routines.html](./docs/design/mocks/pages-and-routines.html).

**The list.** The title, with **Show Berry how** raised and **New routine** filled on its right, and one line under it. Then the routines, grouped by what matters and in this order, with a group left out when it's empty:

- **Needs you,** its label in `ask`: a routine with a run waiting for you. Its second line says what it's waiting to do, in the card's own sentence, and **Answer**, raised, is always showing at its end, and opens it on Needs you.
- **Running:** the face shows the pips, the second line says where it is, and **Stop** shows on the row you're on. A run waiting to start is here too.
- **Scheduled,** with how many: when it's next is at the end in mono, in a few words ("tomorrow 09:00", "25 Nov 08:00").
- **Paused,** then **Only when you ask,** which also holds a one-off that has run.

A row is 56px and opens the routine's page:

- The face of the mascot that runs it at 28px, in the mood it's in: the pips while a run is going, the `ask` dot while one waits for you.
- Its name at 14px medium. Under it, at 13px in `ink-2`, its schedule in words, then how the last run went in `ink-3`: the first line of its report, "Not run yet", or what went wrong, in `ask`, for one that failed or was interrupted.
- **Run now,** a 28px raised button, shows on the row you're on in place of when it's next, with a faint arrow after it. While a run waits to start there's nothing to press, so the end says "Waiting to start".

With no routines, Berry and one sentence on what a routine is stand in the middle of the page, and the two buttons above are the way in.

**Making one is four questions,** one at a time, in the voice of the mascot that will do it, built from the same card as making a mascot: 520px wide, set into a shell, the mascot standing on its top edge at 72px, the step in mono (`2 / 4`), the question at 20px semibold, a round Back, four dots and the filled button in the shell. The mascot on the card is the one chosen in step 3, and Berry until then.

| Step | It asks | The answer | The button |
|---|---|---|---|
| 1 | What should I do? | A text box at 15px, with one line under it saying it works in tabs of its own and asks before acting, as a chat does | Continue, once there are words |
| 2 | When? | A sentence that reads the answer back, with the parts that were chosen on `sheet-2`: "Every **weekday** at **09:00**". Under it, how often as pills: Once, Every day, Weekdays, Weekly, Monthly, Only when you ask. Then the time as mono chips, 07:00, 08:00, 09:00, 12:00, 17:00, 21:00 and **Other…**, which becomes a time field. Weekly adds the seven days as pills, Monthly a day of the month, and Once a date. Only when you ask has no time | Continue |
| 3 | Who does it? | The flock as rows in the card, Berry first: face, name, and its limits as a pill where they're narrower than Berry's. The chosen row has a check, and the mascot on the card changes to it | Continue |
| 4 | Where may I go? | Anywhere, or Only these sites, with each site a mono chip with its × and Add a site, as in a mascot's limits. A mascot with sites of its own says so in one line, and that this can only narrow them | Save routine |

- **The name is never asked for.** A saved routine is named from what it does, the way a chat is, and the name can be changed on its page. One the user chose is never replaced.
- **Weekdays** is Weekly with Monday to Friday chosen, and reads back as "Every weekday".
- **Under the time,** one line says what happens when Blueberry is closed at that time. With a cloud runner that has accepted, a switch there says **Runs even when your computer is off.**
- **It ends on a card that reads it back:** the mascot looking pleased, *Saved as a routine* as a label in words, then one sentence at 20px medium made from the answers: the schedule, the mascot's name and "will", and what it does in the user's own words, cut at three lines: "Every weekday at 09:00, Berry will read SVT…". The words stay as typed, except that a capital at the start of an ordinary first word goes small. Under it, when it's next in mono, and **Run it now** beside **Done**, which opens the routine's page.
- **Leaving** part way keeps what was typed while the tab stays open, as before, and saves nothing.
- **From Show Berry how,** the steps open with their answers filled in from what was shown. In step 1 the steps are a numbered list in the box, and a value that might differ from run to run is marked where it stands in the sentence, with no box of its own under the text: the value in medium on a tint of `focus`, and beside it in mono what happens to it, `same each run` or `ask me each run`. Pressing the mark switches between the two, and the line under the question says so. A value that's asked for each run adds one line over the steps saying so, which is what a run reads, and that line can't be typed in. Changing the value is editing the text, and a value edited away stops being one. Step 4 starts on Only these sites, with the sites that were used.
- **From a suggestion,** the steps open with its answers filled in.

**A routine's own page** is one page with no sheets, in this order:

- **What it is:** the mascot's face at 44px, the name at 20px semibold, and under it the schedule sentence and when it's next. Pressing the name makes it a field, which is how it's renamed. On the right, **Pause** or **Resume**, raised, and **Run now**, filled. While a run is going Run now is **Stop**, and a routine that only runs when you ask has no Pause. A run waiting for you puts the Needs you pill under the name.
- **What it does,** under its label, in full at 15px, because those words are the routine. **Edit**, quiet, is across from the label and opens the step's card.
- **Three facts in a row,** between two hairlines, with a hairline between each: When, Who does it, Where it may go. Each is its label at 12px in `ink-3` over what it is now at 14px medium, and is a button that opens the same card as its step, alone, with **Cancel** and **Save** in the shell.
- **Runs,** newest first, on a thread: a hairline down the left with a mark on it for each run. The mark is the pips for one that's going, filled `ink` for the one that's open, `ask` for one that went wrong, was stopped or was interrupted, and a ring for the rest. Beside it, when it started at 14px medium, how it went in words, and how long it took in mono at the end. A run opens in place to show its report at 15px and its steps folded, as a finished reply's are, and the newest starts open. A run that's going has **Stop**, and one that went wrong, was stopped or was interrupted says why in one line and has **Run again**.
- Last, alone, **Delete** and its name in `ask`, which asks first.

**Save as routine never leaves the chat.** The icon on a finished reply opens a card under it, set into a shell like an approval: *When should I do this again?*, how often as pills (Every day, Weekdays, Weekly, Monthly) with the time chips, then **Save routine** filled and **Not now** raised. The shell's line says that what to do and who does it come from this chat, and can be changed on the routine's page. Saved, the card becomes one line with the schedule sentence and **Open routine**. Weekly adds the days and Monthly the day of the month, as in the steps. It's offered where it was before: on the last reply of a finished chat where the mascot did some work, in the main chat and in the chat panel.

**How a run behaves** hasn't changed:

- **A run** works like a chat with no page: the same tools, the same Ask before acting setting and the same step limit. It opens its own tabs behind the current view and closes them when it ends, except any the user has been to, which are theirs. It can't reach any other tab, including popups its pages open, which also stay behind and close with it. Its tabs are muted.
- **Each routine keeps its last 50 runs.**
- **Approvals** use the same card and exact words as a chat. The card waits on the routine's page and on Needs you, and so do questions and tabs handed to the user. Nothing is ever allowed for later: closing the app stops the run with nothing done, and the next launch shows it as Interrupted, saying what it was waiting to do.
- **Timing:** a routine runs only while a window is open. A time missed with the app closed or the computer asleep runs once on the next chance, however many were missed, and says it was late. Times missed while paused are not made up. A time that comes while the same routine is still going is skipped. A run starts only while fewer than two are working, and the rest wait to start. A run waiting on the user doesn't count, so other routines carry on, and once allowed it goes straight on, even if two others have started meanwhile. A day the month doesn't have means its last day.
- **In the cloud:** with the switch on, the line under the schedule says it runs in the cloud at that time, even with the computer off, and its run shows as a chat, In the cloud, with its approvals in Needs you. It then never runs here on its schedule, though Run now still runs it here. Paused, it waits in the cloud too. Its time is this computer's own time zone, and a time missed while the runner was down runs once when it's back. Turned off, it says "Moving back to this computer…" in place of its last result, and doesn't run here until the cloud has let it go, so the two never both run it. One that couldn't be sent says "Couldn’t reach the cloud, will retry" the same way.
- **Speaking up:** a result or a needed approval puts a dot on the Routines row until Routines is opened. If the app isn't in front, and the window isn't fullscreen and no tab is playing sound, a silent notification says so, with no page text or approval wording in it. Anything waiting goes through Needs you, and clicking its notification opens the item there. A run the user stopped says nothing.

### Show Berry how

Mocks: [fewer-cards.html](./docs/design/mocks/fewer-cards.html), and [show-berry-how-and-app-icon.html](./docs/design/mocks/show-berry-how-and-app-icon.html) for starting and for nothing noted.

You press **Show Berry how**, do a job once, press Done, and Berry turns it into a routine. Nobody writes a prompt. It watches only between starting and Done, and you read everything it saw before anything happens.

- **Starting:** beside **New routine** on Routines, in the Go menu, and in the page menu on a plain page. With mascots hidden it says **Record a routine**. Started from one of Blueberry's own pages, which aren't watched, it opens a new tab that says what to do, since otherwise nothing seems to happen: the mascot, curious, at 56px, "Show me how." at 20px semibold, two lines saying to go to where the job starts and do it once, and that what's clicked and typed is noted as steps and never a password, then one address field, "Where does it start?", which has the keyboard, up to three of the user's pinned or most visited sites as chips under it, each one press, and a line that a tab already open works too. Started on a web page, nothing opens, as the user is already where the job begins.
- **While it watches,** the toolbar has a small recorder beside the address: the pips, all nine lit in `ask` and breathing, "Watching", how long in mono, how many steps when there's room, and **Done**, filled. It's a `sheet` with `chip`, 32px tall and as wide as what it says. Beside the chat panel on a narrow page it's the pips, the time and Done, and the bookmark star and pin give way to it. The recording ring goes round the page. Both are on every tab, ours too, in both layouts. They're in the chrome, so no page can reach or cover them, and nothing is drawn on the page. Until the first step is noted it says "Do the job once, then press Done" where the time and steps will be, where the toolbar has room for the count, and the time otherwise. Started on a web page, that page is the first step, so the count shows at once.
- **The page,** "What I watched", is a tab of its own and never restored. It opens when Done is pressed, since until then the user is busy in the tab being watched. The steps are grouped by site: the site's icon and name as a label, then its steps on a thread, a hairline down the left that each step's mark sits on. The mark is the still pip pattern of the step it's like (section 6), or a lock for a secret. Beside it, the sentence at 14px with what was typed in medium, and the address at 13px in `ink-3` if it went somewhere. **Leave out** shows on the step you're on, as quiet text.
- **A secret** says "Typed in the password field" with a lock, and under it that it's never saved and that the page is handed to the user there.
- **Done** ends the watching and opens the page. Under the steps are **Turn this into a routine**, filled, and **Throw it all away**, quiet, with what will be sent in words. Closing the tab throws it away, and starting another does too: a page left open from before then shows the same recorder on top and the new steps as they come, with nothing to press until Done.
- **With nothing noted,** the page is the mascot in the middle at 64px, in the mood it has when something went wrong, "I didn't catch anything." at 20px semibold, one line on what leaves a step and what doesn't, and **Show me again**, filled, which starts watching again, beside **Close**, quiet. There's no Turn this into a routine, as there's nothing to turn.
- **The limit:** 150 steps or half an hour, whichever comes first. It then stops by itself and says why.

What's watched, what's never kept, how the notes are sent and what the form starts with haven't changed, and are in [the old document](./docs/design/DESIGN-bloom.md) under the same heading until they're written here.

### History

Mock: [pages-and-routines.html](./docs/design/mocks/pages-and-routines.html).

Opens as a tab with `⌘Y` (`Ctrl+Y` on Windows) and from the menu, with only one open at a time. The title, with the search field and **Clear…** as quiet text on its right, and no line under it. Then a group for each day, labelled Today, Yesterday or the weekday, with the date beside it in `faint`.

- **A row** is 36px, one line: the site's icon, the title at 14px, the site at 13px in `ink-3`, and at the end the time in mono. Pressing it opens the page in a new tab. On the row you're on, **Remove** takes the time's place.
- **Visits in a row to the same site fold into one row,** with the site's name, how many pages, an arrow, and the time of the newest, which opens in place to show them. A search shows every match unfolded, since folding would hide what was found.
- **Show more** loads the next hundred, and search covers titles and addresses. A search with nothing found says so in one sentence where the list was.

Clear… asks first, in a native dialog, because it can't be undone. Deleting history also takes those pages out of tabs' back and forward lists, Reopen Closed Tab and the saved session, and an open tab keeps the page it's showing. Reloading a page isn't a new visit, and neither is coming back to one after a restart. Pages a mascot opens behind the chat stay out of history, and out of the address field's suggestions, until you go to that tab.

### Downloads

Mock: [pages-and-routines.html](./docs/design/mocks/pages-and-routines.html).

The title, with **Open folder** as quiet text with a folder icon on its right, which shows the folder files are saved to, and no line under it. Then a group for each day, newest first.

- **A row** has the kind of file on a 36px tile, as its ending in mono (`pdf`, `dmg`), or a file icon for a name with none, its name at 14px medium, and one line at 13px in `ink-2`: its size and the site it came from, and while it's running how much has arrived and how long is left. At the end, in mono, is when it started, since that's the time that's kept. A running one has a thin `ink` bar under the line and its share at the end, "38%".
- **What can be done shows on the row you're on:** Open, raised, then Show in folder and Remove as icons, when it's finished. Remove takes it off the list and leaves the file alone, and pressing a finished row opens the file. A running one always shows Pause or Resume and Cancel, since a download is something to act on while it runs.
- A file that's gone has its name struck through in `ink-3`, says "Moved or deleted", and offers only Remove.

Files save straight to the folder with no dialog unless Settings says to ask, and never overwrite: a second `report.pdf` becomes `report (1).pdf`. The toolbar has one Downloads button, which opens this page. While anything is running, a ring around the icon shows the combined progress, and the button's label names each file with its percentage. There's no popover, so nothing floats over the page.

### Needs you

Mock: [chat-and-asking.html](./docs/design/mocks/chat-and-asking.html).

Everything waiting for you, from every chat and routine, on one page, on the frame (A page in a tab). Opens as a tab from the sidebar, the menu or the toolbar, with only one open at a time.

- **On top,** the title and one line that counts: "3 things are waiting, from 3 chats. The oldest has waited 4 minutes."
- **One is open at a time,** the oldest first, as the real card, the same one its chat shows. Over its words: the asking mascot at 20px, its name and the job (the chat's title or the routine's name), and how long it's waited in mono. Then the sentence, the exact words with what the reason is about marked, and **Allow** and **Don't allow**, both always showing. In the shell under the card, why it's asking, and **Open the chat** or **Open the routine**.
- **The rest are one line each,** under it, straight on the page: the mascot with the `ask` dot, what it wants at 14px medium, its name and the job at 13px in `ink-2`, how long it's waited, and a faint arrow. Pressing one opens it as the card, and the one that was open becomes a row.
- **A question** opens as its card with its answers and, since this page has no prompt box, one field under them with **Answer**. **Your turn** opens as its card, with Go to the tab, I'm done and Not now.
- **After an answer,** from here or from the phone, the card says what happened for about a second and a half, "Allowed. Scout carries on.", and the next oldest opens. The open card has the keyboard, so Enter and Escape answer it (see Keys, under What a reply can be).
- **Under the list,** how many have been answered this visit, in mono, "1 of 3 answered", and across from it one line about the phone: "Replies from your phone are on", "Replies from your phone are paused" with a problem, or **Answer these from your phone**, which opens Settings at Phone.
- **Nothing waiting** is the mascots at rest, with no sheet, and "Nothing needs you right now." Anyone working is named instead, because resting has to be true.
- Last, one quiet line: passwords and codes go in the page, not through the model.

It answers through `chat:decide`, like the card in a chat, and the job goes on behind it.

**A blocked job asks.** A sign-in, a code or a captcha is something only the user does, so the job calls `hand_to_user` and the row says "Scout needs you to sign in on github.com" or "Scout needs a code for linkedin.com". The site comes from the tab's address and the words from code, so a page can't write them.

- **Go to the tab** goes there. The toolbar on that tab says "Scout can't see this tab" with **I'm done**, in both layouts, since that's where the user will be when they finish. The row has **I'm done** too, and **Not now**. No control on the row or the tab takes a secret. The only text box answers a question, and the question can't ask for one.
- **While the user has it,** no job can reach the tab: not the one that asked, not another with the page open, and no message sends it along. Tools get an error saying the user is busy there. The chat composer says the mascot can't see it, and the working icon and reading ring go away.
- **I'm done** gives the tab back and Berry reads it again. A sign-in can land on an address with a code or token in it, so from then on, while that tab is open, the query and fragment of its address are kept out of everything the model is told. This is the one way a taken tab returns to a job, apart from sending it with a message or a code going in from the phone. The next click there takes it over again, as it would any other time.
- **Not now** tells Berry no. If the user touched the tab it stays theirs and out of every job's reach, so Berry can't read something left half typed, until they close it or send it with a message. If they didn't, it stays the job's. Closing the tab counts as Not now. Stop or closing the app ends the job the same way.
- Any Ask before acting setting hands over, because this isn't permission: Berry simply can't do it.

## 11. Not redrawn yet

These aren't drawn. Until one is, it works as it does today, which [the old document](./docs/design/DESIGN-bloom.md) describes under the same headings. When it's redrawn, anything about it may change, not only its look.

- Find in page, zoom and printing, the page menu
- Gallery and Publishing
- Answering from the phone
- Restoring tabs, A page in trouble, Damaged saved data
- The cloud tab
- A chat on the runner
- Site permissions
- On your desktop
- The public site and the phone page

**To redraw one:** design what would be best, from the parts in sections 3 to 9, look at it in the running app in light and dark, write its section here in the same PR, and delete it from the old document. Don't copy the old look or the old flow to match its neighbours.

## 12. New here, and still open

**Drawn here and not in the app yet,** to be built:

- Bookmark folders. Bookmarks are one list until they exist.
- Allowing for the rest of a job, or always on a site, and the list of what's allowed on a mascot's card.
- Take over on one of the user's own tabs, which needs a way to put a tab out of a job's reach that the job didn't open.
- The mascot standing on what it's acting on, in place of the bird that flew.
- Steps and pills that say what was typed.
- Steps in the present tense while they happen. Main writes each step once, in the past tense, so the live one says "Read klm.com" until then.
- `@` in the box to choose a mascot.

**Still open:**

- **Choosing a look with mascots hidden:** every berry is the plain icon, so the first step only has their names. Whether that step should draw them anyway is open.

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
