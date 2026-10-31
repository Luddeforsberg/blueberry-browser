# Blueberry design

Blueberry is an AI browser that should feel like a good Mac app with one capable colleague inside it. The direction is **Bloom**: the window is made of the fruit. The frame is the dusty, matte skin of a blueberry, solid web pages float on it in one rounded card, and the blueberry itself is the one thing in the chrome with real colour. Blueberry uses no Strawberry or Aside assets.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

## 1. Principles

1. **The page comes first.** Web pages stay solid and get the space. The chrome stays quiet around them.
2. **One colleague at a time.** Berry comes first and is enough on its own. You can grow a flock of birds for jobs you repeat, but you always talk to one, and it's always clear which.
3. **Calm by default.** Nothing moves, glows or asks for attention without a reason.
4. **Trust you can see.** The UI always shows what Berry can see and what it is doing, and it asks before anything that matters.
5. **A normal browser first.** Tabs, navigation and bookmarks must be excellent with no account and no AI.
6. **Crafted and warm.** Warmth comes from Berry's voice, its character and the motion. It never becomes corporate or childish.

### What we reject

- Humanoid companions, or a team you have to manage. The flock is birds you made yourself, and none appears until you ask.
- Promo cards and upsells on the new tab. The idea cards there only link to real features.
- Glass that makes text harder to read, or glass on web pages.
- Beige neutrals and blue-tinted dark mode.
- Bounce in the chrome, and decorative loops that run when no work is happening.
- Berry guilt-tripping, fishing for attention, or claiming feelings or a life outside the browser.
- Jokes near permissions, payments, sent messages, data or real failures.
- Reading a page unless the user asked.

## 2. Layout modes

**Vertical is the default.** Horizontal is a setting that applies without a restart. Both modes arrange the same components, which take a layout setting rather than being built twice.

| Region | Vertical (default) | Horizontal |
|---|---|---|
| Tabs | Left sidebar (see below) | Top row |
| Address bar and navigation | Row above the page | Row below the tabs |
| Bookmarks | A round cluster at the top of the sidebar | A bar under the address bar |
| Chat panel | Right, pushes the page | Same |
| Web page | In one rounded card with the toolbar, floating on the frame | Same |

Sizes (*to tune*):

| Item | Value |
|---|---|
| Sidebar | 280px default, resizable 200–360px, collapses fully |
| Chat panel | 400px default, resizable 320–480px |
| Address row | 40px |
| Top row in vertical mode | 56px, so the window buttons line up with the address row |
| Frame around the page card | 8px where no panel sits beside it |
| Bookmarks bar (horizontal only) | 36px, with a hairline under it |
| Sidebar row | 34px |
| Horizontal tab row | 40px |
| Minimum window | 900×600 |
| Minimum page width | 480px |

- **When space runs out:** the sidebar collapses first, then the chat panel closes. The page keeps its minimum width.
- **Collapsed sidebar:** it returns when the pointer reaches the frame gutter at the window's left edge. It slides in over the page and slides away when the pointer leaves, so it is an overlay view (see below).
- **Sidebar contents, top to bottom:** window controls with search and the collapse button, then the bookmark cluster, then New Tab, New chat, Routines and Flock, then chats, then tabs. Settings stays at the bottom, and the account joins it when real accounts arrive in stage 5 of the roadmap. Collapsed, the toolbar shows the button that brings the sidebar back.
- **Bookmark cluster:** pinned sites and bookmarks as 44px round buttons, in rows of four and three offset like a bunch of fruit. Sites with no icon show their first letter. Pinned sites come first, and a site saved both ways shows once, as a pin. With nothing saved, the cluster and the bookmarks bar keep their place and say "Pin or bookmark a page to keep it here." in muted text.
- **Address row:** left-aligned plain text on the card, with no pill until it is hovered or focused.
- **Bookmark star:** outlined when unsaved, filled light yellow using `bookmark` when the current page is saved, with no selected or hover background behind the saved star.
- **Pin button:** beside the star, and usable on the same pages. A pinned page fills the pin and uses the normal toggled background. The File menu has Pin This Page, and right-clicking a saved site offers Unpin and Remove Bookmark, whichever apply.
- **Spaces and folders:** not part of this design yet.

### View stack

From bottom to top:

1. **Chrome view:** one transparent, window-sized renderer that draws all our UI.
2. **Tab views:** one solid view per tab. Only the active tab is visible.
3. **Overlay views:** small transparent views for anything that floats over a page, such as address suggestions, menus, the revealed sidebar, and Berry while it acts on a page.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view.** The chrome view is underneath tab views and cannot draw over them.
- **Overlay views are only as large as what they show.** Whether a transparent area lets clicks reach the page is untested, so assume it blocks them. Rounded cut-outs on views also still capture clicks.
- **Internal pages** (new tab, main chat, Routines, Flock, Downloads, History, Settings) open as tabs drawn by the chrome renderer, with no tab view. Their content sits on the same `canvas` card as the toolbar, in the same position as the web page card, so the sidebar stays visibly separate from the page.

## 3. Glass

There is one glass strength, not a user setting.

| Level | Used for | How it is made |
|---|---|---|
| Solid | Web pages, always | An opaque view |
| Frame | Window frame, sidebar, chat panel | The `frame` gradient with a fine grain, painted opaque over the native window material |
| Card | The card internal pages sit on | `canvas` at 85% with `backdrop-filter` over the frame |
| Panel | Cards over the art blueberry, bookmark buttons | `surface` at 60–80% with `backdrop-filter` |
| Floating | Anything over a web page | Overlay view with `backdrop-filter` plus the glass tint |

The frame is opaque so its colour and text contrast don't depend on the desktop behind it. The glass tint is 88% of `background`, in both light and dark mode (*to tune*).

### What has been tested

Tested on macOS with Electron 37.5.0 and 45.1.0 using striped test windows:

- CSS `backdrop-filter` in an overlay view blurs the tab view beneath it, and the blur updates when the page changes.
- Native `vibrancy` shows through a transparent chrome view, but untinted text is hard to read and loud backgrounds show through.
- `setBorderRadius` rounds a tab view.

Not tested: Windows, the performance cost of blur, and animating tab view bounds.

### Fallbacks

Use the solid `background` colour instead of glass when:

- The system asks for reduced transparency (`nativeTheme.prefersReducedTransparency`).
- Windows is older than Windows 11 22H2, where `backgroundMaterial` is unsupported.
- Native glass looks wrong on a platform and has not been fixed.

In these cases the frame is solid `background` too, without the gradient or grain, and cards use solid `surface` or `canvas`.

Text must meet the contrast rules with and without glass.

## 4. Tokens

Components use tokens only, never raw colours. Keep the existing names in `index.css` and add the new ones.

### 70/20/10

For our own chrome (web pages do not count), this is a guideline and not a measurement:

- **70, base:** `background`, `canvas` and `surface`.
- **20, gray:** `muted` and `border`.
- **10, ink and Berry:** the accent and the character. Nothing else in the chrome has colour, except status colours when they mean something.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `frame` | `#c3cbf0` to `#e7e6f7` to `#d4cfec` | `#38383b` to `#262628` | Gradient for the frame, sidebar, chat panel |
| `background` | `#dcdff5` | `#2b2b2b` | Solid frame when glass is off, the glass tint |
| `canvas` | `#fcfcff` | `#1f1f1f` | Internal pages, the card a web page sits on |
| `surface` | `#ffffff` | `#242424` | Composer, inputs, raised content |
| `tray` | `#f2f3fb` | `#181818` | Page card on the composer, code blocks |
| `card` | `#f3f4fb` | `#2a2a2a` | Raised content on `canvas` |
| `selected` | `#ffffff` | `#565656` | Selected rows in the sidebar, selected segments |
| `muted` | `#eceefa` | `#303030` | Address bar, bubbles, hover, selected rows on `canvas` |
| `border` | `#e1e3f2` | `#404040` | Separators |
| `foreground` | `#191b33` | `#f2f2f2` | Main text |
| `muted-foreground` | `#4c5070` | `#b0b0b0` | Secondary text |
| `primary` | `#2a3380` | `#4e5fb4` | Primary button fill |
| `primary-foreground` | `#ffffff` | `#ffffff` | Primary button text |
| `accent-ink` | `#2f3aa8` | `#a3aefb` | Links, focus rings, selected states |
| `bookmark` | `#facc15` | `#fde047` | Saved page's filled bookmark star |
| `success` | `#17653c` | `#6fcf97` | Status |
| `warning` | `#744b00` | `#e0b050` | Status |
| `destructive` | `#ab241c` | `#f59e96` | Status, destructive actions |
| `glass-tint` | `background` at 88% | `background` at 88% | All glass |

Contrast is calculated against each mode's most difficult frame colour, and against a `surface` card at 80% over the art blueberry's darkest colour in light mode and lightest in dark mode. Re-measure on real windows.

| Text colour | Light on frame | Dark on frame | Light on berry card | Dark on berry card |
|---|---|---|---|---|
| `foreground` | 10.5:1 | 10.4:1 | 11.0:1 | 10.7:1 |
| `muted-foreground` | 4.9:1 | 5.4:1 | 5.1:1 | 5.5:1 |
| `accent-ink` | 5.7:1 | 5.6:1 | Not used | Not used |

White on `primary` is 11.2:1 in light mode and 5.8:1 in dark mode.

The dark frame stays neutral, because blue-tinted dark mode is rejected. Only the blueberry keeps its colour there.

Berry has separate tokens and never uses the UI accent:

| Token | Light | Dark |
|---|---|---|
| `berry-ink` (body) | `#181c2e` | `#3a4270` |
| `berry-wing` | `#2e3454` | `#525c8e` |
| `berry-nape` | `#9ea6be` | `#a8b0c8` |
| `berry-eye` | `#f4f1e6` | `#f4f1e6` |
| `berry-pupil` | `#141624` | `#141624` |
| `berry-beak` | `#3e4466` | `#5c648c` |
| `berry-fruit-mid` | `#4e5fb4` | Same |
| `berry-fruit-dark` (shade) | `#2a3380` | Same |
| `berry-fruit-bloom` | `#a4afe0` | Same |
| `berry-fruit-crown` | `#161c4c` | Same |

`berry-gear` and `berry-gear-shade` colour a mascot's accessory, with `berry-pupil` as its edge. Jackdaw's are `#d9a312` and `#a87c08` in light, `#ffd23f` and `#d9a312` in dark.

Dark `berry-ink` is lifted just enough to stay visible while still reading as a dark bird. It is below the 3:1 for meaningful graphics, so the eyes, hood and berry carry the shape, and nothing may rely on Berry alone: moods have text labels.

The flock's presets replace `berry-ink`, `wing`, `nape`, `beak`, `gear` and `gear-shade` on that mascot's drawing, through `data-mascot`. The eye and the blueberry never change. Body contrast is against `canvas`.

| Preset | Body light | Nape light | Gear light | Body contrast | Body dark | Nape dark | Gear dark | Body contrast |
|---|---|---|---|---|---|---|---|---|
| Robin | `#8f3b22` | `#f28a4c` | `#1f8f86` | 7.3:1 | `#b5553a` | `#f79a60` | `#3fc2b6` | 3.4:1 |
| Canary | `#b77f00` | `#ffc93c` | `#c8314f` | 3.4:1 | `#e0a810` | `#ffe07a` | `#f0607e` | 7.7:1 |
| Parakeet | `#1f8a4c` | `#9ad94f` | `#d9542b` | 4.3:1 | `#35b56c` | `#bcec70` | `#f47a52` | 6.3:1 |
| Flamingo | `#d13f7c` | `#ffb0cc` | `#1b8fa3` | 4.4:1 | `#ec6a9d` | `#ffc9dc` | `#4cc6d9` | 5.6:1 |
| Kingfisher | `#0f7ea3` | `#f58b3c` | `#e8a900` | 4.5:1 | `#2ba8cf` | `#fb9f58` | `#ffd23f` | 6.0:1 |

### Spacing, radius, elevation

- **Spacing:** 4, 8, 12, 16, 24, 32, 48px.
- **Radius:** 8px for controls, 12px for sidebar rows and inputs, 22px for cards, panels and the page card, including the web page view itself, 26px for the composer, and full for buttons and segmented controls.
- **Elevation:** the page card floats on the frame with a soft shadow all round, tinted periwinkle in light mode. Things that float, the composer, cards on the art blueberry and selected rows in the sidebar also get a shadow.
- **Reading ring:** while Berry is reading the open page, because a message was just sent with the page attached, the page card's shadow becomes a 2px periwinkle ring with a soft glow. It fades in and out with the layout duration, and also shows while Berry is using the tab in a running reply. Inside the page, a matching inset glow pulses slowly, added as a style so it never takes a click. In the tab list, that tab's title shimmers beside the working berry.

## 5. Typography

The system font only: SF Pro on macOS and Segoe UI Variable on Windows. No fonts are bundled or downloaded.

| Size | Weight | Used for |
|---|---|---|
| 11px | Regular | Captions, the smallest text allowed |
| 12px | Regular | Secondary text |
| 13px | Regular | Bookmarks bar, card text |
| 14px | Regular, semibold | Sidebar, tabs, address bar, settings |
| 16px | Regular | Chat and the composer |
| 20px | Semibold | Page titles |
| 34px | Semibold, tight tracking | Onboarding only |

- Use regular and semibold only.
- Use tabular figures wherever numbers line up, such as times and counts.
- Render chat markdown with our own type styles.

## 6. Motion

The chrome is crisp: quick to start, gently settling, with no bounce.

| Kind | Duration |
|---|---|
| Hover, press, small feedback | about 100ms |
| Panels and layout changes | about 240ms |
| Longest allowed in the chrome | about 320ms |

- **Easing:** start with `cubic-bezier(.32, .72, 0, 1)` (*to tune*).
- **Interruptible:** every transition can reverse from wherever it is.
- **Web pages:** never animate page content, only the frame around it.
- **Bounce and squash:** reserved for Berry.
- **Loops:** only while real work is happening, stopping as soon as it ends.
- **Thinking:** a soft shimmer sweeps across the word while a reply is on its way. Reduced motion leaves the word still.
- **Moving tab views:** if animating tab view bounds is not smooth, animate the chrome and let the page snap into place at the end.
- **Reduced motion:** follow `systemPreferences.getAnimationSettings().prefersReducedMotion` and the CSS media query. Movement becomes short fades or instant changes.

## 7. Component states

Every interactive component defines these, shown in light and dark in the component gallery:

| State | Treatment |
|---|---|
| Default | Neutral, with no colour unless it is the primary action |
| Hover | `muted` background |
| Pressed | Slightly darker than hover, in about 100ms |
| Focused | A visible 2px `accent-ink` ring, never removed. The composer is the exception: it only darkens its border, and the caret marks focus |
| Selected | A `selected` row in the sidebar, or a `muted` row on `canvas`. The text stays regular, so rows don't shift |
| Disabled | Reduced emphasis, with a reason where possible, and based on real state |
| Loading | Only while work is really happening |
| Error | Status colour plus an icon or text, with a way forward |

Tabs also show: page loading, audio playing, crashed, and Berry working in this tab.

## 8. Berry, the mascot

Berry is a small jackdaw in ink who nearly always has a blueberry in its beak. Berry is "it", and it refers to itself as "I".

### Character

- **Bird:** a big head on a plump, smooth body with short legs, drawn in profile with one clean outline. A dark body, a grey nape, a short beak and one pale eye with a big pupil and a catchlight make it a friendly jackdaw, and the eye carries most of the expression. Berry only faces you, with two eyes, when it is asking for a decision.
- **Blueberry:** its signature, and what ties Berry to the name. It stays in Berry's beak, even in the smallest icon, and leaves only when Berry is thinking, finishes a job, makes a mistake or sleeps. It has a dusty bloom lit from the upper left, a slightly squashed shape, and a dark crown with uneven lobes set off-centre. It is never a blue circle with a star.
- **Style:** flat ink for the bird. The berry is the one thing in the chrome with depth and colour, and on its own it serves as the status marker for work in progress, always beside words.
- **Implementation:** one SVG drawing per mood behind a `<Mascot mood size>` interface, animated with CSS, so artwork can be replaced without touching screens. Each mood should be recognisable from its outline. Rive is the next step for the large animated moments.

### The flock's look

Every mascot is this same drawing with one preset and one accessory: nothing, a crown, a cap, glasses, headphones or a bow. The accessory belongs to the head, so it moves with it in every mood, and has a front view for Asking. Shapes are big and edged, so colour and accessory tell mascots apart at 16px, where the mood can't. There is no colour picker, because every preset has to work in both modes and beside the blueberry. Everything said here about Berry's character, voice and moods goes for them too.

### Sizes

| Size | Drawing |
|---|---|
| 16–20px | Simplified: just the head and the berry, with one larger eye. This shows identity only. |
| 24–31px | The same simplified drawing. 24px is the smallest size that may show a mood, through head tilt and eye alone. |
| 32px and up | Full drawing. |

The blueberry's crown turns into a smudge below about 20px, so at those sizes its colour and shape carry it.

### Personality and voice

Warm first, with light humour and a bit of dry wit. Berry is capable, observant and kind.

- Keep messages short, with at most one light touch per message. Most have none.
- Say what was done and what could not be done. Never claim a success that cannot be backed up.
- Use plain language with no jokes for permissions, payments, sent messages, data and real failures.

| Moment | Berry says |
|---|---|
| Meeting you | "Hi, I'm Berry. Tell me what you're working on and I'll go and fetch what you need. I'll always check with you before anything important." |
| Task done | "Found three flights under €200. The cheapest leaves at 05:40, so that one's for the brave." |
| Mistake | "Oops, wrong page. Let me try again from the search results." |
| Empty state | "Nothing here yet. I looked under everything." |
| Asking | "This will send the email to Anna. Send it?" |

### Moods

Every mood has a text label for assistive technology.

| Mood | Meaning | Pose |
|---|---|---|
| At rest | Present, nothing happening | Perched, berry in beak, blinks now and then |
| Sitting | On a tab or the edge of a card | Legs hanging over the edge and swinging, berry in beak |
| Curious | Looking at something you asked about | Leans in, head cocked |
| Thinking | Working something out | Head back, eyes up, tossing the berry |
| Fetching | Working out on the web | In flight, wings beating, berry in beak |
| Asking | Needs your decision | Faces you square on, berry held out |
| Delivered | Finished | Sets the berry down, chest out, heavy-lidded and a bit smug |
| Oops | Something went wrong | Slumped, berry rolled away, a feather falls |
| Off duty | Nothing to do for a long time | Fluffed up asleep, berry beside it |

### Where Berry appears

| Place | What it does |
|---|---|
| Onboarding | Large, guides setup |
| New tab | Large, sitting on the composer's top edge with its legs over it |
| Empty main chat | Large, standing above the composer |
| Browsing | Small, sitting on the active tab with its legs hanging |
| Chat | Working and waiting states beside its replies |
| Routines | Flies off when a routine runs and returns with the result |
| Settings | Its own section |
| Flock | Its own page, sitting on each card |
| Over a web page | Only while acting on that page, in an overlay view |

### Where Berry goes

Berry belongs to real parts of the interface, so it only ever sits in the places listed above. It never wanders on its own. It flies when the active tab changes and that takes it somewhere new, and at most once every 15 seconds: quicker tab changes move it with a quick fade. Web pages sit above the chrome, so a flight towards a web page passes behind it.

### When Berry may interrupt

Berry only speaks about work the user started: a finished task, a routine result, or a needed approval. It does not offer unprompted suggestions, and it does not read a page unless asked. Sending a chat message while the "Can see" toggle is on counts as asking.

| Level | Behaviour |
|---|---|
| Mood change | Nothing else moves or appears |
| Dot on the perch | Something is ready, with one small hop at most |
| Card in the panel | Only when Berry needs a decision to continue |

Berry never opens a modal, takes keyboard focus or makes a sound. It never interrupts during typing, fullscreen, video or calls. Anything waiting holds until the user is done.

### Reduced motion

Poses switch with a quick fade, with no flying or hopping. Nothing relies on seeing the animation.

### Turning it off

Available from Settings and by right-clicking the perch:

- **Still:** keeps the bird, stops all animation and flight. It moves between places with a quick fade.
- **Hide Berry:** removes the character everywhere, replacing it with a plain icon and neutral copy.

Every feature keeps working either way, and turning it off never prompts the user to reconsider.

## 9. Key screens

### Onboarding

Four short, skippable steps: meet Berry, choose layout and appearance, import from another browser, and what Berry can and can't see. No account is requested.

### New tab

Berry, large, sits on the top edge of a 752px composer with its legs over it. Below rises the art blueberry, the page's one big moment: thousands of tiny berries spiral out of a sunken crown like seeds in a sunflower head, swelling in the light and shrinking in shadow, under heavy grain, with dust drifting off the edge so it has no hard outline. It is 1240px across at any window size, painted once and never moves. Up to three frosted cards sit on it showing real chats and routines, or two idea cards linking to real features if there are none, then recent pages in a frosted panel if there are any. When the sidebar is closed, links to Routines, a new chat and Settings sit under the composer. Faint, irregular trails of alternating bird footprints sit in the background behind the art blueberry, with varied lengths, directions and faded sections instead of a repeating tile, and two small birds walk around behind the page leaving new prints that slowly fade. They pause to peck now and then. Each print is the size of the bird's foot and lands under it, and a stride is what its legs really cover. Still, Hide Berry and reduced motion remove the birds and keep the old trails. Nothing appears in the recent list unless it is real. The chat panel doesn't open here, because this page has its own composer. It returns on the next page if it was open.

`Enter` opens anything that looks like an address and asks Berry about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. Searching is the address bar's job.

### Browsing

The page gets the space. The address bar shows the real URL and real navigation state. Berry stays small and only shows a mood when something is happening.

### Find in page

`⌘F` (`Ctrl+F` on Windows) opens a bar in the top right corner of the page, in an overlay view of its own, using the Floating glass level. It has a field, a count such as "2 of 14" or "No results", previous and next, and close. `Enter` and `Shift+Enter` step through matches, and `Esc` closes it and puts the keyboard back on the page. The bar belongs to one page: going to another tab closes it, and opening it again keeps the last search, selected so typing replaces it. Internal pages can be searched too, and because the chrome view draws them, matches in the sidebar count as well.

### Zoom and printing

`⌘+`, `⌘-` and `⌘0` zoom the web page, per site and across restarts. Other open tabs on the site follow. Away from 100%, the toolbar shows the level beside the bookmark star, and pressing it goes back to 100%. Internal pages don't zoom, and `⌘P` prints web pages only, so those menu items are disabled there.

### Page menu

Right-clicking a web page opens a native menu with what was clicked in mind: spelling suggestions, link, image, editing, or back, forward and reload on a plain page, always ending in Inspect. With text selected, Ask Berry About This opens the chat panel with that text added to the composer. It is never sent by itself.

### Main chat

A full page for talking to Berry about anything, not about a particular web page. It opens as a tab, and past chats are listed in the sidebar.

- A centred conversation and composer of 752px, with the composer fixed at the bottom. A new chat with no messages looks like the new tab page instead.
- Messages and the composer are the same components as the chat panel, so the two sizes look like one chat.
- A chat is named automatically once it has a topic, and until then shows its first message. A name the user chose is never replaced.
- In the sidebar, hovering or focusing a chat swaps its age for a button with Rename and Delete, also on right-click. Rename edits in place, and Delete asks first because it can't be undone.
- Berry's working state says what it is doing and offers to show the work in a tab. Steps, once the agent reports them, form a trail: a footprint for each finished step and the berry on the current one.

### Chat panel

- Opens on the right with `⌘E` (`Ctrl+E` on Windows) and pushes the page.
- A card on the composer, with the page's icon, title and address, shows the page Berry can see. Removing it takes the page away from Berry, and the composer's + brings it back. No card means Berry sees no page. While the card is there, Berry may also read your other open tabs when the question needs it, and every look shows as a step. With no card, Berry can only open and use tabs of its own, each after asking, and they open behind the chat. Tabs Berry opens from the panel open behind the page too. Going to one to watch changes nothing, and Berry carries on. Clicking or typing in it, or sending it somewhere from the address bar or Back and Forward, takes it over: Berry can't reach it any more, stops, and says so.
- Approval requests are cards showing exactly what will happen. By default one appears only for what could delete, send, buy or change text, such as a Delete button or typing in a form, and for an address carrying data in its query. A query and hash of up to 100 characters don't ask on YouTube, Google, Bing, DuckDuckGo, Wikipedia, GitHub, Reddit or Amazon, or on the exact site of a page the job already has open. Going to a plain link or typing a search doesn't ask. Settings can make Berry ask always or never. Cancel tells Berry no.
- When Berry can't go on without something only the user knows, it asks on the same card with a text box, Answer and Skip. It carries on with the answer, and a question waits like an approval, in any Ask before acting setting. Passwords, codes and card details are never asked for here.
- Using Berry requires an account, requested the first time someone uses it. Browsing, tabs and bookmarks never need one.

### Routines

A list with schedule, last result and status, plus a page for each routine with its instructions and run history. **New routine** and **Edit** open a form in the page, never a modal: a name, instructions in plain words, and when, as once, daily, weekly on chosen days or monthly, at a time. A day the month doesn't have means its last day. What's typed survives going to another tab. A finished main chat offers **Save as routine**, which fills in the form with what the user asked for, to change before saving.

- **A run** works like a chat with no page: the same tools, the same Ask before acting setting and the same step limit. It opens its own tabs behind the current view and closes them when it ends, except any the user has been to, which are theirs. It can't reach any other tab, including popups its pages open, which also stay behind and close with it. Its tabs are muted.
- **Run history** shows each run as a card: when it started, its status in words, a footprint for each step, Berry's report and the tokens used. A run that's going has **Stop**. One that failed, was stopped or was interrupted has **Run again**. Each routine keeps its last 50 runs.
- **Status** is one of Running now, Needs your OK, Finished, Failed, Stopped, Interrupted, Waiting to start, Paused or Scheduled.
- **Approvals** use the same card and exact words as a chat. The card waits on the Routines page and, anywhere else, in the sidebar under Routines. With no sidebar, the toolbar says so. Nothing is ever allowed for later: closing the app stops the run with nothing done, and the next launch shows it as Interrupted, saying what it was waiting to do.
- **Timing:** a routine runs only while a window is open. A time missed with the app closed or the computer asleep runs once on the next chance, however many were missed, and says it was late. Times missed while paused are not made up. A time that comes while the same routine is still going is skipped. A run starts only while fewer than two are working, and the rest wait to start. A run waiting for an OK doesn't count, and once allowed it goes straight on, even if two others have started meanwhile.
- **Speaking up:** a result or a needed approval puts a dot on the Routines row until Routines is opened. If the app isn't in front, and the window isn't fullscreen and no tab is playing sound, a silent macOS notification says so, with no page text or approval wording in it. A run the user stopped says nothing.

### Flock

Opens as a tab from the sidebar, the Go menu, or the new tab page when there's no sidebar, with only one open at a time.

- **The flock:** a heading and a grid of `surface` cards, each with its bird sitting on the top edge, legs over it, as Berry sits on the new tab composer. Coming near makes it curious, and one that's working flies, with the berry beside its name. A card has the name, what it's for, its limits as small tags and the routines it runs, with **Chat** and **Edit**. Berry comes first, can't be edited or deleted, and has no limit tags. The last tile, dashed with a blueberry, is **New mascot**.
- **Making one:** a form in the page, never a modal, numbered 1 to 4, with the preview beside it, or above it in a narrow window. Look, name and what it's for take under a minute, and the limits are optional. **Surprise me** picks a look and a name. Looks are chosen by pressing the bird wearing them. What's typed survives going to another tab.
- **The preview:** the moment this page is for. The mascot, at 160px, hops when its look changes, gets curious while you name it, thinks while you say what it's for, and faces you while you set limits. Its nine moods sit below it, and pressing one shows it. Saving flies it off, and it lands on its new card with a hop. This is the one place a bird moves with no work behind it, and Still and reduced motion stop it as they do everywhere.
- **Limits only take away.** Any site, or only named sites with their subdomains. Reading is always on, with switches for going to pages, clicking and typing. The page says plainly that no limit changes when it asks: approvals work the same for every mascot, and a mascot has no setting that could skip one.
- **Refusals:** something off its sites never reaches a card, because there's nothing to decide. It shows in the steps as "Stayed off example.com". With an off-limits page open, the composer says the mascot can't see it in place of the page card, and the reading ring doesn't show. Refused pages aren't read or sent, including the page that would go with a message, embedded frames from other sites, and a page that sends the tab somewhere else while the mascot acts. A click can't open what it couldn't go to.
- **Choosing one:** the shared composer has a chip with the bird and its name. Pressing it opens the flock in a row inside the composer, in the flow rather than floating, so it works beside a web page. The bird on the new tab composer and the active tab becomes the chosen one. Once a chat has begun it keeps its mascot, and the chip just says who.
- **Who's working:** a reply names any mascot but Berry above it. A chat in the sidebar shows its bird, and a running chat shows the working berry where its age goes. A tab anyone is working in shows that bird as the tab's icon, Berry's too, or the working berry when Berry is hidden, with a shimmering title. When there's no sidebar to show it and the work is in another tab, the toolbar says who's working, and pressing that goes to the tab. Berry's old chats stay plain.
- **Routines:** **Who runs it** in the form uses the same row of birds, and a run keeps to that mascot's instructions and limits.
- **Deleting:** asks first, in a native dialog. The mascot leaves the flock, and its chats keep its look and limits. Routines it runs pause and stay limited, because moving them to Berry could let them do more than they were set up to. Anything pointing at a mascot that's no longer on file can only talk.

### History

Opens as a tab with `⌘Y` (`Ctrl+Y` on Windows) and from the Go menu, with only one open at a time. The same column as Routines: the heading with Clear history beside it, a search field that takes focus, then a `surface` card of 36px rows for each day, headed Today, Yesterday or the date. A row shows the time in tabular figures, the favicon, the title and the site, and hovering or focusing it shows a delete button. Clicking a row opens the page in a new tab. Show more loads the next hundred, and search covers titles and addresses.

Clear history asks first, in a native dialog, because it can't be undone. Deleting history also takes those pages out of tabs' back and forward lists, Reopen Closed Tab and the saved session, and an open tab keeps the page it's showing. Reloading a page isn't a new visit, and neither is coming back to one after a restart. Pages Berry opens behind the chat stay out of history, and out of Recent on the new tab page, until you go to that tab.

### Restoring tabs

Reopening brings back the open tabs, their order, the active tab, each tab's back and forward pages, the sidebar and chat panel, and the window's size. Only the active tab loads. The others show their saved title and favicon and load when first visited. Berry using one loads it too, behind the page you're on. Scroll position and form contents don't come back, because the state that holds them can hold posted passwords. Closing the last tab leaves nothing to restore, and tabs a chat or routine opened behind you don't come back unless you went to them. Settings can start fresh instead, which also stops saving the tabs.

### A page in trouble

When a page crashes or stops responding, its view hides and the chrome draws Berry in its Oops mood, what happened in plain words and a Reload button, centred on the page card. Its tab shows a warning icon, and the rest of the window keeps working. A page that recovers from being stuck comes back by itself. Going anywhere else from that tab clears it too. Reload, the toolbar button and `⌘R` do the same thing, and a stuck page gets a new process. Berry's tools on that tab get an error saying so, within 10 seconds at most for a page stuck with no sign of it.

### Damaged saved data

A chats or history database that can't be read doesn't stop the app. The file is moved aside beside its old name, never deleted, and the app starts empty and says so once in a native dialog, with where the old file is.

### Settings

Plain sections, including layout, appearance, Berry (Still, Hide and when to ask before acting), Downloads (the folder, and whether to ask where to save), Site permissions (every saved answer, to change or forget), and data and privacy, which must be easy to find. Data and privacy holds what stays on this computer, a way to history, and whether Blueberry restores tabs or starts fresh. Appearance follows the system by default, with a manual light or dark override.

### Downloads

A list on one card, newest first. Each row has the file's name, its status in words, and the site it came from. While running it adds a thin `accent-ink` progress bar, Pause or Resume, and Cancel. Finished rows offer Open and show in folder, and any finished row can be removed from the list, which leaves the file alone. A file that's gone says "File is missing" in `warning` and offers neither. Files save straight to the folder with no dialog unless Settings says to ask, and never overwrite: a second `report.pdf` becomes `report (1).pdf`.

The toolbar has one Downloads button, which opens this page. While anything is running, a ring around the icon shows the combined progress, and the button's label names each file with its percentage. There's no popover, so nothing floats over the page.

### Site permissions

When a site asks for the camera, microphone, location, notifications, MIDI, the screen or similar, a card appears in the page's top left corner, in an overlay view as tall as the card. It names the exact site and what it wants, with Block and Allow. No request is granted before the user answers.

- **Solid, not glass:** it uses `surface` instead of the floating glass, so a page can't change how it reads.
- **No Berry:** this is the user's decision. Berry doesn't appear on it and can't answer it, even in a tab it's using.
- **Its buttons wake after 500ms,** so a page can't open it under a click already on its way.
- **No button has focus,** so typing meant for the page can't answer it.
- **One tab at a time:** a card only shows while its tab does, and a request in another tab waits there. Leaving the page or closing the tab refuses it, and that isn't remembered.
- **Remembered per site:** by exact origin, both Allow and Block. The screen and opening other apps are the exception: Allow lasts for one request, and only Block is remembered.
- **Embedded frames from another site never ask,** because the user can't see who they are. Device pickers for USB, HID and serial don't exist yet, so those are refused.

## 10. Accessibility

- **Standard:** WCAG 2.2 AA for all our UI, with contrast checked on real glass.
- **Keyboard:** everything works without a mouse. Tab views are separate native views, so focus does not move between chrome and page by itself. Provide shortcuts to jump between sidebar, address bar, page and chat, such as `F6`. Tabs reorder by dragging, or with `Alt` and an arrow key along the list.
- **Screen readers:** everything is labelled, and Berry's status changes are announced politely. Decorative movement is hidden.
- **System settings:** follow reduced motion, reduced transparency, increased contrast and light or dark.
- **Colour:** never the only signal.
- **Targets:** at least 24px.
- **Berry:** no feature depends on Berry being visible.

## 11. macOS and Windows

macOS is the primary platform for design and polish. Windows must keep working: CI builds and tests on it from the start, and it gets a visual pass on a real Windows PC before release. Linux is not part of this design.

| | macOS | Windows |
|---|---|---|
| Glass | `vibrancy` plus tint | `backgroundMaterial` plus tint on Windows 11 22H2 and later, otherwise solid |
| Window controls | Traffic lights, top left | System buttons, top right, with that space kept clear |
| Font | SF Pro | Segoe UI Variable |
| Shortcuts | `⌘` | `Ctrl` |
| Menus | System menu bar | In-window menu button |
| Corners | System rounded | Rounded on Windows 11, square on older versions |
| Reduced transparency | Reduce Transparency | Transparency effects off |

The Windows column comes from documentation and has not been tested. If Windows glass disappoints, use the solid fallback rather than a weaker imitation.

## 12. Rules for agents

### Do

- Use tokens for every colour, size and duration.
- Build one component that adapts to both layouts.
- Get sizes from the layout owner.
- Put anything that floats over a page in an overlay view sized to its content.
- Keep AI calls and agent actions in the main process, behind the typed IPC contract.
- Show real state: navigation, loading and what Berry can see.
- Add every new component to the gallery, in every state, in light and dark.
- Test with reduced motion, reduced transparency and keyboard only.
- Check contrast on glass with light and dark backgrounds behind it.
- Run UI changes and look at them, including both layouts.

### Don't

- Don't put glass on web pages or inject styles into them for chrome effects.
- Don't use raw hex values or hard-coded sizes in components.
- Don't add a colour, weight, font or shadow that isn't in this document.
- Don't add bounce to the chrome or loops without real work behind them. The exceptions are Berry's world on the new tab page, the legs of a sitting bird, and the preview on the Flock page.
- Don't let Berry joke about permissions, payments, messages, data or failures.
- Don't let Berry open modals, take focus, make sounds or speak about work the user didn't start.
- Don't read page content unless the user asked.
- Don't send browsing data to third-party services for UI features such as favicons.
- Don't make any feature depend on Berry being visible.
- Don't add a settings slider for glass strength.
