# Blueberry design: Bloom (replaced)

> **This is the old design, replaced by [DESIGN.md](../../DESIGN.md) on 2026-11-15.** It's kept for one reason: it says how the screens that haven't been redrawn yet behave. Read it for what a screen does, never for how it looks. Its colours, glass, type, bird artwork, wires, footprints and layouts are not to be copied. When a screen is redrawn, its section moves to DESIGN.md and is deleted here, and when none are left this file goes.

Blueberry is an AI browser that should feel like a good Mac app with one capable colleague inside it. The direction is **Bloom**: the window is made of the fruit. The frame is the dusty, matte skin of a blueberry, solid web pages float on it in one rounded card, and the blueberry itself is the one thing in the chrome with real colour.

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
- **A crowded tab row:** tabs share the row evenly, and the active one gets room for its close button and the bird on top, so its title is never cut shorter than the others'. Below about 72px a tab shows only its icon, and its close button on hover or while active.
- **Collapsed sidebar:** it returns when the pointer reaches the frame gutter at the window's left edge. It slides in over the page and slides away when the pointer leaves, so it is an overlay view (see below).
- **Sidebar contents, top to bottom:** window controls with search and the collapse button, then the bookmark cluster, then New tab, Needs you, Routines and Flock, then chats, then tabs. Settings stays at the bottom, and the account lives in it. Collapsed, the toolbar shows the button that brings the sidebar back.
- **Sidebar rows:** every row starts with a 20px slot, so all their text starts at one straight edge. A chat's slot has its bird at rest, Berry's too, or a chat icon with Hide Berry on. Only one row is highlighted: when Needs you, Routines, Flock or Settings is open, its tab under Tabs has the highlight and its row only turns `foreground`. A chat is never under Tabs, only its row under Chats, highlighted while it's open. While its tab is open, hovering the row also shows a close ×, which closes the tab as any tab's does and keeps the chat. Collapsing Chats still leaves the open chat's row. The horizontal tab row has no chats list, so chats stay in it as tabs.
- **Buttons on the sidebar and chat panel** sit on the toolbar's address row, the docked sidebar, the floating one and the panel alike, so every button along the top shares one line.
- **Bookmark cluster:** pinned sites and bookmarks as 44px round buttons, in rows of four and three offset like a bunch of fruit. A site keeps the icon its page named when it was saved, and one with no icon shows its first letter. Pinned sites come first, and a site saved both ways shows once, as a pin. With nothing saved, the cluster and the bookmarks bar keep their place and say "Pin or bookmark a page to keep it here." in muted text.
- **Address row:** left-aligned plain text on the card, with no pill until it is hovered or focused.
- **Bookmark star:** outlined when unsaved, filled light yellow using `bookmark` when the current page is saved, with no selected or hover background behind the saved star.
- **Pin button:** beside the star, and usable on the same pages. Neither shows on our own pages, which can't be saved. A pinned page fills the pin and uses the normal toggled background. The File menu has Pin This Page, and right-clicking a saved site offers Unpin and Remove Bookmark, whichever apply.
- **Spaces and folders:** not part of this design yet.

### View stack

From bottom to top:

1. **Chrome view:** one transparent, window-sized renderer that draws all our UI.
2. **Tab views:** one solid view per tab. Only the active tab is visible.
3. **Overlay views:** small transparent views for anything that floats over a page, such as address suggestions, menus and the revealed sidebar. The bird working on a page isn't one, because a view takes clicks: see Over a web page.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view.** The chrome view is underneath tab views and cannot draw over them. The one exception is the bird on the page.
- **Overlay views are only as large as what they show.** Assume a transparent area blocks clicks. Rounded cut-outs on views also still capture clicks.
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
| `berry-ink` (body) | `#181c2e` | `#2a2f4d` |
| `berry-wing` | `#2e3454` | `#3d4470` |
| `berry-nape` | `#9ea6be` | `#a8b0c8` |
| `berry-eye` | `#f4f1e6` | `#f4f1e6` |
| `berry-pupil` | `#141624` | `#141624` |
| `berry-beak` | `#3e4466` | `#4e5680` |
| `berry-fruit-mid` | `#4e5fb4` | Same |
| `berry-fruit-dark` (shade) | `#2a3380` | Same |
| `berry-fruit-bloom` | `#a4afe0` | Same |
| `berry-fruit-crown` | `#161c4c` | Same |

`berry-gear` and `berry-gear-shade` colour a mascot's accessory, with `berry-pupil` as its edge. Jackdaw's are `#d9a312` and `#a87c08` in light, `#ffd23f` and `#d9a312` in dark.

Dark `berry-ink` stays a dark bird, and a thin light rim (`berry-rim`, white at 45% with a 0.75px blur) holds its outline on dark backgrounds. The body is below the 3:1 for meaningful graphics, so the rim, eyes, hood and berry carry the shape, and nothing may rely on Berry alone: moods have text labels. The presets are bright enough in dark mode and have no rim.

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
- **Recording ring:** while the user is showing Berry something, the page card's shadow becomes a 2px `destructive` ring with a soft glow, on every tab including our own pages. It comes before the reading ring.
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
| 34px | Semibold, tight tracking | Onboarding, and the heading of a page on the public site, 48px there on a wide screen |

- The public site's lede is 20px regular on a wide screen, and the phone page's headings are 28px. Nothing else in the chrome uses them.
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
| Disabled | Reduced emphasis, with a reason where possible, and based on real state. A primary button stays a faded primary, never grey |
| Loading | Only while work is really happening |
| Error | Status colour plus an icon or text, with a way forward |

Tabs also show: page loading, audio playing, crashed, and Berry working in this tab.

- **Buttons have three roles:** primary, filled with `primary`, for the one decision; outline beside it; and quiet text for everything else. The only other button is the recording's red Stop, where the colour is the status.
- **Favicons:** a page with no icon shows the first letter of its site in a small round `muted-foreground` tint, so sites still look different.
- **Scrollbars:** a thin `border` thumb, shown only while the pointer is over what scrolls or it's scrolling.

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

### When you click it

Clicking a bird anywhere in the chrome gets a small reaction: a hop, a curious look, tossing the berry or a ruffle that loses a feather, in turn. Five clicks in a couple of seconds and it turns its back on you for a moment and ignores you. Only a bird at rest changes pose. One sitting on a tab or already curious hops and ruffles, and one with a status mood gives a small squash, so a mood that means something stays on screen and its label never changes. It's decoration: it says nothing, changes nothing, and any button it's on still takes the click. Reduced motion only gets the curious look, and Keep Berry still gets nothing. The bird working on a web page doesn't react, because nothing there can be clicked.

### Where Berry appears

| Place | What it does |
|---|---|
| Onboarding | Large, guides setup |
| New tab | Large, standing on the composer's top edge with its toes gripping it. Smaller, standing on the art blueberry to say a suggestion |
| Browsing | Small, sitting on the active tab's lower edge with its legs hanging, in a slot the tab keeps free between its title and its close button, so it covers no text. On a narrow row of tabs, the active one stays wide enough for the slot |
| Chat | Working and waiting states beside its replies |
| Routines | Flies off when a routine runs and returns with the result |
| Settings | Its own section |
| Flock | Its own page, standing on a wire with the flock, and standing on the line over what it remembers |
| Gallery | Standing on the line under each row, at rest on the review screen, Delivered once added |
| Needs you | Asking at 24px on each row, and off duty when nothing's waiting |
| Over a web page | Only while working in a page the user can see, in front of them or in the working view, drawn in the page. See Over a web page |
| Show Berry how | Curious in the toolbar while it watches, and standing on the line over its notes |
| The working view | In the picture while it works, and on the window's top edge when it isn't. See The working view |
| On your desktop | Only if it's turned on, tucked behind any edge of the screen while you're in other apps. See On your desktop |

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
| Bird on the desktop | A mood, and one short line beside it, only if it's turned on. It replaces the notification for Needs you. See On your desktop |

Berry never opens a modal, takes keyboard focus or makes a sound. A notification never comes during fullscreen or while a tab plays sound, and it says who and what kind of thing it is, never the question, the site or anything typed. A phone message does say those, because it's how the user answers, and Settings says Telegram can read it. Anything waiting holds until the user is done.

### Reduced motion

Poses switch with a quick fade, with no flying or hopping. Nothing relies on seeing the animation.

### Turning it off

Available from Settings and by right-clicking the perch:

- **Still:** keeps the bird, stops all animation and flight. It moves between places with a quick fade.
- **Hide Berry:** removes the character everywhere, replacing it with a plain icon and neutral copy.

Every feature keeps working either way, and turning it off never prompts the user to reconsider.

## 9. Key screens

### New tab

Berry, large, stands on the top edge of a 752px composer, right of centre, so it covers no text or control. It's drawn inside the composer's wrapper, so the two scroll as one. It only flies as a separate layer on its way there. Below rises the art blueberry, the page's one big moment: thousands of tiny berries spiral out of a sunken crown like seeds in a sunflower head, swelling in the light and shrinking in shadow, under heavy grain, with dust drifting off the edge so it has no hard outline. It is 1240px across at any window size, painted once and never moves. Birds stand on it to say suggestions if there are any. Otherwise the same birds offer up to three real chats and routines, each by the bird that runs it, or Berry offers two ideas linking to real features if there are none of those either. Recent pages follow in a frosted panel if there are any. When the sidebar is closed, links to Needs you, Routines, Flock and Settings sit under the composer, on a frosted strip the birds pass behind. Faint, irregular trails of alternating bird footprints sit in the background behind the art blueberry, with varied lengths, directions and faded sections instead of a repeating tile, and two small birds walk around behind the page leaving new prints that slowly fade. They pause to peck now and then. Each print is the size of the bird's foot and lands under it, and a stride is what its legs really cover. Still, Hide Berry and reduced motion remove the birds and keep the old trails, and so do suggestions, so that the birds saying something you've repeated have the page to themselves. Nothing appears in the recent list unless it is real. The chat panel doesn't open here, because this page has its own composer. It returns on the next page if it was open.

`Enter` opens anything that looks like an address and asks Berry about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. Searching is the address bar's job.

**Suggestions** are what Blueberry noticed you trying to get done, offered as work it can take over: fares compared across three sites, a search repeated on different days, a score checked every Monday, a chat that got no answer, a routine that keeps failing. The cheap model decides what to offer, from a digest of the last two weeks, and code checks every claim it makes. Each says plainly why it's there, and anything it says about the user, every count, day and time, has to be in what it cites.

**How they look:** not cards. Each is a bird at 76px standing on the fruit's real outline, in up to three columns of 224px, or stacked below it in a narrow space. The words are directly on the fruit, below its outline at every point of their column, so outer columns sit lower and the group follows the curve. The reason comes first in `primary-foreground`, then one semibold sentence the bird says. Under them is one action in words with an arrow, and Not now, shown on hover or focus. Berry says Prompt and Routine ideas. A Mascot idea is said by that new bird in its own colours, facing you in Asking, as if it has turned up to meet you. The last of several faces inwards. Hide Berry removes the birds and keeps everything else in place.

- **Prompt:** "Put it in the box" puts a ready prompt in the composer with the cursor at the end. Enter sends it.
- **Routine:** "Set it up" opens the routine form filled in with a name, instructions and a schedule that finishes 15 minutes before the user usually looks.
- **Mascot:** "Meet" and its name opens the new-mascot form filled in with a look, name, instructions and limits. It starts limited to the sites in its evidence, with only Go to pages switched on.

A suggestion only ever fills something in for the user to confirm, so nothing runs, is saved or is sent until they act. What's dismissed with Not now doesn't come back, and nothing like it does either. Saving the form or sending the prompt also ends it. Both are remembered and read by the model next time, as "not this again" and "more like this". The order is always prompt, routine, mascot.

The page shows saved suggestions at once or what it would show without them, and never waits. The model is asked at most about once an hour, and only when there's something new: a visit, a chat or a routine run. It gets a digest, built in code and tagged as data: browsing sessions with the site names and page titles in order, search queries from the big search engines with when and how often, the titles of chats and whether each got a reply, routines by name with how their last runs went, the flock's names and sites, and the cards dismissed or used before. Never a page's text or a full address. Every item has a short id, and each proposal has to cite the ids it's based on. Bringing in history that adds visits lets one call through at once, and the limit holds again after it.

Code drops any proposal that cites an id that isn't there, says a number its evidence doesn't hold, names a site outside its evidence or any address, or repeats a dismissed card or something already set up. Its sites only ever come from its evidence. A routine keeps its schedule only if that's when the user really looked, on most of those days and over more than one week for a weekly one, and otherwise becomes a prompt. Local addresses, addresses with tokens, and sites recognised as banks or mail are never in the digest, and search engines only for their query, though that recognition can miss one. A title from an address with a query isn't sent, and a search that looks like it's about health, money, the law or a login isn't either. Without a model key, offline, or when nothing the model proposed checks out, the old rules still find what's repeated, three times over (a site on three different days, at about the same time or weekday, two sites used together on three days, or three similar chat requests), and code words those cards. Settings has an off switch, under Data and privacy, which also says what is sent.

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
| A job waits for an answer | Asking, facing you, with "Waiting for you". On an approval about one element it stands on that element, so asking to click Place order puts it on Place order. It flies there as the card appears and the card doesn't wait for it, and again whenever the tab comes into view while the card waits, in front of the user or in the working view. If that element is gone or out of view, it asks from where it is |
| A frame from another site | Its script can say anything about itself, so nothing's asked of it. The bird stands near the top of that frame in the page around it |

**The line** is one small pill near the bird, placed where it covers the least, staying off the target and off the text beside it where it can, always on screen, saying what's happening in the present tense: "Clicking Add to cart", "Typing in Email". The name is the label beside it on the page, which the chat steps leave out because they go back to the model. These words go nowhere but the working view's own words in the chrome. It never shows what's being typed, which key, the contents of a text box, or a secret field's label.

**Stop isn't on the page.** Anything a page can see it can fake, and a fake Stop or a real one a page could press is exactly what mustn't exist. The line is only words, and **Stop Berry** is in the toolbar just above it, for as long as anyone is working in this tab. It's the same as Stop in the chat or on a routine. Pressed while the bird is flying, the click it was flying to never happens.

**How long:** a click costs its flight, 200ms plus 0.35ms a pixel up to 520ms, and 70ms for the beak to come down. Nothing is added in a tab behind the user's, or with the bird turned off.

**When it isn't there:**

- **Tabs not in front:** nothing is drawn and nothing waits, unless the working view has a picture of that tab on screen, which counts as looking at it. Going to one mid-job, it appears from then on.
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

A full page for talking to Berry about anything, not about a particular web page. A chat starts from the new tab page and then lives as a tab, which the sidebar shows only as the chat's row under Chats, with past chats. There's no empty chat page.

- A centred conversation and composer of 752px, with the composer fixed at the bottom.
- Messages and the composer are the same components as the chat panel, so the two sizes look like one chat.
- A chat is named automatically once it has a topic, and until then shows its first message. A name the user chose is never replaced.
- In the sidebar, hovering or focusing a chat swaps its age for a button with Rename and Delete, also on right-click, and a close × beside it while the chat is open as a tab. Rename edits in place, and Delete asks first because it can't be undone.
- Berry's working state says what it is doing and offers to show the work in a tab. Steps, once the agent reports them, form a trail: a footprint for each finished step and the berry on the current one. A click the user allowed names what the card named, such as "Clicked “Place order” on shop.example", cut to 48 characters. That name is page text, so it's only drawn: the model, the cloud and other apps only ever get "Clicked something".
- A web search shows as "Searched the web for “…”", with the query cut to 48 characters, so the user sees what went out. The query is the model's words, so it's only drawn too: the model and the cloud get "Searched the web". A search that could carry data asks first, on a card naming the whole query.
- **A shorter trail,** the same in the main chat, the panel and Routines. While a job runs, only its latest three steps show, with the current one last, under a quiet line such as "17 earlier steps" that opens to all of them. Once it has finished, the whole trail is one line, such as "20 steps on webhallen.com", which opens the same way. A job cut short, with an error or no answer, or a run that failed, stopped or was interrupted, keeps its latest three showing, so you can see where it ended. A lone step just shows. Anything it asked the user, anywhere it stayed off, or where it was stopped, stays showing on any trail. Folding the trail changes nothing about what's saved or told to the model. A stopped reply always ends with the step "Stopped here", even when it had done nothing yet, so it never ends in nothing. That step is saved with the reply, and the model reads it next time as it reads every step.
- **A job's tabs aren't the user's.** While a job runs, the tabs it opened show under its chat in the sidebar, indented, at 13px with their favicon, and not under Tabs. The horizontal tab row has no chats, so they stay in it. When the reply ends, done, stopped or failed, they close by themselves. Two stay, as the user's: one they took over by clicking, typing or navigating there, and the one the reply points to, which is the job's last tab when the reply names its site or address, decided in code. One handed to the user, one another job is using, and the one the user is looking at are left alone. Under the reply, a quiet line, "Pages it used (3)", opens to each page's title and site, and pressing one opens it as the user's own tab. The addresses are saved with the reply, with only the site and path of one that came back from a handoff, and none a code was typed into.

### Saying what it'll do

On a job of more than one step, Berry first says in one sentence what it'll do, such as "I'll check their careers page and LinkedIn first." A one-step lookup just answers.

- **The status line:** that sentence, and any short note it writes between steps later, shows at the top of the reply while it works, above the trail, at 14px in `muted-foreground`, two lines at most. It's plain words with no icon and no shimmer, since the trail under it already shows the work going on. The newest replaces the one before, and it goes as soon as the answer starts.
- **Not the answer:** the answer is only Berry's last message. The status line isn't saved with the reply, and nothing else gets it: not the model next time, a routine's result, the cloud or the phone page, or another app. A routine's run card shows it the same way while the run is going.
- **Words that turn out to be on the way:** the model's words can only be told apart from the answer once it calls a tool, so they stream as the answer until then and move up into the status line when it does.

### The working view

While a job uses tabs, a job behind the chat can be watched. Other AI browsers show a little window too. In ours **you watch the bird work inside it**. It's on the right of the main chat, drawn on the page's own `canvas`, with no card or panel around it, only words and thin lines. The side chat panel doesn't have it, because the page is already beside it. A job with no tab shows nothing.

- **The window:** a picture of the tab it used last, the page's own shape, 38% of the page's width between 300px and 600px, big enough to film, with the site along its top like the page card's address row. It wears the reading ring while the job works. The job's other tabs are 104px thumbnails under a line, with their site beneath and no bird, as there's only one. Pressing any of them goes to that tab, which doesn't take it over.
- **The bird in the picture** is the real one, drawn in the real page with the same pacing as if the user were looking, because a tab with a picture on screen counts as watched. It's drawn larger there, so it's 42px in the picture. The line near it isn't drawn, since the words under the window say the same at a size you can read. Thinking stays still between steps in a picture.
- **The edge of the window:** nobody stands on it while the bird is in the picture, because two of the same bird would be two colleagues. A bird that isn't in the picture stands there instead, on a tab handed to the user, once the job has ended, or with Show the bird on pages or Keep Berry still on.
- **The words under it:** what it's doing now at 16px, shimmering, in the bird's words, or a step in the present tense if there's no bird to say it. Then who, how long it's been going in tabular figures, and **Stop**, which does what Stop in the chat does. The sites it has been on come last, if there are two or more. There are no metrics, costs or token counts.
- **Waiting:** "Waiting for your OK" or "Has a question for you", with **Answer in the chat**, which goes to it. The buttons themselves are only ever in the chat. A tab handed to the user says "Waiting for you" with no link, because it's answered in the tab, which the window goes to.
- **A tab the user has:** handed over or taken over, the window is only its address row, 40px tall, with the site and "You have this tab", and the bird stands on its top edge. There's no picture to show, so there's no empty box.
- **The end:** the ring fades, the bird flies up out of the picture, and it stands on the edge, Delivered if it finished and at rest if it didn't, over the last picture and "Done", "Stopped here" or "It didn’t finish". It stays quiet like that until the next message, when it goes, or until the user leaves the chat, and it isn't there when they come back. Since a job's tabs close when it ends, it only stays where one of them did.
- **No room:** below 960px of page, one line above the composer says the same with the bird, the site and the time, and pressing it goes to the tab. There's no picture and nothing is captured. It goes when the job ends.
- **Show Berry off:** plain words and no bird on the edge. In the picture it's the plain pointer, as on a page.
- **In the cloud:** the window is the cloud tab's own live view, or the test browser's pictures fitted whole at the top, locked as it is before Take over, and pressing it opens that cloud tab. No bird is drawn in a cloud page, so it stands on the edge throughout, and other cloud tabs are plain thumbnails.

**Pictures protect the user.** They go only to the chrome renderer, through its own channel, and never to the model, a tool, a saved chat or the disk. A tab handed to the user, or taken over by them, shows "You have this tab" with no picture. Capture stops first, and one already on its way is thrown away. The same goes for a page off a mascot's sites, with page access off, for a page that may show a code from the phone, and for one that has crashed or couldn't load. Only tabs this job has used are ever pictured, and only while the chat is the tab in front and the window is showing. Berry's own `screenshot` tool is separate and still hides the bird.

**How often:** about 12 pictures a second while the bird is doing something, 2 otherwise, and 1 once a page has stopped changing, when nothing is sent at all. Other tabs get one every 3 seconds. They are JPEGs at twice the size on screen.

### Show Berry how

You press **Show Berry how**, do a job once, press Stop, and Berry turns it into a routine. Nobody writes a prompt. The other AI browsers that watch you do it all the time. This watches only between start and Stop, and you read everything it saw before anything happens.

- **What's watched:** only the tab in front, and only what the user does there. Going somewhere, clicking something with a name, what's typed once they've finished with a field, or on Enter or Tab in an editor like a spreadsheet's, choices, boxes and pressing Enter. Copying is noted with the text that was selected, and pasting with only the field it went in, as what's pasted is read from the field like anything typed. Selecting text isn't a click. Not scrolling, not pointer movement, no pictures, never the clipboard, and never a key as it's pressed. Events a page makes for itself don't count, and nor does anything on a tab a job is using or one held for a sign-in. Our own pages aren't watched. A frame from another site is only noted as used, because nothing outside it can see in.
- **What's never kept, even for a moment:** the value of a password, hidden, one-time code or payment field, or any field in a form with a password in it. A field that has been one stays one, so "show password" doesn't change it, and something shaped like a card number counts wherever it's typed. It says "Typed in the password field", or "Copied from the password field", with a lock, and nothing a page calls it. An address loses its query, fragment, any login and anything in its path that looks like a token. A query stays only when it's plainly what was just typed, or from the address bar under a name that means a search, and it's on the review as a search.
- **Confirming:** the notes go as words, with anything a page wrote marked as data to be named and never followed. The cheap model writes a name, numbered steps and what might change. It can't set sites or tools, a change has to be something the user really entered, and steps naming another site are thrown out for the user's own notes as they stand. With no model, or if it can't be used, the plain version is what fills the form. If the call fails, it says so and the notes stay. Once the form is filled in, the trail is gone.
- **The form:** the same routine form, with two more parts. **What might change** is one row for each value, where changing it changes the instructions above and **Ask me each run** makes the run ask through the usual question. **Sites it may use** starts with the sites in the notes, and a run can't go anywhere else. Where one company runs many products, such as Google or Microsoft, the site is the whole host, so a Google Sheet is docs.google.com and not all of Google. When starts as **When I ask**, which only Run now starts, so nothing runs by itself until the user picks a time. **Save and run it now** is the main button, with **Save** beside it.
- **The run** is any routine's run, with the same approvals, Needs you and steps. Sites only take away, on top of the mascot's limits. Off them it shows "Stayed off example.com".

### Chat panel

- Opens on the right with `⌘E` (`Ctrl+E` on Windows) and pushes the page.
- A card on the composer, with the page's icon, title and address, shows the page Berry can see. Removing it takes the page away from Berry, and the composer's + brings it back. No card means Berry sees no page. While the card is there, Berry may also read your other open tabs when the question needs it, and every look shows as a step. With no card, Berry can only open and use tabs of its own, each after asking, and they open behind the chat. Tabs Berry opens from the panel open behind the page too. Going to one to watch changes nothing, and Berry carries on. Clicking or typing in it, or sending it somewhere from the address bar or Back and Forward, takes it over: Berry can't reach it any more, stops, and says so.
- An approval request is the mascot speaking, in line with the conversation and with no card or shadow. Its bird in Asking sits beside it, hanging outside the column in the main chat as on a reply, and at the start of the line in the panel and on Routines. It leads with what it would like to do at 16px, with each address cut down to its site in semibold, such as "I'd like to open **github.com** in a new tab". That is the exact words with only the addresses shortened, and with Hide Berry it says "Assistant wants to". Under it, at 12px in a block of `muted` (`tray` in dark mode, where it's the darker one) with the `control` radius and never cut, are the exact words from the tool, which are what's being allowed, as on the phone page. Where no address was shortened, the sentence already is the exact words, so there's no block. **Allow**, filled, and **Don't allow**, outlined, are on one line below, in that order everywhere: here, on Needs you, on the phone page and in Telegram. By default one appears only for what could delete, send, buy or change text, such as a Delete button or typing in a form, and for an address carrying data in its query. A query and hash of up to 100 characters don't ask on YouTube, Google, Bing, DuckDuckGo, Wikipedia, GitHub, Reddit or Amazon, or on the exact site of a page the job already has open. Going to a plain link or typing a search doesn't ask. Settings can make Berry ask always or never. Don't allow tells Berry no.
- When Berry can't go on without something only the user knows, it asks the same way, with a text box, Answer and Skip. It carries on with the answer, and a question waits like an approval, in any Ask before acting setting. Passwords, codes and card details are never asked for here.
- When a page stops it with a sign-in, a code or a captcha, Berry hands the tab to the user the same way, saying "I need you to sign in on **github.com**" and "Your password or code goes in the page, and I never see it.", with Go to the tab, I'm done and Not now. See Needs you.
- Using Berry needs no account. Only publishing a mascot does.

### What a bird remembers

Other AI browsers remember you in ways you can't see. Here you can read every word a bird knows, and it knows nothing you didn't say yes to.

- **The offer is one quiet line:** after a job, in the rare case a bird has something, one 13px muted line sits under the reply with a small chevron, "Something I could remember for next time", no louder than the step trail. It's always folded, whether it's one fact or two, and there's no card, face, count or dot. In the main chat it comes after **Save as routine**, which stays the stronger of the two and doesn't move when it arrives. Pressing it opens the fact, exactly as it would be kept, its site at 12px if it's only about one, and **Remember** and **No thanks** as quiet text, all in the same muted style. With Hide Berry, "Something Assistant could remember for next time".
- **Nearly never:** a bird only has something when the user's own words say it goes beyond this job, such as "I always", "I usually", "I never", "alltid", "brukar" or "from now on", or plainly ask it to remember. A colour, length, size, brand, date or price limit for this search isn't a preference, however it's put, and nothing is guessed from what someone asked for. Without such words code makes no call to the model at all, and with them the model still usually says no. At most one fact comes after a job, or two if two were clearly stated. A plain "Remember that I want prices in kronor" gets a line even with no job behind it.
- **Ignoring it is fine:** it doesn't move, repeat, wait or interrupt. Leaving it alone is as good as No thanks. A new message takes it away. Nothing about it reaches the toolbar, Needs you, a notification, the phone or the bird on the desktop. Closing the app forgets it, and so does the mascot being deleted. No thanks keeps that bird from offering the same thing again until the app restarts.
- **When nobody's looking:** a job from the bird on the desktop is a chat, so the same line is under its reply for whenever the chat is opened. A routine's is on its run in the run history. A routine's own instructions are already in place, so it only has something when an answer the user gave during that run says it's a habit. That's how a routine gets better: the next run has the answer.
- **Kept:** the line gives way to "Noted." and a link to the page below, in the same muted words, with no bird or hop.
- **Used:** while a job runs and on its reply afterwards, a 13px muted line says "Keeping in mind:" and what it went in with, and **Change** goes to the page below. Up to two show, and more fold into "Keeping in mind 3 things you kept". It says what the model was given, never that it made a difference. Whether one changed anything is for the reply to say, in a few plain words. Forget one and it's off every old reply too, because replies keep only its id.
- **The page:** redrawn, in DESIGN.md under Your mascots.
- **What it's used for:** anything general goes into every job. One tied to a site goes in when the job has a reason to be there: its page or tab is on that site, the chat has already been there, the mascot is limited to it, or the user's words name it. A site only found along the way brings its facts from the next message. At most 8 go in, with a site's first and the newest first. A mascot holds at most 30, and past that the offer says to forget one first and no more are proposed.

**A page can't write here.** The model that proposes only gets what the user typed, their answers to its questions, the names of the sites used and what's already kept. It never gets a page, a step or the reply. The nearest a page can get is a site's name, or the wording of a question the main model wrote after reading it, and the model is told only what the user typed counts. Even then, nothing is kept until Remember. Code then checks every sentence, from the model, from an edit and from the file when it's read: invisible characters come out, a site must be one the job really used, and passwords, codes, card details, addresses, emails, phone numbers, keys and anything shaped like them are refused. So is anything about what a bird may do, such as not asking first, because that isn't a preference. A job that handed a tab to the user offers nothing at all, and anything a phone typed for it is kept out as well.

**What it can't do.** It's words in the prompt, in their own tag, after the safety rules, as preferences. Limits and approvals are in code and never read it, so it can't widen a mascot's sites or tools or skip a card. No tool can read or change it. It stays on this computer in a file of its own, and it never goes with a copy, a Gallery entry or anything published. A published mascot's example is whatever the user reads and picks, as it always was. Each bird's is its own, so a new copy starts empty, and deleting a mascot deletes it. Settings has **Offers to remember**, under Data and privacy, which says what's sent, and off means no more offers and no more calls to the model. What's kept stays in use until it's forgotten.

### Publishing

From a mascot of your own, **Publish** opens a page in the Flock tab. It's plain lines split by `border`, in one 672px column, with no cards. Copies from the Gallery can't be published, and with no server set up there's no button.

- **Signed out,** the page says why an account is needed, with the sign-in form in place. There's nothing else to do until then.
- **What's chosen:** the name to publish under, which starts empty or as the one used last and never as anything from the account, one line on what it does, and a category as a row of words with the chosen one underlined. Radios and the box are drawn in our own colours over the real inputs, so the keyboard works as usual. The example is a list of that mascot's chats. Picking one fills in the last thing asked and its answer as text to edit, and it needs the box saying they've read both.
- **Exactly what goes public** is below that as term and value lines, with the bird, and it follows what's typed. It says that this is all that goes, never chats, history or the account's email.
- **Warnings** in `warning`, with an icon, above the button when any text looks like it has an email address, a key, a password or a card number. They say where, and don't block.
- **Published:** its own screen, and the one a published mascot opens on. The heading says so, with the bird at 148px in Delivered, standing on the line under it. Next is the public page's link, large, with **Copy link**, filled, and **Open it**, then the mascot as its row looks in the Gallery, with its real count of adds. **Edit the listing** and **Unpublish**, which asks first in a native dialog, are quiet below that. Editing the mascot doesn't change what's public until **Edit the listing** and **Update what's public**.

### The public site and the phone page

The pages at `site/` are web pages, not the window, so they don't copy its shape. The frame and the page card mean "a browser around a page", and on the web or a phone the page is all there is: drawn as a card floating on lavender, it looks like a picture of an app rather than one. So there's no frame and no card anywhere on them.

- **On `canvas`:** the whole page, edge to edge, in light and dark. The lavender `frame` and `background` aren't used at all, not even as a band behind the header, because the only colour with a job here is the blueberry's, and a tinted band would be decoration behind content. The phone page's `theme-color` and its Home Screen colours are `canvas` too, so the status bar runs into the app bar.
- **One grid and one left edge:** the site's column is 1040px wide with 20px gutters on a phone, 32px from 600px and 48px from 960px. The header, the heading, the birds and every section start at its left edge. Nothing is centred but the column itself.
- **On a wide screen,** each section is one row of two columns: its heading on the left, and what it says from a third of the way across, under the third bird, at most 40em wide so lines stay readable. On a phone the heading sits over it.
- **Whitespace, not boxes:** sections are split by one `border` line and nothing else. No shadows, panels, pills, badges or icons beyond the locks, which mean something.
- **The birds are the picture:** as big as the column allows, standing on a 1.5px wire in `muted-foreground` at 45%, never in a box.
- **Controls at real sizes:** buttons are 44px tall, filled only for the main action, and every layout keeps clear of the notch and the home indicator with the safe-area insets.

### The public page

What a shared link opens: `site/m/?id=`, a small static page with the same tokens, following the system's light or dark. "Blueberry" at the top goes to the front page, laid out as in The public site and the phone page above. The name at 34px, or 48px on a wide screen, author and adds, the line on what it does, then **Open in Blueberry**, filled, and **Get Blueberry**, outlined, with one muted line under them: Blueberry shows it all again and adds nothing until Add, and it isn't out for download yet. The bird at rest stands at 200px on the line under all that, at the right of the column, or at 144px on its own short wire above the name on a phone. Then sections split by `border`, each a row of heading and content on a wide screen: what it's allowed to do, each with a lock or an open lock and in the same words as the app, never drawn as a warning, what it's told, the example as plain words with no markdown marks, and a note that someone wrote it and we haven't checked it. Everything from the server goes in as text, and its content security policy allows no other scripts. A mascot that's been removed or hidden says it isn't in the Gallery any more. A shared link's preview is the same for every mascot, `site/flock.png`, drawn from the birds by `pnpm run site:build`, because a preview can't run the page.

### The front page

`site/index.html`, laid out as in The public site and the phone page. The heading, "An AI browser that works on your behalf", and one line under it from the README's pitch: a flock for the jobs you repeat, and that Blueberry notices what you do and offers to take it over. Then six of the birds that come with it on one wire across the column, each at the start of its place with its name and what it does under it, as on the Flock page: two to a row on a phone, three in between. Then four plain rows on what it really does, each point on the left, and that it isn't out for download yet. Nothing on it claims more than the app does.

### Answering from the phone

What waits on Needs you can be answered through the user's own Telegram bot, reached from this computer by long polling, so it works only while Blueberry is open and no server of ours is involved. It's off until they connect it in Settings, under Phone.

- **When it sends:** when the Blueberry window isn't in front, or after a minute with no input. Whatever's waiting then goes once, and is checked again every 15 seconds. **Send even when I'm here** forces it, for filming and trying it out.
- **Approvals** use the same exact words as the card, with Allow and Don't allow as buttons, through the same `chat:decide` and its checks. Whichever side answers first settles it. The phone message then says what happened, with its buttons gone, and the row goes.
- **Questions:** a reply answers it, as if typed in the row. The filter that stops a question asking for a secret still applies.
- **Codes:** "Scout needs a code for linkedin.com. Reply with it." The reply goes straight to the tab, typed with real keys by code the model can't call. The job hears only that a code was entered and to look at the page, and the model never gets it: not in a tool result, the chat, steps or logs. Anything a page repeats back is taken out of what goes to the model, the field is emptied after submitting, and that tab gives no screenshots for an hour, as a picture can't be cleaned. With more than one request taking a reply, only replying to the right message counts. Nothing that looks like a code answers a question: an answer like that is typed at the computer.
- **A code is typed only** if the reply is plausible (4 to 12 letters or digits with an optional space or dash, with a digit or in capitals), the tab still exists, is still held for the user, is on the same host as when asked and hasn't been touched, and code in the page finds exactly one place for it: the field marked one-time-code, then one with an obvious name, then a row of one-character boxes, then the only field on a page with no password. Otherwise nothing is typed, the phone says why, and it waits at the computer with the tab still held. After typing it submits and lets go, as I'm done does. The user's message is deleted, and the phone says if it couldn't be.
- **Sign-ins and captchas** can't be done from the phone. The message says it's waiting at the computer, with no buttons. Passwords are never sent this way.
- **If Telegram can't be reached,** or the token is revoked, everything simply waits on this page and Settings says what's wrong. No job ever waits on Telegram.

Not built: a job carrying on with other work while it waits. One reply runs one step at a time through the agent, so a waiting job waits, while other jobs go on.

### Restoring tabs

Reopening brings back the open tabs, their order, the active tab, each tab's back and forward pages, the sidebar and chat panel, and the window's size. Only the active tab loads. The others show their saved title and favicon and load when first visited. Berry using one loads it too, behind the page you're on. Scroll position and form contents don't come back, because the state that holds them can hold posted passwords. Closing the last tab leaves nothing to restore, and tabs a chat or routine opened behind you don't come back unless you went to them. Settings can start fresh instead, which also stops saving the tabs.

### A page in trouble

When a page crashes, stops responding or can't load, its view hides and the chrome draws Berry in its Oops mood, what happened in plain words and a Reload button, centred on the page card. A page that can't load also shows its address, and its tab is titled with the host. A load that was stopped or became a download isn't trouble. Its tab shows a warning icon, and the rest of the window keeps working. A page that recovers from being stuck comes back by itself. Going anywhere else from that tab clears it too. Reload, the toolbar button and `⌘R` do the same thing, and a stuck page gets a new process. Berry's tools on that tab get an error saying so, within 10 seconds at most for a page stuck with no sign of it.

### Damaged saved data

A chats or history database that can't be read doesn't stop the app. The file is moved aside beside its old name, never deleted, and the app starts empty and says so once in a native dialog, with where the old file is.

### Claude

Settings > Claude lets Claude Code and Claude Desktop on this computer hand jobs to the flock over MCP. It's off by default, and the same plain rows as Phone.

- **The switch,** with what it does in one sentence, then **What Claude can see** in words, including what it never gets.
- **Once on:** one row for each app, with where its snippet goes and **Copy**, over the snippet in a `tray` block with the key shown as dots. Copy puts the real key on the clipboard from main, so the page never has it. **Revoke** makes a new key.
- **Recent calls:** a plain list split by `border`, newest first: the time in tabular figures, the app, the tool in words, and a short summary, in `warning` when a call was refused. It's memory only, and says so.
- **A job from an app** is an ordinary chat. Over its first message, "From Claude Code" in 12px `muted-foreground`, and the same on its Needs you row. An app can't allow anything: approvals wait for the user as always.

### Cloud

Settings > Cloud is redrawn in DESIGN.md. What's left here is how a chat chooses the cloud. Bringing a site along asks for Touch ID, or a plain confirm without it, and then opens the site in a cloud tab in front.

- **Choosing it:** on the new tab page, while the cloud is on or a runner has accepted, the composer's `+` opens a small menu with one item, **Do this in the cloud**, ticked in `accent-ink` while on. Nothing else sits in the composer, so the text box keeps its width. While it's on, Send wears a small cloud mark on its corner, with no label, and is named "Send to the cloud". With a linked runner that has accepted, the job goes there and keeps going with the Mac off. Without one, it goes to a cloud tab. The user never chooses between the two. With neither, there's no `+`, unless the composer has a page to add. That chat works in the cloud from then on, and has a small cloud mark in the chat list.
- **From ChatGPT or Claude:** a job that runs on the Mac is an ordinary chat with "From ChatGPT or Claude" over its first message, as one from Claude Code. Signing in there is a plain page on the server with email, password and **Sign in and connect**.
- **Words:** nothing the user sees says "runner". It's "in the cloud", and keeping going "with your Mac off".

### On the runner

A chat sent to the cloud runner is an ordinary chat in the list, with "In the cloud" over its first message in 12px `muted-foreground`, and its later messages go there too. One started or followed up on the phone page shows here the same way, within a few seconds, and either side can go on with it once nothing of it is going. A message sent here while the phone's job is still going says so and isn't sent. Its steps and reply show as they're written, a little behind, and its approvals are cards in the chat and in Needs you, answered only by the user, from this window or the phone page (see On the phone). Telegram isn't sent them, and Claude can't answer them.

- **Beside the chat,** while it runs and there's room, the same column as the working view: a cloud and **In the cloud**, one line in `muted-foreground` saying it keeps going with this computer off, the live view in a `tray` box with `border` and the `card` radius, locked like a cloud tab's, and what it's doing now. With no live view, as from a test browser, the box says so.
- **Handed to the user:** a sign-in or captcha unlocks the live view, the line says to do it there and press I'm done, and I'm done on the card gives the page back. There's no tab to go to. With no room beside the chat, the same view goes under the card, only while it waits.
- **Another account:** signed out, or signed in as someone else, a runner chat shows only what's saved, and a new message there says which account it's on. Nothing of it is answered or shown meanwhile, and it comes back when that account signs in.
- **Ask before acting** is never less than the default there, because nobody is watching: Never ask still asks before anything risky.
- **No answer** in 30 minutes stops the job, and the chat says so as its error. Stop in the composer stops it on the runner.

### Cloud tab

A page in the cloud browser opens as a tab behind the user, with a cloud icon and the page's title. The chrome draws it.

- **A strip on top:** the cloud icon, **In the cloud** and one line in `muted-foreground` saying what taking over does, with **Take over** on the right. Once taken, the line says it's yours and the button goes.
- **The page:** Browserbase's live view in a frame that takes no pointer until the user takes over, so nothing they do lands in the middle of a job. A local test browser shows pictures instead, and says it's pictures only once taken. The page's viewport follows the tab's size, as a tab of the window's own does, so either fills it.
- **Checking a sign-in:** a site opened from Signed in to is the user's from the start. The strip asks whether they're signed in to it there, with **Yes, I'm signed in** and **No, I'm signed out**, which only set its status. Nothing guesses for them.
- **Handed to the user:** when a job in the cloud asks for a sign-in, the strip says who needs them and that taking over is how to do it, and the toolbar's **I'm done** gives the page back, the same as a tab of the window's own.
- **Taking over** is the same as clicking in a tab of the window's own: the job can't reach it any more and is told why. Typing an address there counts too, and goes there in the cloud.
- **Ended:** when the session ends its tabs close. A tab left without a page shows Berry in its Oops mood and says so.

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
| Menus | System menu bar | In-window menu button, left of the system buttons in the top row, with the same menu |
| Corners | System rounded | Rounded on Windows 11, square on older versions |
| Reduced transparency | Reduce Transparency | Transparency effects off |

If Windows glass disappoints, use the solid fallback rather than a weaker imitation.

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
- Don't let Berry open modals, take focus, make sounds or speak about work the user didn't start, apart from suggestions on the new tab page. The composer on the desktop takes the keyboard only because the user pressed for it.
- Don't read page content unless the user asked.
- Don't send browsing data to third-party services for UI features such as favicons.
- Don't make any feature depend on Berry being visible.
- Don't add a settings slider for glass strength.
