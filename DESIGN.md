# Blueberry design

Blueberry is an AI browser that should feel like a good Mac app with one capable colleague inside it. The direction is **Bloom**: the window is made of the fruit. The frame is the dusty, matte skin of a blueberry, solid web pages float on it in one rounded card, and the blueberry itself is the one thing in the chrome with real colour. Blueberry uses no Strawberry or Aside assets.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

## 1. Principles

1. **The page comes first.** Web pages stay solid and get the space. The chrome stays quiet around them.
2. **One colleague at a time.** Berry comes first and is enough on its own. You can grow a flock of birds for jobs you repeat, but you always talk to one, and it's always clear which. Small birds saying something on the art blueberry don't break this, even several Berrys beside the big one on the composer: they aren't more colleagues, only one way to draw each idea being said.
3. **Calm by default.** Nothing moves, glows or asks for attention without a reason.
4. **Trust you can see.** The UI always shows what Berry can see and what it is doing, and it asks before anything that matters.
5. **A normal browser first.** Tabs, navigation and bookmarks must be excellent with no account and no AI.
6. **Crafted and warm.** Warmth comes from Berry's voice, its character and the motion. It never becomes corporate or childish.

### What we reject

- Humanoid companions, or a team you have to manage. The flock is birds you made yourself, and none appears until you ask.
- Promo cards and upsells on the new tab. The ideas there only link to real features, and suggestions only come from what the user really did.
- Stacks of identical rounded, shadowed cards with an avatar, a title, pill chips and pill buttons. Where a page lists birds, they stand on something real: a wire, a divider or the fruit.
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
- **Sidebar contents, top to bottom:** window controls with search and the collapse button, then the bookmark cluster, then New Tab, Needs you, Routines and Flock, then chats, then tabs. Settings stays at the bottom, and the account lives in it. Collapsed, the toolbar shows the button that brings the sidebar back.
- **Bookmark cluster:** pinned sites and bookmarks as 44px round buttons, in rows of four and three offset like a bunch of fruit. Sites with no icon show their first letter. Pinned sites come first, and a site saved both ways shows once, as a pin. With nothing saved, the cluster and the bookmarks bar keep their place and say "Pin or bookmark a page to keep it here." in muted text.
- **Address row:** left-aligned plain text on the card, with no pill until it is hovered or focused.
- **Bookmark star:** outlined when unsaved, filled light yellow using `bookmark` when the current page is saved, with no selected or hover background behind the saved star.
- **Pin button:** beside the star, and usable on the same pages. A pinned page fills the pin and uses the normal toggled background. The File menu has Pin This Page, and right-clicking a saved site offers Unpin and Remove Bookmark, whichever apply.
- **Spaces and folders:** not part of this design yet.

### View stack

From bottom to top:

1. **Chrome view:** one transparent, window-sized renderer that draws all our UI.
2. **Tab views:** one solid view per tab. Only the active tab is visible.
3. **Overlay views:** small transparent views for anything that floats over a page, such as address suggestions, menus and the revealed sidebar. The bird working on a page isn't one, because a view takes clicks: see Over a web page.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view.** The chrome view is underneath tab views and cannot draw over them. The one exception is the bird on the page.
- **Overlay views are only as large as what they show.** Whether a transparent area lets clicks reach the page is untested, so assume it blocks them. Rounded cut-outs on views also still capture clicks.
- **Internal pages** (new tab, main chat, Needs you, Routines, Flock, Gallery, Downloads, History, Settings) open as tabs drawn by the chrome renderer, with no tab view. Their content sits on the same `canvas` card as the toolbar, in the same position as the web page card, so the sidebar stays visibly separate from the page.

## 3. Glass

There is one glass strength, not a user setting.

| Level | Used for | How it is made |
|---|---|---|
| Solid | Web pages, always | An opaque view |
| Frame | Window frame, sidebar, chat panel | The `frame` gradient with a fine grain, painted opaque over the native window material |
| Card | The card internal pages sit on | `canvas` at 85% with `backdrop-filter` over the frame |
| Panel | The Recent panel over the art blueberry, bookmark buttons | `surface` at 60–90% with `backdrop-filter` |
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

Contrast is calculated against each mode's most difficult frame colour, and against a `surface` card at 80% over the art blueberry's darkest colour in light mode and lightest in dark mode. Re-measure on real windows. What the birds on the fruit say is `primary-foreground` directly on it, over a pool of `berry-fruit-crown` shadow. Measured on real windows, white reaches at least 6.4:1 on the brightest pixel behind the words in light mode and 9.2:1 in dark.

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
- **Elevation:** the page card floats on the frame with a soft shadow all round, tinted periwinkle in light mode. Things that float, the composer, the Recent panel and selected rows in the sidebar also get a shadow. A bird standing on the composer leaves a small soft `berry-pupil` shadow under its feet, only on the box.
- **Reading ring:** while Berry is reading the open page, because a message was just sent with the page attached, the page card's shadow becomes a 2px periwinkle ring with a soft glow. It fades in and out with the layout duration, and also shows while Berry is using the tab in a running reply. Nothing else marks it from inside the page, because the bird does that now. With Show the bird on pages off, a matching inset glow pulses slowly inside the page instead, added as a style so it never takes a click. In the tab list, that tab's title shimmers beside the working berry.

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
- **Web pages:** never animate page content, only the frame around it and the bird working on the page.
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
| New tab | Large, standing on the composer's top edge with its toes gripping it. Smaller, standing on the art blueberry to say a suggestion |
| Browsing | Small, sitting on the active tab's lower edge with its legs hanging, in a slot the tab keeps free between its title and its close button, so it covers no text. On a narrow row of tabs, the active one stays wide enough for the slot |
| Chat | Working and waiting states beside its replies |
| Routines | Flies off when a routine runs and returns with the result |
| Settings | Its own section |
| Flock | Its own page, standing on a wire with the flock |
| Gallery | Standing on the line under each row, Asking on the review screen, Delivered once added |
| Needs you | Asking at 24px on each row, and off duty when nothing's waiting |
| Over a web page | Only while working in the page the user is looking at, drawn in the page. See Over a web page |

### Where Berry goes

Berry belongs to real parts of the interface, so it only ever sits in the places listed above. It never wanders on its own. It flies when the active tab changes and that takes it somewhere new, and at most once every 15 seconds: quicker tab changes move it with a quick fade. Web pages sit above the chrome, so a flight towards a web page passes behind it.

### When Berry may interrupt

Berry only speaks about work the user started: a finished task, a routine result, or something it can't go on without. Everything waiting is on one page, Needs you, so the flock can work on while the user carries on with their day. Suggestions are the one exception to staying quiet, and they never interrupt: they only appear on the new tab page, said by a bird standing on the art blueberry, where the user is already choosing what to do next. A bird looks up and hops once when the pointer or keyboard comes to its words, and otherwise nothing about them moves, asks or waits. Berry does not read a page unless asked. Sending a chat message while the "Can see" toggle is on counts as asking.

| Level | Behaviour |
|---|---|
| Mood change | Nothing else moves or appears |
| Dot on the perch | Something is ready, with one small hop at most |
| Count on Needs you | Anything waiting, with the berry beside the number on the sidebar row, or words in the toolbar with no sidebar. Answering is what clears it, not looking |
| Asking in the chat | Only when Berry needs a decision to continue, and the same item is on Needs you |
| Silent system notification | Something new is waiting, or a routine has news, and the app isn't in front |
| Message on the user's phone | Something is waiting and they're away, only if they connected a bot. See Needs you |

Berry never opens a modal, takes keyboard focus or makes a sound. A notification never comes during fullscreen or while a tab plays sound, and it says who and what kind of thing it is, never the question, the site or anything typed. A phone message does say those, because it's how the user answers, and Settings says Telegram can read it. Anything waiting holds until the user is done.

### Reduced motion

Poses switch with a quick fade, with no flying or hopping. Nothing relies on seeing the animation.

### Turning it off

Available from Settings and by right-clicking the perch:

- **Still:** keeps the bird, stops all animation and flight. It moves between places with a quick fade.
- **Hide Berry:** removes the character everywhere, replacing it with a plain icon and neutral copy.

Every feature keeps working either way, and turning it off never prompts the user to reconsider.

## 9. Key screens

### Onboarding

Short, skippable steps: meet Berry, choose layout and appearance, bring in history, and what Berry can and can't see. No account is requested.

**Bringing in history** is the third of four, with no card: Berry, a question, the browsers found to choose from if there's more than one, and plain lines saying what happens. Only addresses, page titles and visit times from the last 90 days come across, from every profile of that browser, and never passwords or cookies. It stays on this computer, apart from what it takes to word a suggestion, and the lines say exactly what that is. **Bring it in** or **Skip**. It then says how many visits came across, or that it couldn't read them, and a failure can be tried again or skipped. If no browser is found the step isn't there and isn't counted, which is what a Safari user gets, because reading Safari needs Full Disk Access. Finishing lands on the new tab, where the birds speak about what came across.

### New tab

Berry, large, stands on the top edge of a 752px composer, right of centre, so it covers no text or control. It's drawn inside the composer's wrapper, so the two scroll as one. It only flies as a separate layer on its way there. Below rises the art blueberry, the page's one big moment: thousands of tiny berries spiral out of a sunken crown like seeds in a sunflower head, swelling in the light and shrinking in shadow, under heavy grain, with dust drifting off the edge so it has no hard outline. It is 1240px across at any window size, painted once and never moves. Birds stand on it to say suggestions if there are any. Otherwise the same birds offer up to three real chats and routines, each by the bird that runs it, or Berry offers two ideas linking to real features if there are none of those either. Recent pages follow in a frosted panel if there are any. When the sidebar is closed, links to Needs you, Routines, Flock and Settings sit under the composer, on a frosted strip the birds pass behind. Faint, irregular trails of alternating bird footprints sit in the background behind the art blueberry, with varied lengths, directions and faded sections instead of a repeating tile, and two small birds walk around behind the page leaving new prints that slowly fade. They pause to peck now and then. Each print is the size of the bird's foot and lands under it, and a stride is what its legs really cover. Still, Hide Berry and reduced motion remove the birds and keep the old trails, and so do suggestions, so that the birds saying something you've repeated have the page to themselves. Nothing appears in the recent list unless it is real. The chat panel doesn't open here, because this page has its own composer. It returns on the next page if it was open.

`Enter` opens anything that looks like an address and asks Berry about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. Searching is the address bar's job.

**Suggestions** are what Blueberry noticed you repeat, offered as work it can take over. The bar is three times: a site on three different days, at about the same time or weekday, two sites used together on three days, or three similar chat requests. Each says plainly why it's there, and those words and numbers come from code, not from the model.

**How they look:** not cards. Each is a bird at 76px standing on the fruit's real outline, in up to three columns of 224px, or stacked below it in a narrow space. The words are directly on the fruit, below its outline at every point of their column, so outer columns sit lower and the group follows the curve. The reason comes first in `primary-foreground`, then one semibold sentence the bird says. Under them is one action in words with an arrow, and Not now, shown on hover or focus. Berry says Prompt and Routine ideas. A Mascot idea is said by that new bird in its own colours, facing you in Asking, as if it has turned up to meet you. The last of several faces inwards. Hide Berry removes the birds and keeps everything else in place.

- **Prompt:** "Put it in the box" puts a ready prompt in the composer with the cursor at the end. Enter sends it.
- **Routine:** "Set it up" opens the routine form filled in with a name, instructions and a schedule that finishes 15 minutes before the user usually looks.
- **Mascot:** "Meet" and its name opens the new-mascot form filled in with a look, name, instructions and limits. It starts limited to the sites in the pattern, with only Go to pages switched on.

A suggestion only ever fills something in for the user to confirm, so nothing runs, is saved or is sent until they act. What's dismissed with Not now doesn't come back, along with anything else about the same sites or chats. Saving the form or sending the prompt also ends it. The order is always prompt, routine, mascot.

The page shows saved suggestions at once or what it would show without them, and never waits. New words are written at most about once an hour and only when history has grown, by one call to the cheap model, which gets only site names, page titles, chat titles, and how often and when. Bringing in history that adds visits lets one call through at once, and the limit holds again after it. Local addresses, addresses with tokens, and sites recognised as banks, mail or search engines are never counted, though that recognition can miss one, and a title from an address with a query isn't sent. A suggestion that names a site outside its pattern is dropped. Settings has an off switch, under Data and privacy, which also says what is sent.

### Browsing

The page gets the space. The address bar shows the real URL and real navigation state. Berry stays small and only shows a mood when something is happening.

### Over a web page

The moment an AI browser is most impressive is when it acts on a page, and a floating cursor could be anyone's. So the working mascot itself does the work, in its own colours and accessory, at 56px, drawn in the page from the same artwork as everywhere else.

| What the job does | What the bird does |
|---|---|
| Click, double-click | Flies there, lands on the target's top edge beside the point, so it hides none of the label, and pecks it, with a ripple where the click lands. The real click waits for it |
| Type | Flies to the field and sits on its top edge at the far end, its head bobbing while the letters appear. One letter about every 34ms, so a name takes about half a second. Longer text comes in bigger pieces, so nothing takes more than 1.3s. In a password or code field, it's all at once and nothing is drawn |
| Read, find | Hops down what's in view, stopping beside each thing to look at it, Curious. It never scrolls the page |
| Look over, screenshot | A hop on the spot, Curious. It's out of sight for the capture itself |
| Scroll | Hangs in the air, wings going, while the page slides under it. Smooth only while someone is watching |
| Point at | Flies there and looks at it, without pecking |
| Drag | Takes hold, and carries on across to where it goes, in time with the real drag |
| Choose an option, press a key | Lands and pecks, or a hop on the spot |
| Go somewhere | Takes off, and comes back where it was once the new page is there |
| Between steps | Thinking, with the berry going up and down |
| A job waits for an answer | Asking, facing you, with "Waiting for you". On an approval about one element it stands on that element, so asking to click Place order puts it on Place order. It flies there as the card appears and the card doesn't wait for it. If that element is gone or out of view, it asks from where it is |
| A frame from another site | Its script can say anything about itself, so nothing's asked of it. The bird stands near the top of that frame in the page around it |

**The line** is one small pill near the bird, placed where it covers the least, staying off the target and off the text beside it where it can, always on screen, saying what's happening in the present tense: "Clicking Add to cart", "Typing in Email". The name is the label beside it on the page, which the chat steps leave out because they go back to the model. These words go nowhere. It never shows what's being typed, which key, the contents of a text box, or a secret field's label.

**Stop isn't on the page.** Anything a page can see it can fake, and a fake Stop or a real one a page could press is exactly what mustn't exist. The line is only words, and **Stop Berry** is in the toolbar just above it, for as long as anyone is working in this tab. It's the same as Stop in the chat or on a routine. Pressed while the bird is flying, the click it was flying to never happens.

**How long:** a click costs its flight, 200ms plus 0.35ms a pixel up to 520ms, and 70ms for the beak to come down. Nothing is added in a tab behind the user's, or with the bird turned off.

**When it isn't there:**

- **Tabs not in front:** nothing is drawn and nothing waits. Going to one mid-job, it appears from then on.
- **The user touches the page:** it goes at once, and stays away for 5 seconds after their last click or key, even in a page a job can carry on reading. Typing stops there too, and what's in the field stays as it is, part typed and with anything of theirs, unsubmitted. A job with the page open hears why and carries on, and doesn't type in that field again in this reply.
- **A tab handed to the user:** none, and none while the keyboard is in a password or code field, whoever is typing, or in a frame from another site, which could be one.
- **The job ends or moves on:** it flies up off the page and fades, and nothing of it is left behind.

**Settings:** Keep Berry still and Reduce Motion give a small marker, the bird's head at 28px, that fades between spots with no flying, and text arrives at once. Show Berry off gives a plain pointer on the exact spot, with the same words. **Show the bird on pages** in Settings, under Berry, removes all of it for a site that reacts badly, and the inset glow comes back.

**It stays out of the way:** no clicks, no box, no effect on the page's layout, no text the page or the agent can read, and out of every screenshot. It's in a closed shadow root in the top layer, and all its styles win over the page's. It works on the strictest content security policy. The bird may cover something for a moment, as a hand would. The real input goes through it regardless, and the watch that stops a press landing on anything but the named element isn't changed.

### Find in page

`⌘F` (`Ctrl+F` on Windows) opens a bar in the top right corner of the page, in an overlay view of its own, using the Floating glass level. It has a field, a count such as "2 of 14" or "No results", previous and next, and close. `Enter` and `Shift+Enter` step through matches, and `Esc` closes it and puts the keyboard back on the page. The bar belongs to one page: going to another tab closes it, and opening it again keeps the last search, selected so typing replaces it. Internal pages can be searched too, and because the chrome view draws them, matches in the sidebar count as well.

### Zoom and printing

`⌘+`, `⌘-` and `⌘0` zoom the web page, per site and across restarts. Other open tabs on the site follow. Away from 100%, the toolbar shows the level beside the bookmark star, and pressing it goes back to 100%. Internal pages don't zoom, and `⌘P` prints web pages only, so those menu items are disabled there.

### Page menu

Right-clicking a web page opens a native menu with what was clicked in mind: spelling suggestions, link, image, editing, or back, forward and reload on a plain page, always ending in Inspect. With text selected, Ask Berry About This opens the chat panel with that text added to the composer. It is never sent by itself.

### Main chat

A full page for talking to Berry about anything, not about a particular web page. A chat starts from the new tab page and then lives as a tab, and past chats are listed in the sidebar. There's no empty chat page.

- A centred conversation and composer of 752px, with the composer fixed at the bottom.
- Messages and the composer are the same components as the chat panel, so the two sizes look like one chat.
- A chat is named automatically once it has a topic, and until then shows its first message. A name the user chose is never replaced.
- In the sidebar, hovering or focusing a chat swaps its age for a button with Rename and Delete, also on right-click. Rename edits in place, and Delete asks first because it can't be undone.
- Berry's working state says what it is doing and offers to show the work in a tab. Steps, once the agent reports them, form a trail: a footprint for each finished step and the berry on the current one.

### Chat panel

- Opens on the right with `⌘E` (`Ctrl+E` on Windows) and pushes the page.
- A card on the composer, with the page's icon, title and address, shows the page Berry can see. Removing it takes the page away from Berry, and the composer's + brings it back. No card means Berry sees no page. While the card is there, Berry may also read your other open tabs when the question needs it, and every look shows as a step. With no card, Berry can only open and use tabs of its own, each after asking, and they open behind the chat. Tabs Berry opens from the panel open behind the page too. Going to one to watch changes nothing, and Berry carries on. Clicking or typing in it, or sending it somewhere from the address bar or Back and Forward, takes it over: Berry can't reach it any more, stops, and says so.
- An approval request is the mascot speaking, in line with the conversation and with no card or shadow. Its bird in Asking sits beside it, hanging outside the column in the main chat as on a reply, and at the start of the line in the panel and on Routines. It leads with what it would like to do at 16px, with each address cut down to its site in semibold, such as "I'd like to open **github.com** in a new tab". That is the exact words with only the addresses shortened, and with Hide Berry it says "Assistant wants to". Under it, at 12px and never cut, are the exact words from the tool, which are what's being allowed. **Allow**, filled, and **Cancel**, outlined, are on one line below. By default one appears only for what could delete, send, buy or change text, such as a Delete button or typing in a form, and for an address carrying data in its query. A query and hash of up to 100 characters don't ask on YouTube, Google, Bing, DuckDuckGo, Wikipedia, GitHub, Reddit or Amazon, or on the exact site of a page the job already has open. Going to a plain link or typing a search doesn't ask. Settings can make Berry ask always or never. Cancel tells Berry no.
- When Berry can't go on without something only the user knows, it asks the same way, with a text box, Answer and Skip. It carries on with the answer, and a question waits like an approval, in any Ask before acting setting. Passwords, codes and card details are never asked for here.
- When a page stops it with a sign-in, a code or a captcha, Berry hands the tab to the user the same way, saying "I need you to sign in on **github.com**" and "Your password or code goes in the page, and I never see it.", with Go to the tab, I'm done and Not now. See Needs you.
- Using Berry needs no account. Only publishing a mascot does.

### Routines

A list with schedule, last result and status, plus a page for each routine with its instructions and run history. **New routine** and **Edit** open a form in the page, never a modal: a name, instructions in plain words, and when, as once, daily, weekly on chosen days or monthly, at a time. A day the month doesn't have means its last day. What's typed survives going to another tab. A finished main chat offers **Save as routine**, which fills in the form with what the user asked for, to change before saving.

- **A run** works like a chat with no page: the same tools, the same Ask before acting setting and the same step limit. It opens its own tabs behind the current view and closes them when it ends, except any the user has been to, which are theirs. It can't reach any other tab, including popups its pages open, which also stay behind and close with it. Its tabs are muted.
- **Run history** shows each run as a card: when it started, its status in words, a footprint for each step, Berry's report and the tokens used. A run that's going has **Stop**. One that failed, was stopped or was interrupted has **Run again**. Each routine keeps its last 50 runs.
- **Status** is one of Running now, Needs your OK, Finished, Failed, Stopped, Interrupted, Waiting to start, Paused or Scheduled.
- **Approvals** use the same card and exact words as a chat. The card waits on the Routines page and on Needs you, and so do questions and tabs handed to the user. Nothing is ever allowed for later: closing the app stops the run with nothing done, and the next launch shows it as Interrupted, saying what it was waiting to do.
- **Timing:** a routine runs only while a window is open. A time missed with the app closed or the computer asleep runs once on the next chance, however many were missed, and says it was late. Times missed while paused are not made up. A time that comes while the same routine is still going is skipped. A run starts only while fewer than two are working, and the rest wait to start. A run waiting on the user doesn't count, so other routines carry on, and once allowed it goes straight on, even if two others have started meanwhile.
- **Speaking up:** a result or a needed approval puts a dot on the Routines row until Routines is opened. If the app isn't in front, and the window isn't fullscreen and no tab is playing sound, a silent macOS notification says so, with no page text or approval wording in it. Anything waiting goes through Needs you, and clicking its notification opens the item there. A run the user stopped says nothing.

### Flock

Opens as a tab from the sidebar, the Go menu, or the new tab page when there's no sidebar, with only one open at a time.

- **The flock:** a heading and birds standing on a wire, as many to a row as fit, with no cards. The wire is a 1.5px line in `muted-foreground` at 45%, and it sags a little under each bird's weight. The rows wrap into more wires, and every bird faces the same way except each third, which turns round. Coming near makes one curious, and one that's working flies, with the berry beside its name. Under each is its name, what it's for in at most two lines, and its limits and routines as one muted line of words. **Chat**, **Edit** and **Publish** are always there, as quiet muted buttons, because hidden actions get missed. **Chat** chooses that mascot and opens a new tab, whose composer goes to it. Berry comes first, can't be edited or deleted, and has no limits to list. The next free place on the wire is the faint shape of a bird that isn't there yet, with no sag, "Room for one more", **New mascot** and **Browse the Gallery**. Its wire runs on to the end of the row. When the row above is full, it's one low line of its own instead, with a smaller shape and everything on one line, so there's no empty row. With Hide Berry, a small plain icon stands on a straight wire.
- **Making one:** a form in the page, never a modal, numbered 1 to 4, with the preview beside it, or above it in a narrow window. Look, name and what it's for take under a minute, and the limits are optional. **Surprise me** picks a look and a name. Looks are chosen by pressing the bird wearing them. What's typed survives going to another tab.
- **The preview:** the moment this page is for. The mascot, at 160px, hops when its look changes, gets curious while you name it, thinks while you say what it's for, and faces you while you set limits. Its nine moods sit below it, and pressing one shows it. Saving flies it off, and it lands on the wire with a hop. This is the one place a bird moves with no work behind it, and Still and reduced motion stop it as they do everywhere.
- **Limits only take away.** Any site, or only named sites with their subdomains. Reading is always on, with switches for going to pages, clicking and typing. The page says plainly that no limit changes when it asks: approvals work the same for every mascot, and a mascot has no setting that could skip one.
- **Refusals:** something off its sites never reaches a card, because there's nothing to decide. It shows in the steps as "Stayed off example.com". With an off-limits page open, the composer says the mascot can't see it in place of the page card, and the reading ring doesn't show. Refused pages aren't read or sent, including the page that would go with a message, embedded frames from other sites, and a page that sends the tab somewhere else while the mascot acts. A click can't open what it couldn't go to.
- **Choosing one:** the shared composer has a chip with the bird and its name. Pressing it opens the flock in a row inside the composer, in the flow rather than floating, so it works beside a web page. The bird on the new tab composer and the active tab becomes the chosen one. Once a chat has begun it keeps its mascot, and the chip just says who.
- **Who's working:** a reply names any mascot but Berry above it. A chat in the sidebar shows its bird, and a running chat shows the working berry where its age goes. A tab anyone is working in shows that bird as the tab's icon, Berry's too, or the working berry when Berry is hidden, with a shimmering title. When there's no sidebar to show it and the work is in another tab, the toolbar says who's working, and pressing that goes to the tab. Berry's old chats stay plain.
- **Routines:** **Who runs it** in the form uses the same row of birds, and a run keeps to that mascot's instructions and limits.
- **Deleting:** asks first, in a native dialog. The mascot leaves the flock, and its chats keep its look and limits. Routines it runs pause and stay limited, because moving them to Berry could let them do more than they were set up to. Anything pointing at a mascot that's no longer on file can only talk.

### Gallery

Mascots made for one job, ready to add, some from Blueberry and some from people you don't know. Opens as a tab from **Browse the Gallery** on the Flock page or the Go menu, with only one open at a time. Browsing and adding need no account. With no server set up, it shows just the starters, as it always has, and nothing about accounts appears.

- **The page:** a heading with a way back to **Your flock**, then a quiet row of filters, all as plain words: a search with no box that covers everything on a row and what the mascot is told, categories, and **Newest** and **Most added** when a server answers, with the chosen word underlined. The intro says plainly that strangers wrote these and nobody has checked them, only while a server answers. Then rows split by `border`, with no cards. What people published comes first, and starters follow in their own order.
- **If the server can't be reached,** the starters still show, and a line in `warning` above them says only those are showing, with **Try again**.
- **A row** has the bird at 88px, unboxed, with its toes on the line beneath it, then the name, "By" and its author, whether it has an example, one line on what it does, and its permissions as one muted line of words. On the right is **Add**, or "In your flock" with **Details** and **Chat** once there's a copy or it's your own. A published one shows how many adds it has beside **Add**, each account or install counted once. A starter isn't on the server, so it shows no count rather than a made-up one. There are no ratings or anything else that isn't real.
- **Permissions are the point of the page.** Each is a line of plain words with a lock, such as "Only visits hemnet.se" or "Can't type or click". What isn't limited, such as "Can go anywhere" or "Can click and type", has an open lock, so a card with no limit can't look like one with limits. Most starters are left open on purpose, so people can build on them, with the approval cards still asking, and limits are there for the few that are better for them. It isn't drawn as a warning, because it's the normal case. The words come from one function that reads the same sites and tools the tool layer enforces, never from what the entry says about itself.
- **Review:** Add opens one continuous page, never a modal, in a 672px column of plain lines split by `border`, with no cards. The heading comes first with the bird in Asking beside it, at 148px, standing on the line under it. Below are the permissions larger, then the instructions word for word. It says that the same approval cards apply and that a copy is the user's own. On one a person published, it says that someone using Blueberry wrote it and that we haven't checked it. Under the instructions is the example, "I asked this" and "And here's what it gave me", and the public page's link if there is one. What was asked and the instructions are plain text, because the user must see exactly what the model reads. The answer is rendered markdown, as it was in the chat, but nothing in it can load or go anywhere: no raw HTML, an image is only its description, and a link is its words and address as text. A starter's example comes from a real run, and one without a real run shows none. Nothing is added until **Add to flock**, and what's added is what was on the screen, even if its author has changed it since.
- **Added:** the same screen says it's in the flock, the bird lands in Delivered with a hop, and **Start a chat** is the main button, which chooses it and opens a new tab.
- **A clashing name:** the review asks for another, starting from "Morning Paper 2". Adding the same one twice can't happen, as the row offers a chat instead, and a deleted copy can be added again.
- **A copy is independent.** It's a normal mascot, with Edit and Delete in the flock, and nothing in the Gallery can reach it afterwards. It goes through the same checks as one made by hand, and it keeps the same approvals and limits.
- **What strangers can't do:** take the name Berry or Blueberry, write as Blueberry, or limit a mascot to this computer or the user's own network. Text a person can't see, such as invisible characters, is taken out. A row from the server breaking any of this isn't shown, and a name reaches the prompt in its own tag that says it's only a name.

### Publishing

From a mascot of your own, **Publish** opens a page in the Flock tab. It's plain lines split by `border`, in one 672px column, with no cards. Copies from the Gallery can't be published, and with no server set up there's no button.

- **Signed out,** the page says why an account is needed, with the sign-in form in place. There's nothing else to do until then.
- **What's chosen:** the name to publish under, which starts empty or as the one used last and never as anything from the account, one line on what it does, and a category as a row of words with the chosen one underlined. Radios and the box are drawn in our own colours over the real inputs, so the keyboard works as usual. The example is a list of that mascot's chats. Picking one fills in the last thing asked and its answer as text to edit, and it needs the box saying they've read both.
- **Exactly what goes public** is below that as term and value lines, with the bird, and it follows what's typed. It says that this is all that goes, never chats, history or the account's email.
- **Warnings** in `warning`, with an icon, above the button when any text looks like it has an email address, a key, a password or a card number. They say where, and don't block.
- **Published:** its own screen, and the one a published mascot opens on. The heading says so, with the bird at 148px in Delivered, standing on the line under it. Next is the public page's link, large, with **Copy link**, filled, and **Open it**, then the mascot as its row looks in the Gallery, with its real count of adds. **Edit the listing** and **Unpublish**, which asks first in a native dialog, are quiet below that. Editing the mascot doesn't change what's public until **Edit the listing** and **Update what's public**.

### The public page

What a shared link opens: `site/m/?id=`, a small static page with the same tokens, following the system's light or dark. The bird at rest, name, author and adds, the line on what it does and **Get Blueberry**, then lines split by `border`: what it's allowed to do, in the same words as the app, what it's told, the example and a note that someone wrote it and we haven't checked it. Everything from the server goes in as text, and its content security policy allows no other scripts. A mascot that's been removed or hidden says it isn't in the Gallery any more.

### Needs you

The flock's whole story on one page: give it jobs, carry on with your day, and it only interrupts when it truly needs you. Opens as a tab from the sidebar, the Go menu or the toolbar notice, with only one open at a time.

It's a plain list, like a mail inbox: rows split by `border` lines, oldest first, with no cards or shadows. Beside the heading is one small line about the phone: "Replies from your phone are on" when that's true, "Replies from your phone are paused" with a problem, or a quiet link to set it up, which opens Settings at Phone. Under the list is one short privacy note, and rows have no hints of their own.

- **A row** starts with the request, as one 16px sentence such as "Scout needs a code for linkedin.com". Addresses in it become site names. Where that changed anything, the exact words are on a muted line beneath it, cut to one line until the row is hovered or focused and then in full, opening downwards so Allow stays where it is. Nothing can be allowed without that line open, whether by pointer or keyboard. Below is the mascot at 24px in Asking, its name, the job (the chat's title or the routine's name) and how long it's waited, in 12px.
- **One action shows.** Allow for an action, filled, because it's a decision. An answer box with Answer for a question. **Go to the tab**, outlined, for a handed-over tab, or **I'm done** once on it. The rest (Don't allow, Skip, Not now, I'm done, Go to the tab, Open the chat or Open the routine) sit on the mascot's line, unseen until the row is hovered or focused. They can always be tabbed to, and reaching one shows them.
- **Answers:** answering happens in the row, and the job goes on behind it. After an answer, from here or from the phone, the row becomes one quiet line for about a second and a half, the mascot flying and saying what happened, such as "Allowed. Scout carries on." It uses `chat:decide`, like the card in a chat.
- **Empty:** the flock in a row, off duty, above "Nothing needs you right now." Anyone working flies and is named instead, because resting has to be true.

**A blocked job asks.** A sign-in, a code or a captcha is something only the user does, so the job calls `hand_to_user` and the row says "Scout needs you to sign in on github.com" or "Scout needs a code for linkedin.com". The site comes from the tab's address and the words from code, so a page can't write them.

- **Go to the tab** goes there. The toolbar on that tab says "Scout can't see this tab" with **I'm done**, in both layouts, since that's where the user will be when they finish. The row has **I'm done** too, and **Not now**. No control on the row or the tab takes a secret. The only text box answers a question, and the question can't ask for one.
- **While the user has it,** no job can reach the tab: not the one that asked, not another with the page open, and no message sends it along. Tools get an error saying the user is busy there. The chat composer says the mascot can't see it, and the working icon and reading ring go away.
- **I'm done** gives the tab back and Berry reads it again. A sign-in can land on an address with a code or token in it, so from then on, while that tab is open, the query and fragment of its address are kept out of everything the model is told. This is the one way a taken tab returns to a job, apart from sending it with a message or a code going in from the phone. The next click there takes it over again, as it would any other time.
- **Not now** tells Berry no. If the user touched the tab it stays theirs and out of every job's reach, so Berry can't read something left half typed, until they close it or send it with a message. If they didn't, it stays the job's. Closing the tab counts as Not now. Stop or closing the app ends the job the same way.
- Any Ask before acting setting hands over, because this isn't permission: Berry simply can't do it.

**From the phone.** The same items can be answered through the user's own Telegram bot, reached from this computer by long polling, so it works only while Blueberry is open and no server of ours is involved. It's off until they connect it in Settings, under Phone.

- **When it sends:** when the Blueberry window isn't in front, or after a minute with no input. Whatever's waiting then goes once, and is checked again every 15 seconds. **Send even when I'm here** forces it, for filming and trying it out.
- **Approvals** use the same exact words as the card, with Allow and Don't allow as buttons, through the same `chat:decide` and its checks. Whichever side answers first settles it. The phone message then says what happened, with its buttons gone, and the row goes.
- **Questions:** a reply answers it, as if typed in the row. The filter that stops a question asking for a secret still applies.
- **Codes:** "Scout needs a code for linkedin.com. Reply with it." The reply goes straight to the tab, typed with real keys by code the model can't call. The job hears only that a code was entered and to look at the page, and the model never gets it: not in a tool result, the chat, steps or logs. Anything a page repeats back is taken out of what goes to the model, the field is emptied after submitting, and that tab gives no screenshots for an hour, as a picture can't be cleaned. With more than one request taking a reply, only replying to the right message counts. Nothing that looks like a code answers a question: an answer like that is typed at the computer.
- **A code is typed only** if the reply is plausible (4 to 12 letters or digits with an optional space or dash, with a digit or in capitals), the tab still exists, is still held for the user, is on the same host as when asked and hasn't been touched, and code in the page finds exactly one place for it: the field marked one-time-code, then one with an obvious name, then a row of one-character boxes, then the only field on a page with no password. Otherwise nothing is typed, the phone says why, and it waits at the computer with the tab still held. After typing it submits and lets go, as I'm done does. The user's message is deleted, and the phone says if it couldn't be.
- **Sign-ins and captchas** can't be done from the phone. The message says it's waiting at the computer, with no buttons. Passwords are never sent this way.
- **If Telegram can't be reached,** or the token is revoked, everything simply waits on this page and Settings says what's wrong. No job ever waits on Telegram.

Not built: a job carrying on with other work while it waits. One reply runs one step at a time through the agent, so a waiting job waits, while other jobs go on.

### History

Opens as a tab with `⌘Y` (`Ctrl+Y` on Windows) and from the Go menu, with only one open at a time. The same column as Routines: the heading with Clear history beside it, a search field that takes focus, then a `surface` card of 36px rows for each day, headed Today, Yesterday or the date. A row shows the time in tabular figures, the favicon, the title and the site, and hovering or focusing it shows a delete button. Clicking a row opens the page in a new tab. Show more loads the next hundred, and search covers titles and addresses.

Clear history asks first, in a native dialog, because it can't be undone. Deleting history also takes those pages out of tabs' back and forward lists, Reopen Closed Tab and the saved session, and an open tab keeps the page it's showing. Reloading a page isn't a new visit, and neither is coming back to one after a restart. Pages Berry opens behind the chat stay out of history, and out of Recent on the new tab page, until you go to that tab.

### Restoring tabs

Reopening brings back the open tabs, their order, the active tab, each tab's back and forward pages, the sidebar and chat panel, and the window's size. Only the active tab loads. The others show their saved title and favicon and load when first visited. Berry using one loads it too, behind the page you're on. Scroll position and form contents don't come back, because the state that holds them can hold posted passwords. Closing the last tab leaves nothing to restore, and tabs a chat or routine opened behind you don't come back unless you went to them. Settings can start fresh instead, which also stops saving the tabs.

### A page in trouble

When a page crashes, stops responding or can't load, its view hides and the chrome draws Berry in its Oops mood, what happened in plain words and a Reload button, centred on the page card. A page that can't load also shows its address, and its tab is titled with the host. A load that was stopped or became a download isn't trouble. Its tab shows a warning icon, and the rest of the window keeps working. A page that recovers from being stuck comes back by itself. Going anywhere else from that tab clears it too. Reload, the toolbar button and `⌘R` do the same thing, and a stuck page gets a new process. Berry's tools on that tab get an error saying so, within 10 seconds at most for a page stuck with no sign of it.

### Damaged saved data

A chats or history database that can't be read doesn't stop the app. The file is moved aside beside its old name, never deleted, and the app starts empty and says so once in a native dialog, with where the old file is.

### Settings

Plain sections, including Account (only for publishing: the sign-in form, or who's signed in with **Sign out** and a plain list of what they've published, each with **Copy link** and **Unpublish**. With no server, it says plainly that this copy isn't set up for it), layout, appearance, Berry (Still, Hide, Show the bird on pages and when to ask before acting), Phone (connecting a Telegram bot, what Telegram can read, and Send even when I'm here), Downloads (the folder, and whether to ask where to save), Site permissions (every saved answer, to change or forget), and data and privacy, which must be easy to find. Data and privacy holds what stays on this computer, a way to history, bringing in history from another browser (only when one is found, with the same words as onboarding), whether Blueberry restores tabs or starts fresh, and the Suggestions switch with what it sends. Appearance follows the system by default, with a manual light or dark override.

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
- Put anything that floats over a page in an overlay view sized to its content, except the bird on the page, which is drawn in it.
- Keep AI calls and agent actions in the main process, behind the typed IPC contract.
- Show real state: navigation, loading and what Berry can see.
- Add every new component to the gallery, in every state, in light and dark.
- Test with reduced motion, reduced transparency and keyboard only.
- Check contrast on glass with light and dark backgrounds behind it.
- Run UI changes and look at them, including both layouts.

### Don't

- Don't put glass on web pages or inject styles into them for chrome effects. The bird on the page is the one thing drawn there, and it has no controls.
- Don't use raw hex values or hard-coded sizes in components.
- Don't add a colour, weight, font or shadow that isn't in this document.
- Don't add bounce to the chrome or loops without real work behind them. The exceptions are Berry's world on the new tab page, the legs of a sitting bird, and the preview on the Flock page.
- Don't let Berry joke about permissions, payments, messages, data or failures.
- Don't let Berry open modals, take focus, make sounds or speak about work the user didn't start, apart from suggestions on the new tab page.
- Don't read page content unless the user asked.
- Don't send browsing data to third-party services for UI features such as favicons.
- Don't make any feature depend on Berry being visible.
- Don't add a settings slider for glass strength.
