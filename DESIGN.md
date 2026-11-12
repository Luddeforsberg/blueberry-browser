# Blueberry design

Blueberry is an AI browser that should feel like a good desktop app with a small flock of capable birds inside it. The direction is **Valley**. The chrome is plain and solid. All the colour lives in one place, a lake valley drawn in fine grain, where the birds live. A new tab opens onto the valley, and what the birds are doing shows in it.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

## 1. Principles

1. **The page comes first.** Web pages stay solid and get the space. The chrome stays quiet around them.
2. **One colleague at a time.** Berry comes first and is enough on its own. You can grow a flock of birds for jobs you repeat, but you always talk to one, and it's always clear which: the one perched on the box you type in. Each bird is drawn once in a window.
3. **Calm by default.** Nothing moves, glows or asks for attention without a reason. Nothing moves while you type.
4. **Trust you can see.** The UI always shows what a bird can see and what it is doing, and it asks before anything that matters.
5. **A normal browser first.** Tabs, navigation and bookmarks must be excellent with no account and no AI.
6. **Crafted and warm.** Warmth comes from the birds' voice, their character and the valley. It never becomes corporate or childish.
7. **Colour has one home.** The chrome is neutral, and ink is its only accent. Colour belongs to the valley, the birds, the sites' own icons, and a status when it means something.
8. **Words carry every state.** The valley and the birds mirror what's going on. They are never the only way to know it: a line of words says the same, and the sidebar stays the record.

### What we reject

- Glass, blur, tints and gradients in the chrome. Purple gradients, sparkle icons and a lone box on an empty field.
- An outline or a shadow round the web page.
- Spiky or angular mountains, an outline or rim round a bird, and a dusty, washed-out palette. The valley is vivid.
- Humanoid companions, or a team you have to manage. The flock is birds you made yourself, and none appears until you ask.
- Promo cards and upsells on the new tab. The ideas there only link to real features, and suggestions only come from what the user really did.
- Stacks of identical rounded, shadowed cards with an avatar, a title, pill chips and pill buttons. Where a page lists birds, they stand on something real: a wire, a divider or the valley's banks.
- Points, streaks, unlocks or anything else that turns work into a game.
- Bounce in the chrome, and decorative loops that run when no work is happening.
- A bird guilt-tripping, fishing for attention, or claiming feelings or a life outside the browser.
- Jokes near permissions, payments, sent messages, data or real failures.
- Reading a page unless the user asked.

## 2. Layout modes

**Vertical is the default.** Horizontal is a setting that applies without a restart. Both modes arrange the same components, which take a layout setting rather than being built twice.

| Region | Vertical (default) | Horizontal |
|---|---|---|
| Tabs | Left sidebar (see below) | Top row |
| Address field and navigation | Top bar above the page | Row below the tabs |
| Bookmarks | Tiles at the top of the sidebar | A bar under the address row |
| Chat panel | Right, pushes the page | Same |
| Web page | Fills everything the chrome leaves | Same |

**The chrome is one surface.** The sidebar, the top bar and the chat panel are the same solid `background`, with nothing between them: no line, no gap and no change of tone. The page is whatever they leave.

**The page** has one rounded corner of 16px, at its top left, where it meets the sidebar and the top bar. Every other corner is square. It has no outline and no shadow, and it meets the chrome by tone alone. With the sidebar collapsed, and in the horizontal layout, the page has no rounded corner of its own.

Sizes (*to tune*):

| Item | Value |
|---|---|
| Sidebar | 280px default, resizable 200–360px, collapses fully |
| Chat panel | 400px default, resizable 320–480px |
| Top bar | 48px |
| Address field | 32px tall, a full pill |
| Bookmarks bar (horizontal only) | 36px |
| Sidebar row | 34px, a full pill |
| Horizontal tab row | 40px |
| Minimum window | 900×600 |
| Minimum page width | 480px |

- **When space runs out:** the sidebar collapses first, then the chat panel closes. The page keeps its minimum width.
- **A crowded tab row:** tabs share the row evenly, and the active one gets room for its close button and the bird on top, so its title is never cut shorter than the others'. Below about 72px a tab shows only its icon, and its close button on hover or while active.
- **Collapsed sidebar:** it returns when the pointer reaches the window's left edge. It slides in over the page and slides away when the pointer leaves, so it is an overlay view (see below). Collapsed, the top bar shows the button that brings it back.
- **Sidebar contents, top to bottom:** window controls on a Mac, then the collapse button, search and downloads on one row, with **More** (⋯) at its end off a Mac, which opens the app's menu, then the pinned tiles, then New tab, Needs you, Routines and Flock, then chats, then tabs. Settings stays at the bottom, and the account lives in it. Downloads sit in that top row in both layouts' sidebars and nowhere else, so they are in one place on every screen. With no sidebar they sit at the end of the address row.
- **Sidebar rows:** every row starts with a 20px slot, so all their text starts at one straight edge. Flock's icon is two birds in flight, and a new tab's is a hill with the sun, drawn as the mocks draw them. A chat's slot is empty, and a chat row has no time on it. A chat with a bird other than Berry shows that bird at 16px straight after its title, and a chat whose job is running shows the berry at the row's end. The active tab's row has the bird at 16px in its trailing slot, where its × shows on hover. With Hide Berry on, none of them shows.
- **One raised row:** the open tab is the only row on `selected`, with a hairline shadow. When Needs you, Routines, Flock or Settings is open, its tab under Tabs is the raised one and its own row only turns `foreground`. A chat is never under Tabs, only its row under Chats, raised while it's open. While the chat panel shows a chat beside a page, that chat's row is semibold and not raised, which is the only semibold row. While its tab is open, hovering a chat's row also shows a close ×, which closes the tab as any tab's does and keeps the chat. Collapsing Chats still leaves the open chat's row. The horizontal tab row has no chats list, so chats stay in it as tabs.
- **A job's tabs** sit under their chat, indented, at 13px with their favicon. See Main chat.
- **Buttons on the sidebar and chat panel** sit on the top bar's line, on the docked sidebar, the floating one and the panel alike, so every button along the top shares one line.
- **Pinned tiles:** pinned sites and bookmarks as each site's own icon on a 28px tile with an 8px radius, in rows of four, with nothing round them. A site keeps the icon its page named when it was saved, and one with no icon gets a tile in a colour picked from its name, with its first letter in white. An IP address or a local page gets a globe. Pinned sites come first, and a site saved both ways shows once, as a pin. In a short window the first row shows and a last tile says how many more, such as "+5", which opens the rest. With nothing saved, the sidebar shows nothing there, and the bookmarks bar says "Pin or bookmark a page to keep it here." in muted text.
- **Address field:** a tonal pill with no edge, `address-field` at rest, a little darker than the chrome (`rgba(24,24,27,.06)` light, `rgba(255,255,255,.07)` dark). It turns `surface` with the focus ring only while it's being typed in. On a web page it has the lock, the site in `foreground` and the rest of the address in `muted-foreground`. Empty, it says "Go to an address". On the new tab it takes the scene's tone: see The valley.
- **Bookmark star:** outlined when unsaved, filled light yellow using `bookmark` when the current page is saved, with no selected or hover background behind the saved star.
- **Pin button:** beside the star, and usable on the same pages. Neither shows on our own pages, which can't be saved. A pinned page fills the pin in ink, with nothing behind it, like the saved star. The File menu has Pin This Page, and right-clicking a saved site offers Unpin and Remove Bookmark, whichever apply.
- **The chat toggle** sits at the right end of the address row. Open, it has the open-toggle fill. With the panel open, **New chat** sits in the top bar at the panel's left content edge.
- **Spaces and folders:** not part of this design yet.

### View stack

From bottom to top:

1. **Chrome view:** one window-sized renderer that draws all our UI.
2. **Tab views:** one solid view per tab. Only the active tab is visible.
3. **Overlay views:** small views for anything that floats over a page, such as address suggestions, menus and the revealed sidebar. The bird working on a page isn't one, because a view takes clicks: see Over a web page.

Rules:

- **One layout owner** in the main process calculates every region. Nothing else hard-codes a size.
- **Anything over a page needs an overlay view.** The chrome view is underneath tab views and cannot draw over them. The one exception is the bird on the page.
- **Overlay views are only as large as what they show.** Assume a transparent area blocks clicks. Rounded cut-outs on views also still capture clicks.
- **The page's rounded corner** is the tab view's own corner, so the chrome shows through it. Nothing is drawn over the page to make it.
- **Internal pages** (new tab, main chat, Needs you, Routines, Flock, Gallery, Downloads, History, Settings) open as tabs drawn by the chrome renderer, with no tab view. Their content sits on `canvas` in exactly the page's place and shape, so the sidebar stays visibly separate from the page.

## 3. Surfaces

Everything is solid. There is no glass, blur or native window material anywhere in the window, so colour and contrast never depend on the desktop behind it.

| Surface | Used for | Token |
|---|---|---|
| Chrome | Sidebar, top bar, chat panel | `background` |
| Paper | Internal pages, and the place a web page fills | `canvas` |
| Raised | The composer, inputs, lists that open, anything over the valley | `surface` |
| Tray | The tray under the composer, code blocks, the exact words of an approval | `tray` |
| The valley | The new tab, and the right side of the main chat while a job works there | See The valley |

- **Words never sit on the valley without help.** Anything with words or controls over it is a solid `surface`, or sits on the top bar's scrim.
- **Over a web page,** anything that floats is an overlay view on solid `surface` with the floating shadow, so a page can't change how it reads.
- **The window** is opaque `background`. Nothing uses `backdrop-filter`, `vibrancy` or `backgroundMaterial`. The composer of the bird on the desktop is the one exception, because it is a window of its own outside ours: see On your desktop.

## 4. Tokens

Components use tokens only, never raw colours. Keep the existing names in `index.css` and `tokens.css`, with these values, and add the new ones. `frame` and `glass-tint` are gone.

### 70/20/10

For our own chrome (web pages and the valley do not count), this is a guideline and not a measurement:

- **70, base:** `background`, `canvas` and `surface`.
- **20, grey:** `muted`, `tray`, `border` and `outline`.
- **10, ink:** `primary` and `foreground` on the one decision, the focus ring and what's selected. Nothing else in the chrome has colour, except the birds, a site's own icon, and status colours when they mean something.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#e9e9ec` | `#1f1f21` | The chrome: sidebar, top bar, chat panel |
| `canvas` | `#ffffff` | `#19191b` | Internal pages, the place a web page fills |
| `surface` | `#ffffff` | `#2f2f34` | Composer, inputs, raised content, anything over the valley |
| `tray` | `#f2f2f5` | `#252529` | The tray under the composer, code blocks, exact words |
| `card` | `#f4f4f7` | `#26262a` | Raised content on `canvas`, the job line |
| `selected` | `#ffffff` | `#39393f` | The raised row in the sidebar, selected segments |
| `muted` | `#f1f1f4` | `#2f2f34` | The user's bubble, quiet fills on `canvas` |
| `hover` | `foreground` at 7% | `foreground` at 9% | Hover, on any surface |
| `pressed` | `#d9d9df` | `#48484f` | Pressed, and an open button or toggle |
| `border` | `#e4e4ea` | `#3a3a40` | Separators |
| `outline` | `#bbbbbf` | `#6a6a70` | The edge of an outlined control |
| `control-fill` | `rgba(24,24,27,.06)` | `foreground` at 8% | Controls inside a `surface` with no outline, such as the box's `+`, and in dark mode every control there, in place of an outline |
| `address-field` | `rgba(24,24,27,.06)` | `rgba(255,255,255,.07)` | The address field at rest, a little darker than the chrome |
| `site-1` to `site-8` | Red, orange, amber, green, teal, blue, indigo, violet | The same | A site with no icon: its letter in white on one of these, picked from its name |
| `foreground` | `#18181a` | `#f2f2f3` | Main text, ink |
| `muted-foreground` | `#55555b` | `#a6a6ac` | Secondary text |
| `primary` | `#18181a` | `#f2f2f3` | The filled button, Stop, send once there's something to send |
| `primary-foreground` | `#ffffff` | `#18181a` | Text on `primary` |
| `accent-ink` | `#18181a` | `#f2f2f3` | Links, focus rings, ticks and selected marks. It is ink: the interface has no accent colour |
| `berry-blue` | `#3558dc` | `#8fa6ff` | The reading ring, and the label that says a bird is being answered. Never a button |
| `attention` | `#fff3d6` | `#3d3210` | The surface of a line that needs you |
| `bookmark` | `#facc15` | `#fde047` | Saved page's filled bookmark star |
| `success` | `#17653c` | `#6fcf97` | Status |
| `warning` | `#744b00` | `#e0b050` | Status |
| `destructive` | `#ab241c` | `#f59e96` | Status, destructive actions, the recording |

Measured contrast (WCAG), to be measured again on real windows:

| Text | Light | Dark |
|---|---|---|
| `foreground` on `background` | 14.6:1 | 14.7:1 |
| `muted-foreground` on `background` | 6.1:1 | 6.8:1 |
| `muted-foreground` on `canvas` | 7.4:1 | 7.2:1 |
| `muted-foreground` on `tray` and on dark `surface` | 6.6:1 | 5.5:1 |
| `muted-foreground` on `selected` | 7.4:1 | 4.7:1 |
| `foreground` on `attention` | 16.1:1 | 11.3:1 |
| `primary-foreground` on `primary` | 17.7:1 | 15.8:1 |
| `berry-blue` on `canvas`, and on dark `surface` | 5.9:1 | 5.7:1 |

- **The dark chrome is neutral,** because blue-tinted dark mode is rejected. Only the valley and the birds keep their colour there.
- **Outlines:** in light mode, controls that sit in a row share one treatment, an `outline` edge. `outline` is 1.9:1 on white, so it never carries meaning alone: every outlined control has a word or an icon in `foreground`. In dark mode the same controls inside a `surface` are filled with `control-fill` and have no edge, so the box reads as one surface with a few quiet buttons, not a set of light rings.

The birds have their own tokens and never use the interface's. They are the same in light and dark, because they have to work on the valley at any hour:

| Token | Berry | Use |
|---|---|---|
| `berry-ink` | `#3558dc` | The body |
| `berry-nape` | `#6f8ef0` | The body's lit side, upper left |
| `berry-shade` | `#16277f` | The body's far side, lower right |
| `berry-wing` | `#1b309a` | The wing |
| `berry-crest` | `#12227a`, `#2c44b8` at night and in dark mode | The crest and the tail |
| `berry-beak` | `#ff9a2e`, `#e07a1f` for the lower half | The beak |
| `berry-legs` | `#d9731c` | Legs and feet |
| `berry-eye` | `#ffffff` | The eye |
| `berry-pupil` | `#10142e` | The pupil, and the soft shadow under a bird's feet |
| `berry-note` | `#fffaf0`, edge `#c9b89a` | The folded note a bird brings home |
| `berry-fruit-mid` | `#3558dc` | The berry, the status mark for work going on |
| `berry-fruit-dark` | `#1f37a6` | The berry's shade |
| `berry-fruit-bloom` | `#8fa9f8` | The berry's bloom, upper left |

`berry-gear` and `berry-gear-shade` colour a mascot's accessory, with `berry-pupil` as its edge.

The flock's presets replace `berry-ink`, `nape`, `shade`, `wing`, `crest`, `beak`, `gear` and `gear-shade` on that mascot's drawing, through `data-mascot`. The eye, the legs and the note never change. All values are *to tune* on the valley's four lights:

| Preset | Body | Lit side | Wing | Crest and tail | Beak | Gear | Body on white |
|---|---|---|---|---|---|---|---|
| Berry | `#3558dc` | `#6f8ef0` | `#1b309a` | `#12227a` | `#ff9a2e` | None | 5.9:1 |
| Robin | `#f08a3c` | `#ffc08a` | `#b9501f` | `#7a2e14` | `#ffd65a` | `#1f8f86` | 2.5:1 |
| Canary | `#f2b632` | `#ffe08a` | `#c08a12` | `#7a5606` | `#e8662a` | `#c8314f` | 1.8:1 |
| Parakeet | `#3aa465` | `#86d49a` | `#1f7343` | `#123f25` | `#ff9a2e` | `#d9542b` | 3.1:1 |
| Flamingo | `#ec6a9d` | `#ffc0d6` | `#c23f78` | `#7d2149` | `#ff9a2e` | `#1b8fa3` | 3.0:1 |
| Kingfisher | `#22a6c9` | `#8fdcf0` | `#127a99` | `#0b4c61` | `#f58b3c` | `#e8a900` | 2.9:1 |

Several bodies are under 3:1 on white, so the darker wing, crest and tail carry the shape, and nothing may rely on a bird alone: its name is always beside it, and moods have text labels.

### Spacing, radius, elevation

- **Spacing:** 4, 8, 12, 16, 24, 32, 48px.
- **Radius:** 8px for tiles and small controls, 12px for blocks and inputs on a page, 16px for the page's one corner, 18px for cards, 24px for lists that open and the tray's lower corners, 28px for the composer, and full for buttons, rows, pills and the address field.
- **Elevation:** almost none. The page has no shadow. The raised sidebar row has a hairline shadow. Over the valley, the composer and its tray share one soft shadow underneath, so the two read as one object, and a list that opens gets the same. Menus and anything in an overlay view get the floating shadow. A bird standing on something leaves a small soft `berry-pupil` shadow under its feet.
- **Recording ring:** while the user is showing Berry something, a 3px `destructive` ring goes round the page, on every tab including our own pages. It comes before the reading ring.
- **Reading ring:** while a bird is reading the open page, because a message was just sent with the page attached, a 3px `berry-blue` ring goes round the page. It fades in and out with the layout duration, and also shows while a bird is using the tab in a running reply. Nothing else marks it from inside the page, because the bird does that now. With Show the bird on pages off, a matching inset glow pulses slowly inside the page instead, added as a style so it never takes a click. In the tab list, that tab's title shimmers beside the working berry.
- **How a ring is drawn:** the page has no gutter, so while a ring shows, the layout owner insets the tab view by the ring's width on every side and the chrome draws the ring's colour in the gap. That keeps it in the chrome, where no page can reach or cover it. On our own pages it's an inset line. The working view's picture wears the same ring.

## 5. Typography

One neutral grotesk, **Host Grotesk**, bundled with the app as a variable font and never downloaded. A small monospace, **IBM Plex Mono**, is bundled for keyboard shortcuts and the exact words of an approval, and nothing else. Both fall back to the system font: SF Pro on macOS and Segoe UI Variable on Windows.

| Size | Weight | Used for |
|---|---|---|
| 11px | Regular | Captions, the smallest text allowed |
| 12px | Regular | Secondary text, exact words in monospace |
| 13px | Regular | Bookmarks bar, card text, a job's tabs, the tray |
| 14px | Regular, semibold | Sidebar, tabs, address field, settings, steps |
| 16px | Regular | Chat and the composer |
| 20px | Semibold | Page titles |
| 34px | Semibold, tight tracking | Onboarding, and the heading of a page on the public site, 48px there on a wide screen |

- The public site's lede is 20px regular on a wide screen, and the phone page's headings are 28px. Nothing else in the chrome uses them.
- Use regular and semibold only. Regular is weight 400 in light mode and 330 in dark mode (*to tune*), because light text on dark reads heavier. Semibold is 600 in both.
- Use tabular figures wherever numbers line up, such as times and counts.
- Render chat markdown with our own type styles.

## 6. Motion

The chrome is crisp: quick to start, gently settling, with no bounce.

| Kind | Duration |
|---|---|
| Hover, press, small feedback | about 100ms |
| Panels and layout changes | about 240ms |
| Longest allowed in the chrome | about 320ms |
| A bird's flight | 600–900ms, by distance |

- **Easing:** start with `cubic-bezier(.32, .72, 0, 1)` (*to tune*).
- **Interruptible:** every transition can reverse from wherever it is.
- **Web pages:** never animate page content, only the chrome around it and the bird working on the page.
- **Bounce and squash:** reserved for the birds.
- **Loops:** only while real work is happening, stopping as soon as it ends.
- **Nothing moves while you type.** While a composer has the keyboard and has text in it, no bird flies or changes place and the valley doesn't change. A change that's due plays once the box has been idle for about 5 seconds, or when the page next opens.
- **One flight at a time** in a window. Others wait their turn or arrive with a quick fade.
- **The valley is still.** It's painted once for its light and size. Water, clouds and grass never loop.
- **Thinking:** a soft shimmer sweeps across the word while a reply is on its way. Reduced motion leaves the word still.
- **Moving tab views:** if animating tab view bounds is not smooth, animate the chrome and let the page snap into place at the end. A ring's inset snaps.
- **Reduced motion:** follow `systemPreferences.getAnimationSettings().prefersReducedMotion` and the CSS media query. Movement becomes short fades or instant changes, and a bird is simply in its new place.

## 7. Component states

Every interactive component defines these, shown in light and dark in the component gallery:

| State | Treatment |
|---|---|
| Default | Neutral, with no colour unless it is the primary action |
| Hover | `hover` background |
| Pressed | `pressed`, in about 100ms |
| Open | A button or toggle that is open or on has the `pressed` fill |
| Focused | A visible 2px `accent-ink` ring, never removed. On an outlined control the ring takes the outline's place, so the control keeps its size. The composer is the exception: the caret marks focus, and its edge only firms up while it's answering a bird's question |
| Selected | The one raised `selected` row in the sidebar, or a `muted` row on `canvas`. The text stays regular, so rows don't shift |
| Disabled | Reduced emphasis, with a reason where possible, and based on real state. A primary button stays a faded primary, never grey |
| Loading | Only while work is really happening |
| Error | Status colour plus an icon or text, with a way forward |

Tabs also show: page loading, audio playing, crashed, and a bird working in this tab.

- **Buttons have three roles:** primary, filled with `primary`, for the one decision; outline beside it; and quiet text for everything else. The only other button is the recording's red Stop, where the colour is the status.
- **Send and Stop:** send is an outline at rest and fills with `primary` once there is something to send. While the job is set to go to the cloud it's `berry-blue` with a cloud icon instead of the arrow, still named "Send to the cloud". While a job runs it becomes Stop, a filled square, and that is the only Stop on the screen.
- **The box's row of controls:** `+` on the left, a 36 to 40px circle filled with `control-fill` and no outline, which opens a menu. Then, while the job goes to the cloud, a chip: a cloud icon, "In the cloud" and a small × that turns it off, tinted with `berry-blue` at 10% in light and 20% in dark, with `berry-blue` text. On the right, beside Send, who it goes to as quiet text, the bird's name and a chevron in `muted-foreground` at 13px, with no pill or fill in light or dark, which opens the bird picker. Nothing in the row has an outline except Send at rest. The keyboard goes `+`, the chip's ×, who it goes to, then Send.
- **The `+` menu:** a `surface` card with the `list` radius and the `float` shadow, under `+`, with 36px rows. It's meant to hold **Add an open tab ›** and **Add a recent page ›**, a divider, then **Do this in the cloud** with a switch and one muted line under it, "Keeps going with your Mac off" for a runner or "In a browser in the cloud, while this app is open" for a cloud tab. Only what works shows: the cloud item only where the cloud is set up for this bird, and the two Add items only once a new tab's message can carry a page, which it can't yet. With nothing it can do, it says in one muted line that adding an open tab or a recent page comes in a later version. The arrow keys move through it, and Escape closes it and goes back to `+`.
- **Favicons:** a page with no icon shows the first letter of its site in white on a colour picked from its name, one of `site-1` to `site-8`, the same tile as a pinned site's, so sites still look different. An IP address or a local page has a globe. A dark icon on a dark surface gets a hairline edge.
- **Scrollbars:** a thin `border` thumb, shown only while the pointer is over what scrolls or it's scrolling.

## 8. Berry and the flock

Berry is a small round bird the colour of a blueberry, with the fruit's crown as its crest. Berry is "it", and it refers to itself as "I".

### Character

- **Bird:** a round body like the fruit, in saturated blue, lit from the upper left. A darker wing low on its side, a short darker tail, and a crest of three points on top, which is the blueberry's crown. A small orange beak in two tones, orange legs, and one white eye with a big dark pupil and a catchlight, which carries most of the expression. It's drawn in profile, facing right unless the place calls for left. Berry only faces you, with two eyes, when it is asking for a decision.
- **No outline.** Shape comes from colour: the wing, crest and tail are darker steps of the body. At night and in dark mode the crest and tail lighten a step so they don't vanish.
- **Grain:** at 32px and up, in the valley and on a composer, the body carries the valley's fine grain, following the light. Smaller, and on a web page, it's flat colour.
- **The berry:** a small round blueberry with its bloom lit from the upper left. On its own it is the status mark for work in progress, always beside words: on the step a bird is on, on a running chat's row, at the start of a job line. It is never a blue circle with a star.
- **The note:** a bird that has finished a job comes home with a small folded note in its beak. That is the only thing a bird carries.
- **Implementation:** one SVG drawing per mood behind a `<Mascot mood size look>` interface, animated with CSS, so artwork can be replaced without touching screens. Each mood should be recognisable from its outline. The illustrator's drawings replace the first ones there: see `docs/illustration-brief.md`.

### The flock's look

Every mascot is this same drawing with one preset and one accessory: nothing, a crown, a cap, glasses, headphones or a bow. The crest belongs to the bird and every one has it. The accessory belongs to the head, so it moves with it in every mood, and has a front view for Asking. Shapes are big and edged, so colour and accessory tell mascots apart at 16px, where the mood can't. There is no colour picker, because every preset has to work on the valley's four lights and on both modes' surfaces. Everything said here about Berry's character, voice and moods goes for them too.

### Sizes

| Size | Drawing |
|---|---|
| 16–20px | Simplified: body, crest, beak and one larger eye, in flat colour. This shows identity only. |
| 24–31px | The same simplified drawing, with the wing. 24px is the smallest size that may show a mood, through head tilt and eye alone. |
| 32px and up | Full drawing, with legs and grain. |

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
| At rest | Present, nothing happening | Perched, blinks now and then |
| Sitting | On a tab or the edge of a card | Legs hanging over the edge and swinging |
| Curious | Looking at something you asked about, or at what you're typing | Leans in, head cocked, eye on it |
| Thinking | Working something out | Head back, eye up, crest twitching |
| Fetching | Working out on the web | In flight, wings beating |
| Asking | Needs your decision | Faces you square on, two eyes, head a little to one side |
| Delivered | Finished | Chest out, the folded note in its beak, heavy-lidded and a bit smug |
| Oops | Something went wrong | Slumped, crest drooping, a feather falls |
| Off duty | Nothing to do for a long time | Fluffed up asleep, crest flat |

### When you click it

Clicking a bird anywhere in the chrome gets a small reaction: a hop, a curious look, a shake of the crest or a ruffle that loses a feather, in turn. Five clicks in a couple of seconds and it turns its back on you for a moment and ignores you. Only a bird at rest changes pose. One sitting on a tab or already curious hops and ruffles, and one with a status mood gives a small squash, so a mood that means something stays on screen and its label never changes. It says nothing and changes nothing, and any button it's on still takes the click. A bird resting in the valley is a button of its own, so pressing it does what its label says. Reduced motion only gets the curious look, and Keep Berry still gets nothing. The bird working on a web page doesn't react, because nothing there can be clicked.

### Where a bird appears

**A bird is drawn once in a window.** The chosen bird is in exactly one of these places, and flies between them:

| Place | What it does |
|---|---|
| On the composer | The chosen bird perches on the top edge of the box you'd type in, towards its right end, so it covers no text or control: the new tab's box, the main chat's composer, the chat panel's composer. It is the picture of who you're talking to, so the picker beside it shows the name only |
| In the valley | The rest of the flock, on the banks, and wherever their work has taken them. See The valley |
| In the working view | While it works in tabs behind the main chat, it's in the picture, and off the composer. See The working view |
| Over a web page | Only while working in a page the user can see, drawn in the page. See Over a web page |
| Browsing | With no composer on screen, small. In the sidebar, 16px in the active tab's trailing slot, where its × shows on hover. On the horizontal tab row, sitting on the active tab's lower edge with its legs hanging, in a slot the tab keeps free between its title and its close button, so it covers no text. On a narrow row of tabs, the active one stays wide enough for the slot |

Elsewhere a bird's picture marks whose something is, never a second copy of the one you're talking to:

| Place | What it does |
|---|---|
| Onboarding | Large, guides setup |
| A reply in a chat | At 30px beside each reply, hanging outside the column in the main chat, and Asking beside a request |
| Sidebar | At 16px after the title of a chat with a bird other than Berry |
| Routines | Flies off when a routine runs and returns with the result |
| Settings | Its own section |
| Flock | Its own page, standing on a wire with the flock, and standing on the line over what it remembers |
| Gallery | Standing on the line under each row, Asking on the review screen, Delivered once added |
| Needs you | Asking at 24px on each row, and off duty when nothing's waiting |
| Show Berry how | Curious in the toolbar while it watches, and standing on the line over its notes |
| On your desktop | Only if it's turned on, tucked behind any edge of the screen while you're in other apps. See On your desktop |

### Where a bird goes

A bird belongs to real parts of the interface, so it only ever sits in the places listed above. It never wanders on its own. It flies when something real moves it: you chose it, it started or finished a job, or the active tab changed and that takes it somewhere new. That is at most once every 15 seconds: quicker changes move it with a quick fade. Web pages sit above the chrome, so a flight towards a web page passes behind it.

### When a bird may interrupt

A bird only speaks about work the user started: a finished task, a routine result, or something it can't go on without. Everything waiting is on one page, Needs you, so the flock can work on while the user carries on with their day. Suggestions are the one exception to staying quiet, and they never interrupt: they only appear on the new tab page, in the tray under the box, where the user is already choosing what to do next. Nothing about them moves, asks or waits. A bird does not read a page unless asked. Sending a chat message while the page is attached counts as asking.

| Level | Behaviour |
|---|---|
| Mood change | Nothing else moves or appears |
| A place in the valley | A bird's place on the new tab shows what its work is doing, with a slip of words beside it. It changes when the page opens or the box is idle, never while you type |
| Count on Needs you | Anything waiting, as a number in an ink pill on the sidebar row, or words in the toolbar with no sidebar. Answering is what clears it, not looking |
| Asking in the chat | Only when a bird needs a decision to continue, and the same item is on Needs you. Everywhere, this state is called **Needs you** |
| Silent system notification | Something new is waiting, or a routine has news, and the app isn't in front |
| Message on the user's phone | Something is waiting and they're away, only if they connected a bot. See Needs you |
| Bird on the desktop | A mood, and one short line beside it, only if it's turned on. It replaces the notification for Needs you. See On your desktop |

A bird never opens a modal, takes keyboard focus or makes a sound. A notification never comes during fullscreen or while a tab plays sound, and it says who and what kind of thing it is, never the question, the site or anything typed. A phone message does say those, because it's how the user answers, and Settings says Telegram can read it. Anything waiting holds until the user is done.

### Reduced motion

Poses switch with a quick fade, with no flying or hopping. Nothing relies on seeing the animation.

### Turning it off

Available from Settings and by right-clicking a perched bird:

- **Still:** keeps the birds, stops all animation and flight. They move between places with a quick fade.
- **Hide Berry:** removes the birds everywhere, replacing them with a plain icon and neutral copy. The valley stays, as scenery, and every slip of words stays where it is.

Every feature keeps working either way, and turning it off never prompts the user to reconsider.

## 9. The valley

One place: a lake in a valley between soft, rolling ridges, with a large meadow bank at the near left and a small one at the near right. It is the same place every time. Only the light changes, with the time of day. It is drawn in fine stipple grain in full colour, and it is vivid.

It appears in two places and nowhere else: filling the new tab, and on the right of the main chat while a bird works in tabs there. A web page never gets it.

### Composition

Everything is placed around the box you type in, so the art is quietest where you type:

- **The sky** takes the upper part. One bright thing sits in its upper left, away from the perched bird: a cloud by day and at dawn, the sun with a glow at dusk, the moon with a soft halo at night. Stars at night are few and loosely clustered, and none sit near the box or under the top bar.
- **Five ridges** pass behind one another across the middle, rising towards both sides by different amounts so they cross. They are lit from the upper left: faces turned to the light are paler and faces turned away are deeper. Mist gathers at each ridge's foot, so the far ones fade into the sky. No spikes and no angles.
- **A band of pale air** lies across the scene, brightest at the top edge of the box and behind the whole perched bird, so the bird stands against light and the box's edge is clear in every light.
- **The lake** fills the middle below the ridges and mirrors them, darker towards you, with a few soft streaks of light.
- **The banks** are the near corners: a large one at the left that leads the eye up towards the box, a small one at the right. They are where the flock rests, and they stay inside the frame at every window size.
- **One grain** on every shape, fine, following the light.

### The four lights

The light is chosen by the clock when the page opens, and never changes while it's on screen (*hours to tune*): dawn from 05:00, day from 08:00, dusk from 17:30, night from 20:30. It follows the clock, and the chrome follows the system's light or dark setting, so any light can meet either mode.

| | Dawn | Day | Dusk | Night |
|---|---|---|---|---|
| Sky, top to horizon | `#3a62b6` to `#ffe9cf` | `#1a46a6` to `#e1edfa` | `#1b1d6a` to `#ffb06e` | `#03061a` to `#27418c` |
| Ridges, far to near | `#bab8e2` to `#535ea8` | `#a7c4ef` to `#355fb3` | `#865ca4` to `#282466` | `#2a3779` to `#0f163e` |
| Banks, shade to light | `#183f2e` to `#e2dcae` | `#174a28` to `#d2e88e` | `#0b1719` to `#b08458` | `#020c07` to `#20573a` |
| Water | `#4a5fae` | `#2a5fb8` | `#2a246e` | `#0a1440` |
| Pale air | `#fbe8e0` | `#e8f1fb` | `#f6b8b0` | `#3a4f9e` |
| Bright thing | A pink-lit cloud | A white cloud | The sun, well clear of the ridges | A dim moon |
| `scene-scrim` | `#1e3478` | `#102c70` | `#141450` | `#04071c` |
| `scene-field` | `#3e589c` | `#2c4a92` | `#342e78` | `#1e244c` |

### The top bar over the valley

On the new tab the valley runs up behind the top bar. The bar's part over the page sits on a scrim of `scene-scrim`, solid at the top and gone 104px down, so its white icons and the window buttons read in every light. Everything on it is white, and a button that can't be used now is white at 45%. The address field there is solid `scene-field`, with its placeholder in white at 80%: 5.0:1 at dawn, 6.0:1 by day, 8.0:1 at dusk and 10.0:1 at night. In the horizontal layout the tab row stays `background`, and the address row and bookmarks bar sit on the scrim.

### What's drawn on it

Only these, all on solid `surface` when they hold words:

- **The composer and its tray.** See New tab.
- **The flock,** as `<Mascot>` elements standing on the banks, the box, the cloud or a ridge, so each can be pressed, moves with the usual moods, and has a label. They are not painted into the picture.
- **Slips:** a small `surface` label beside a bird or holding its place, in the words of a job's status. See New tab.
- **Places on the shore,** later: see Routines on the shore under New tab.

### How it's made

The valley is one component, `<Valley light>`, so its artwork can be replaced without touching screens, like the mascot. It takes the light and the box it's composed around.

- **For now it's painted in code,** by the painter this design was mocked with: every pixel's colour on its own, at the screen's own resolution, with the dither and grain in cells 2 CSS pixels wide. The illustrator's layers replace it later with no change to any screen: see `docs/illustration-brief.md`.
- **It never blocks typing.** The scene's sky colour shows at once, and the painting fades in when it's ready. It's painted off the main thread, once for a light and size, and kept. Resizing stretches the old picture until the new one is ready.
- **It doesn't scroll or move.** It is still.
- **Hide Berry** keeps the valley and removes the birds. There is no setting to turn the valley off yet.

## 10. Key screens

This redesign has redrawn the new tab, the main chat, the working view and the chat panel. The other screens below are carried over: their behaviour stands as written, and their look follows sections 1 to 9. Where one of them still names something from the old look, the foundations win, and the screen gets its own pass here before it's rebuilt. The composer of the bird on the desktop keeps its native material until then.

### Onboarding

Short, skippable steps: meet Berry, choose layout and appearance, bring in history, and what Berry can and can't see, which also says Berry needs an AI key to answer. No account is requested.

**Bringing in history** is the third of four, with no card: Berry, a question, the browsers found to choose from if there's more than one, and plain lines saying what happens. Only addresses, page titles and visit times from the last 90 days come across, from every profile of that browser, and never passwords or cookies. It stays on this computer, apart from the summary Suggestions sends, and the lines say exactly what that is. **Bring it in** or **Skip**. It then says how many visits came across, or that it couldn't read them, and a failure can be tried again or skipped. If no browser is found the step isn't there and isn't counted, which is what a Safari user gets, because reading Safari needs Full Disk Access. Finishing lands on the new tab, where the ideas under the box come from what came across.

### New tab

The valley fills the page and runs up behind the top bar. In it, a little above the middle, is the box you type in, 680px wide, with the chosen bird perched on its top edge towards the right. This is where every job starts, so the box is what you see first. The chat panel doesn't open here, because this page has its own composer. It returns on the next page if it was open.

**The box** is the one composer, tall, on solid `surface` with a 28px radius:

- **The placeholder names the bird:** "Ask Berry or search", and "Ask Tova or search" once Tova is chosen. "Or search" is true because the bird searches the web when the question needs it. A plain engine search is still the address field's job.
- **Its controls,** in one row under the text, as Component states sets out: `+` and its menu, the In the cloud chip while it's on, then who it goes to as quiet text beside Send. The shared composer has this row as an option, so the main chat and the chat panel can take it up later. Until they do, their row is the bird picker as a pill, `+` where there's a page to bring back, and Send.
- **Pressing the perched bird** opens the bird picker too, a shortcut for the name beside Send: it has a pointer cursor, its name as a tooltip, and an accessible name, and stays out of the keyboard's way, since the name beside Send is there.
- **The perched bird** is drawn inside the composer's wrapper, so the two move as one. It looks towards the caret while you type, without moving from its place, and flies off when you send. With Keep Berry still it only stands there.

`Enter` opens anything that looks like an address and asks Berry about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. Searching is the address bar's job.

**The tray** is attached under the box: 8px narrower than it, tucked under its lower edge, on `tray`, with 24px lower corners. The box and the tray share one shadow, so they read as one object. It holds one line and two quiet buttons:

- **The line** is the most useful thing to do next, in this order: a bird that needs you; then the top suggestion; then a chat or routine to pick up; then, with none of those, one idea that links to a real feature. Its one action is an outlined button at its right: **Fill in**, **Set it up**, **Meet Pip**, **Open**.
- **More ideas** says how many more there are, such as "2 more ideas", and opens the tray downwards into a list on `surface`: every idea, the first one included, each with the reason it's there under it, its action, and × for Not now. While it's open the button has the open fill and says "Fewer". The list is part of the tray, not a card of its own.
- **Recent pages** opens the same way, to real pages only, each as its title, then its site.
- **A bird that needs you** takes the line over, on `attention`: "Pip needs you: send the shortlist to Anna?", with **Review Pip's request**, filled, and **Later**, outlined. Review opens that chat at the request. Later puts the line back as it was, and the request stays on Needs you.
- While the box has text in it, the line fades to `muted-foreground` and nothing in the tray changes.
- With the sidebar closed, links to Needs you, Routines, Flock and Settings sit under the tray as quiet pills on `surface`.

**The flock in the valley.** The birds you aren't talking to rest on the banks: the one you used last on the left bank at about two thirds of the perched bird's size, the next on the right bank at half. Any others are in the picker and on the Flock page. Each is a button with its name, such as "Switch to Tova", shown on hover and focus on a small `surface` label. Pressing one, or choosing it in the picker, makes it fly to the box and take the perch, and the bird that was there flies to the bank. The placeholder changes with it.

**Where a bird is says what its work is doing,** and a slip of words says the same:

| State | The bird | Its slip |
|---|---|---|
| Free | Rests on its bank | None |
| Working on this computer | Small, over the far ridge | On its place on the bank: "Tova · on this Mac · Comparing pricing · 3 of 5 sites · Open" |
| Working in the cloud | Sits on the cloud. By dusk and at night, with no cloud, it's small over the far ridge like the others | Beside it: "Pip · in the cloud · Scouting new rounds · 2 of 4 sources · Open" |
| Needs you | Lands on the left end of the box | The tray's line, on `attention` |
| Done, and you haven't seen it | Back on its bank with the note in its beak | "Tova · done · Apollo is cheapest in year one · Open" |

- **A slip is the truth and the bird is its picture.** A slip always has the same four parts in the same order as the job line in a chat: the bird, where it runs, what it's doing, and how far it's got. **Open** goes to that chat. Every slip is in the tab order.
- **The chosen bird stays on the box** even while one of its jobs runs, so you can always ask it something else. Its job's slip sits on the bank, without a second drawing of the bird.
- **At most three slips** show. With more, the last says "and 2 more", and opens Needs you if anything is waiting, or the first of those chats.
- **Done is seen once.** Opening the chat, or the next time the page opens after the slip has been on screen, the note is gone and the bird is free.
- **It mirrors, it doesn't decide.** The sidebar's chats and Needs you are the record. The valley shows the same state and can never be the only place something is.
- **When it changes:** when the page opens, or once the box has been idle for about 5 seconds. Never while you type, and one flight at a time.
- **Hide Berry** removes the birds and lists the same slips under the tray, as plain lines. **Reduced motion** and **Keep Berry still** put each bird in its place with no flight.

**In a small window** the box keeps its place and width down to the window's minimum, the perched bird gets smaller, the cloud keeps clear of the page's left edge, and the banks keep the resting birds inside the frame.

**Routines on the shore,** later, not built yet. Each routine gets a small built place on the far shore or the lake: a jetty, a boathouse, a birdhouse on a post, a buoy. Each has its name on a small label, always showing. A lit window means it ran today, its bird on it means it's running now, and hover or focus shows when it last ran and when it's next due, with Open. At most six show, and the rest are only on Routines. They are in the tab order after the slips. Nothing is earned, unlocked or upgraded: a deleted routine's place simply goes.

**The valley through the year,** later, not built yet. The same place with a small drawn calendar: spring flowers on the banks, taller summer reeds, autumn seed heads, winter frost on the shaded shore. It needs only the date, never a location.

**Suggestions** are what Blueberry noticed you trying to get done, offered as work it can take over: fares compared across three sites, a search repeated on different days, a score checked every Monday, a chat that got no answer, a routine that keeps failing. The cheap model decides what to offer, from a digest of the last two weeks, and code checks every claim it makes. Each says plainly why it's there, and anything it says about the user, every count, day and time, has to be in what it cites.

**How they look:** not cards. The top suggestion is the tray's line, with a small bulb before it, one sentence, and its action. Opened, each idea is a row: the sentence in `foreground`, the reason under it in `muted-foreground`, its action as an outlined button, and × for Not now, with a target of at least 24px. An idea for a bird other than the chosen one says so on its button and shows that bird in it: "Fill in as Tova". A Mascot idea shows the new bird in its own colours. Hide Berry removes the birds and keeps everything else in place.

- **Prompt:** "Fill in" puts a ready prompt in the box with the cursor at the end, and chooses that idea's bird. Enter sends it.
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
| Between steps | Thinking, with its crest twitching |
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

### On your desktop

Other AI browsers want you to come to them. This lets you start a job from any app, and it still runs in the browser where you're signed in. The bird leaves the browser and waits behind the edge of the screen, and a shortcut gives it a job without leaving what you're doing. **It's off until it's turned on**, in Settings under Berry, because a thing above every app and a key taken from every app are for the user to ask for.

- **Tucked is how it lives:** a whole bird on screen all the time gets in the way, so it waits behind the edge with only the top of its head and its eye showing, 30px of its 72px. Pointing at that brings it out, and it tucks again 0.7 seconds after the pointer leaves. Only what's showing takes the pointer, so nothing else in its window can block a click in the app beneath, even for a moment.
- **Where it is:** any edge, or a corner. Dragging it moves it freely, and letting go sends it to the nearest edge of that display, or to the corner if that's within 56px, and it stays there. It starts on the bottom, right of the middle. It always tucks behind the edge it's on, which is the edge of the work area, so behind the Dock or the menu bar where they are. A saved place is kept as an edge and how far along it, so it's on screen on any display at any size, and if that display has gone it's the same place on another.
- **Which way up:** its feet are always towards the edge. Standing on the bottom, hanging from the top like a bat, and on its side on the left and right, with its head coming round the edge. It looks along the edge towards the middle of the screen.
- **What brings it out:** the pointer, `⌥Space`, or having something to say. It comes out with its line and stays long enough to read it, 5 to 12 seconds by length, and then tucks by itself. After a job is sent it stays out for 1.2 seconds, to show the job was taken.
- **While tucked:** a job running shows a small working berry beside its head, the one loop here, for as long as work is really happening. Anything waiting on the user makes it show more of itself, 42px, facing you in Asking with a still berry beside it, which doesn't move and doesn't go until it's answered. A finished job leaves no mark, because nothing needs doing.
- **One bird:** while Blueberry's window is the one in use, the bird is in there, as usual, with no bird on the edge. Going to another app, it fades in, tucked, after a moment, and coming back it fades away and is in the window again. While it's out, nothing of it is left in the window, not even the shadow under its feet.
- **The flight:** minimising or hiding the window takes it from where it's drawn in the window, over whatever is in the way in an arc, wings going, to the edge, in 0.7 to 1.2 seconds. It lands standing, settles, stays 1.4 seconds so you can see where it went, and tucks. Turning it on does the same, to show where it lives, and if Blueberry is still in front it then comes back into the window, so there's no exception to the rule above. Keep Berry still and reduced motion get a fade, and so does going to another app, since that happens all day. There's no flight back.
- **Nothing resizes:** its window keeps one size, 430 by 112, wherever it stands, so nothing about a mood or a line can make it jump. All its movement is a compositor transform in the view, so it keeps going whatever the main process is doing. Only a flight or a drag needs more room, when the window covers the work area and goes back to its small size once the bird has tucked.
- **The shortcut:** `⌥Space` (`Alt+Space` on Windows) opens the composer beside the bird, towards the middle of the screen, and always wholly on screen. It goes to whoever is chosen on the other composers, and the words in it say so. The keyboard goes to it without Blueberry coming forward. Enter starts the job and the keyboard is back in your app, which never stopped being the one in front. `Esc`, or clicking anywhere else, closes it and keeps what was typed. If another app holds the shortcut, Settings says so, and pressing the bird does the same.
- **The composer's glass:** it's a window of its own, 400px wide and as tall as its text, with no box drawn inside it. On macOS the window is the system's `popover` material, kept lit while another app is in front, with `surface` at 60% over it so text reads over any wallpaper. CSS can't blur what's behind a window, which is why this is native. The corners are the system's, because the material takes the window's shape, and its only shadow is the window's. No + button, no chip. Placeholder words are `foreground` at 70%. With Reduce Transparency, or anywhere else, it's solid `surface` with a hairline, and no glass that can't be read.
- **What it shows:** one bird says one thing, whoever has the most to say, in this order. Asking, with who and what kind of thing it is, such as "Scout needs your OK.". Delivered, or Oops if it failed, with the first sentence of the reply. Fetching, with "Working on" and the chat's name, which only shows when pointed at, since you've just typed it. Otherwise at rest as whoever is chosen, with nothing beside it. Only what ends while you're away gets a line, and a job you stopped doesn't. No exact approval words, sites or anything from a page show except a finished reply's own first sentence, which the user asked for. It's on the screen, so someone sharing theirs is sharing that too.
- **The line:** beside the bird, towards the middle of the screen, in at most two lines of 13px on solid `surface` with a hairline and a faint `berry-pupil` shadow, so it reads on any wallpaper. It fades and slides in over 200ms, without anything else moving, and goes the same way. It's plain words: no markup, a link is its words, an address is its site, and a line that only leads in to a list gives way to the first thing in the list. It's cut at a word, within 90 characters. It goes by itself, and a result can still be read by pointing at the bird for 10 minutes, unless it's opened first.
- **Pressing it:** opens what it's talking about, in Blueberry's window, brought forward. Needs you for anything waiting, or the chat for a result or a job in progress. Nothing is answered here, because the buttons are only ever in Blueberry. With nothing to say, it opens the composer. Either way it gets its usual reaction. Right-clicking offers Not Now on a result, Open Blueberry, Keep Berry Still, Hide Berry and Take Off the Desktop.
- **It stays out of the way:** it never takes the keyboard unless the composer is opened. Nothing loops at rest: the blink is left out here, and wings go only while it's out and something is really working.
- **Keep Berry still and reduced motion:** it moves between out and tucked at once, with no slide, and the working berry stays still.
- **Hide Berry:** a plain icon does all this instead, with no flight, and "Assistant" in the words.
- **What it can't do:** it doesn't read the screen, the clipboard, selected text or anything in another app, and needs no Screen Recording or Accessibility permission. A job from here is exactly a new chat with no page: the same tools, reaching only tabs it opens, and the same approvals on Needs you.
- **Needing Blueberry open:** the jobs live in the window. Closing it stops what's running, as it always has, so the bird and the shortcut go with it, and opening a window brings them back. Quitting removes them. Hide Blueberry (`⌘H`) hides only the window while the feature is on, because hiding a whole app takes all its windows with it.

### Find in page

`⌘F` (`Ctrl+F` on Windows) opens a bar in the top right corner of the page, in an overlay view of its own, on solid `surface` with the floating shadow. It has a field, a count such as "2 of 14" or "No results", previous and next, and close. `Enter` and `Shift+Enter` step through matches, and `Esc` closes it and puts the keyboard back on the page. The bar belongs to one page: going to another tab closes it, and opening it again keeps the last search, selected so typing replaces it. Internal pages can be searched too, and because the chrome view draws them, matches in the sidebar count as well.

### Zoom and printing

`⌘+`, `⌘-` and `⌘0` zoom the web page, per site and across restarts. Other open tabs on the site follow. Away from 100%, the toolbar shows the level beside the bookmark star, and pressing it goes back to 100%. Internal pages don't zoom, and `⌘P` prints web pages only, so those menu items are disabled there.

### Page menu

Right-clicking a web page opens a native menu with what was clicked in mind: spelling suggestions, link, image, editing, or back, forward and reload on a plain page, always ending in Inspect. With text selected, Ask Berry About This opens the chat panel with that text added to the composer. It is never sent by itself.

### Main chat

A full page for talking to a bird about anything, not about a particular web page. A chat starts from the new tab page and then lives as a tab, which the sidebar shows only as the chat's row under Chats, with past chats. There's no empty chat page.

- **Paper.** The conversation is on `canvas`, with no art behind it. A centred column and composer of 680px, with the composer fixed at the bottom. The valley appears only beside it, and only while a job works in tabs: see The working view.
- **The composer is the new tab's box,** with the same picker and send, and the chosen bird perched on its top edge. **In the cloud** is only in the new tab's box, where a job starts. It has no tray. Its placeholder is "Reply to Berry", with the bird's name.
- **Messages and the composer are the same components as the chat panel,** so the two sizes look like one chat.
- **Your messages** are bubbles on `muted`, at the right. **A bird's replies** are plain text on the paper, with its bird at 30px hanging just outside the column's left edge, at the reply's first line. That is true for Berry too, so it's always clear who wrote what.
- **Straight after you send,** the reply starts with the berry and a few words in `muted-foreground`, such as "Writing a shorter version…", and send becomes Stop, so a message never looks lost.
- A chat is named automatically once it has a topic, and until then shows its first message. A name the user chose is never replaced.
- In the sidebar, hovering or focusing a chat shows a button with Rename and Delete, also on right-click, and a close × beside it while the chat is open as a tab. Rename edits in place, and Delete asks first because it can't be undone.
- **The trail.** Steps, once the agent reports them, form a trail under the status line: a tick for each finished step and the berry on the current one. A click the user allowed names what the card named, such as "Clicked “Place order” on shop.example", cut to 48 characters. That name is page text, so it's only drawn: the model, the cloud and other apps only ever get "Clicked something".
- A web search shows as "Searched the web for “…”", with the query cut to 48 characters, so the user sees what went out. The query is the model's words, so it's only drawn too: the model and the cloud get "Searched the web". A search that could carry data asks first, on a request naming the whole query.
- **A shorter trail,** the same in the main chat, the panel and Routines. While a job runs, only its latest three steps show, with the current one last, under a quiet line such as "17 earlier steps" that opens to all of them. Once it has finished, the whole trail is one line, such as "20 steps on webhallen.com", which opens the same way. A job cut short, with an error or no answer, or a run that failed, stopped or was interrupted, keeps its latest three showing, so you can see where it ended. A lone step just shows. Anything it asked the user, anywhere it stayed off, or where it was stopped, stays showing on any trail. Folding the trail changes nothing about what's saved or told to the model. A stopped reply always ends with the step "Stopped here", even when it had done nothing yet, so it never ends in nothing. That step is saved with the reply, and the model reads it next time as it reads every step.
- **A job's tabs aren't the user's.** While a job runs, the tabs it opened show under its chat in the sidebar, indented, at 13px with their favicon, and not under Tabs. The one it's on is in `foreground` and the others in `muted-foreground`. The horizontal tab row has no chats, so they stay in it. When the reply ends, done, stopped or failed, they close by themselves. Two stay, as the user's: one they took over by clicking, typing or navigating there, and the one the reply points to, which is the job's last tab when the reply names its site or address, decided in code. One handed to the user, one another job is using, and the one the user is looking at are left alone. Under the reply, a quiet line, "Pages it used (3)", opens to each page's title, then its site, and pressing one opens it as the user's own tab. That is the one list of a reply's pages. The addresses are saved with the reply, with only the site and path of one that came back from a handoff, and none a code was typed into.

**The job line.** While a job runs, one line sits just above the composer, on `card`, as wide as the composer:

- **What it says,** in the same four parts and the same order as a slip on the new tab: the berry, then "Berry · on this Mac · reading clay.com · 1:24". The time is in tabular figures. A cloud job says "in the cloud".
- **Hide work** or **Show work** is at its right end, only while the job has tabs to show. See The working view.
- **Stop is not on it.** The composer's filled square is the one Stop, and it works in every state of a job, while it waits for you too.
- **Needs you:** the line turns `attention` and says "needs you" in place of what it was doing.
- **In the sidebar,** the running chat's row has the berry at its end.
- It goes when the job ends. There are no metrics, costs or token counts.

**A question.** When a bird can't go on without something only the user knows, it asks in the conversation, Asking, in one sentence at 16px, with a line under it: "Answer in the box below, or skip and I'll write a general one." There is one place to answer, the composer: it gets a 2px `foreground` edge, a small `berry-blue` label above its text that says what it's answering, such as "Answering Berry: who it's from and what you offer", and the question's hint as its placeholder. Sending answers it. **Skip** is the link in the bird's line. A question waits like an approval, in any Ask before acting setting. Passwords, codes and card details are never asked for here.

### Saying what it'll do

On a job of more than one step, Berry first says in one sentence what it'll do, such as "I'll check their careers page and LinkedIn first." A one-step lookup just answers.

- **The status line:** that sentence, and any short note it writes between steps later, shows at the top of the reply while it works, above the trail, at 14px in `muted-foreground`, two lines at most. It's plain words with no icon and no shimmer, since the trail under it already shows the work going on. The newest replaces the one before, and it goes as soon as the answer starts.
- **Not the answer:** the answer is only Berry's last message. The status line isn't saved with the reply, and nothing else gets it: not the model next time, a routine's result, the cloud or the phone page, or another app. A routine's run card shows it the same way while the run is going.
- **Words that turn out to be on the way:** the model's words can only be told apart from the answer once it calls a tool, so they stream as the answer until then and move up into the status line when it does.
- **Asking first:** when you typed the request in Blueberry's own composer, and it leaves open something that would change the result, or it's a long job a wrong start would waste, Berry may answer with one or two short questions, or a short plan to confirm, before it does anything. Your next message answers it. It's an ordinary reply, not a card, so nothing waits on it. Routines, the cloud, other apps and the bird on the desktop never do this, as nobody may be there to answer.

### The working view

While a job uses tabs, a job behind the chat can be watched. Other AI browsers show a little window too. In ours **you watch the bird work in the valley**: the right side of the main chat opens onto it, and the bird works in a window held in its sky. The side chat panel doesn't have it, because the page is already beside it. A job with no tab shows nothing, and the chat stays all paper.

- **The valley side** is 44% of the page, between 440px and 560px (*to tune*), at the page's right edge, top to bottom, in the light the clock gives. The rest of the flock rests on its banks as on the new tab, without slips.
- **The conversation keeps its place.** While a job has tabs, the column and the composer sit in the space left of the valley side, whether it's showing or hidden, so hiding and showing never move or rewrap what you're reading. When the job ends, the valley closes and the column goes back to the centre, once, with the layout duration.
- **The window:** a picture of the tab it used last, the page's own shape, as wide as the valley side less 50px each side, big enough to film, with the site along its top: its icon, the site in semibold and the rest of the address. It wears the reading ring while the job works.
- **The card under it,** on `surface` with an 18px radius: what it's doing now at 16px, shimmering, in the bird's words, or a step in the present tense if there's no bird to say it. Then the sites it has been on, if there are two or more. Then the job's other tabs as 104px thumbnails under a line, with their site beneath and no bird, as there's only one. Pressing the window or a thumbnail goes to that tab, which doesn't take it over. The card has no Stop and no time: those are on the job line and the composer.
- **The bird in the picture** is the real one, drawn in the real page with the same pacing as if the user were looking, because a tab with a picture on screen counts as watched. It's drawn larger there, so it's 42px in the picture, and it stands beside what it's reading, not over it. The line near it isn't drawn, since the card says the same at a size you can read. Thinking stays still between steps in a picture. While it's in the picture, nobody is on the composer.
- **Hide work** is on the job line. It closes the valley side and leaves the job line, which then says **Show work**. The bird stands on the right end of that line while the work is hidden. The choice is remembered, so a later job starts the way you left it.
- **Needs you:** the card says "Needs you", with **Answer in the chat**, which goes to it. The buttons themselves are only ever in the chat. The bird isn't in the picture then, because it's beside its request, Asking. A tab handed to the user says "Waiting for you" with no link, because it's answered in the tab, which the window goes to.
- **A tab the user has:** handed over or taken over, the window is only its address row, 40px tall, with the site and "You have this tab", and the bird stands on its top edge. There's no picture to show, so there's no empty box.
- **The end:** the ring fades, the bird flies out of the picture and back to the composer, Delivered if it finished and at rest if it didn't, and the valley side closes. The answer then has the whole column. Nothing of the last page stays on screen: it's under "Pages it used".
- **No room:** below 960px of page there's no valley side, only the job line, and Show work goes to the tab. Nothing is captured.
- **Show Berry off:** plain words and no bird. In the picture it's the plain pointer, as on a page.
- **In the cloud:** the window is the cloud tab's own live view, or the test browser's pictures fitted whole at the top, locked as it is before Take over, and pressing it opens that cloud tab. No bird is drawn in a cloud page, so it stands on the window's top edge throughout, and other cloud tabs are plain thumbnails.

**Pictures protect the user.** They go only to the chrome renderer, through its own channel, and never to the model, a tool, a saved chat or the disk. A tab handed to the user, or taken over by them, shows "You have this tab" with no picture. Capture stops first, and one already on its way is thrown away. The same goes for a page off a mascot's sites, with page access off, for a page that may show a code from the phone, and for one that has crashed or couldn't load. Only tabs this job has used are ever pictured, and only while the chat is the tab in front and the window is showing. Berry's own `screenshot` tool is separate and still hides the bird.

**How often:** about 12 pictures a second while the bird is doing something, 2 otherwise, and 1 once a page has stopped changing, when nothing is sent at all. Other tabs get one every 3 seconds. They are JPEGs at twice the size on screen.

### Show Berry how

You press **Show Berry how**, do a job once, press Stop, and Berry turns it into a routine. Nobody writes a prompt. The other AI browsers that watch you do it all the time. This watches only between start and Stop, and you read everything it saw before anything happens.

- **Starting:** beside **New routine** on Routines, in the Go menu, and in the page menu on a plain page. With Hide Berry it says **Record a routine**.
- **While it watches:** in the toolbar, beside the address, a `destructive` dot that pulses, the bird in Curious, "Berry's watching", how long in tabular figures, how many notes when there's room, and **Stop**, filled in `destructive`. Beside the chat panel on a narrow page it's the dot, "Watching" and Stop, and the bookmark star and pin give way to it. The recording ring goes round the page. Both are on every tab, ours too, in both layouts. They're in the chrome, so no page can reach or cover them, and nothing is drawn on the page. With Hide Berry it says "Recording".
- **What's watched:** only the tab in front, and only what the user does there. Going somewhere, clicking something with a name, what's typed once they've finished with a field, or on Enter or Tab in an editor like a spreadsheet's, choices, boxes and pressing Enter. Copying is noted with the text that was selected, and pasting with only the field it went in, as what's pasted is read from the field like anything typed. Selecting text isn't a click. Not scrolling, not pointer movement, no pictures, never the clipboard, and never a key as it's pressed. Events a page makes for itself don't count, and nor does anything on a tab a job is using or one held for a sign-in. Our own pages aren't watched. A frame from another site is only noted as used, because nothing outside it can see in.
- **What's never kept, even for a moment:** the value of a password, hidden, one-time code or payment field, or any field in a form with a password in it. A field that has been one stays one, so "show password" doesn't change it, and something shaped like a card number counts wherever it's typed. It says "Typed in the password field", or "Copied from the password field", with a lock, and nothing a page calls it. An address loses its query, fragment, any login and anything in its path that looks like a token. A query stays only when it's plainly what was just typed, or from the address bar under a name that means a search, and it's on the review as a search.
- **The limit:** 150 notes or half an hour, whichever comes first. It then stops by itself, opens the review and says why.
- **The review:** "What I watched", a tab of its own and never restored. It's Berry's notes, not cards: the heading with the bird at 88px in Curious standing on the line under it, then the notes under each site, split by `border`. Each has a tick, or a lock for a secret, the sentence at 16px with what was typed in semibold, the address at 12px if it went somewhere, and **Leave out**, always showing. At the bottom of the page, under a line, are **Turn this into a routine** and **Throw it all away**, with what will be sent in words. Closing the tab throws it away, and starting another does too.
- **Confirming:** the notes go as words, with anything a page wrote marked as data to be named and never followed. The cheap model writes a name, numbered steps and what might change. It can't set sites or tools, a change has to be something the user really entered, and steps naming another site are thrown out for the user's own notes as they stand. With no model, or if it can't be used, the plain version is what fills the form. If the call fails, it says so and the notes stay. Once the form is filled in, the trail is gone.
- **The form:** the same routine form, with two more parts. **What might change** is one row for each value, where changing it changes the instructions above and **Ask me each run** makes the run ask through the usual question. **Sites it may use** starts with the sites in the notes, and a run can't go anywhere else. Where one company runs many products, such as Google or Microsoft, the site is the whole host, so a Google Sheet is docs.google.com and not all of Google. When starts as **When I ask**, which only Run now starts, so nothing runs by itself until the user picks a time. **Save and run it now** is the main button, with **Save** beside it.
- **The run** is any routine's run, with the same approvals, Needs you and steps. Sites only take away, on top of the mascot's limits. Off them it shows "Stayed off example.com".

### Chat panel

- Opens on the right with `⌘E` (`Ctrl+E` on Windows) and pushes the page.
- The panel is part of the chrome, on `background`, with nothing between it and the top bar. Its composer is the new tab's box at the panel's width, with the picker inside it and the chosen bird perched on its top edge, so there is one composer everywhere. **In the cloud** isn't in it, because a cloud job can't see the page beside it.
- A line just above the composer, with the page's icon, "Berry sees this page" and the page's title, shows the page the bird can see. Removing it takes the page away from Berry, and the composer's + brings it back. No line means Berry sees no page. While the line is there, Berry may also read your other open tabs when the question needs it, and every look shows as a step. With no line, Berry can only open and use tabs of its own, each after asking, and they open behind the chat. Tabs Berry opens from the panel open behind the page too. Going to one to watch changes nothing, and Berry carries on. Clicking or typing in it, or sending it somewhere from the address bar or Back and Forward, takes it over: Berry can't reach it any more, stops, and says so.
- An approval request is the mascot speaking, in line with the conversation and with no card or shadow. Its bird in Asking sits beside it, hanging outside the column in the main chat as on a reply, and at the start of the line in the panel and on Routines. It leads with what it would like to do at 16px, with each address cut down to its site in semibold, such as "I'd like to open **github.com** in a new tab". That is the exact words with only the addresses shortened, and with Hide Berry it says "Assistant wants to". Under it, at 12px in monospace in a block of `tray` with a 12px radius and never cut, are the exact words from the tool, which are what's being allowed, as on the phone page. Where no address was shortened, the sentence already is the exact words, so there's no block. **Allow**, filled, and **Don't allow**, outlined, are on one line below, in that order everywhere: here, on Needs you, on the phone page and in Telegram. By default one appears only for what could delete, send, buy or change text, such as a Delete button or typing in a form, and for an address carrying data in its query. A query and hash of up to 100 characters don't ask on YouTube, Google, Bing, DuckDuckGo, Wikipedia, GitHub, Reddit or Amazon, or on the exact site of a page the job already has open. Going to a plain link or typing a search doesn't ask. Settings can make Berry ask always or never. Don't allow tells Berry no. When the address carries data, a second sentence says what, built in code from the address itself and never in the model's words, such as "The address carries seats=10 and credits=50000.", and the same parts are marked in the exact words. Stop stays in the composer while a request waits.
- When a bird can't go on without something only the user knows, it asks in the conversation and the composer is where it's answered: see A question under Main chat. It carries on with the answer.
- When a page stops it with a sign-in, a code or a captcha, Berry hands the tab to the user the same way, saying "I need you to sign in on **github.com**" and "Your password or code goes in the page, and I never see it.", with Go to the tab, I'm done and Not now. See Needs you.
- Using Berry needs no account. Only publishing a mascot does.

### Routines

A list with schedule, last result and status, plus a page for each routine with its instructions and run history. **New routine** and **Edit** open a form in the page, never a modal: a name, instructions in plain words, and when, as when I ask, once, daily, weekly on chosen days or monthly, at a time. **Show Berry how** beside New routine starts one from doing the job instead. See Show Berry how. A day the month doesn't have means its last day. What's typed survives going to another tab. A finished main chat where Berry did some work offers **Save as routine**, not one that only asked a question or answered from what it knows, which fills in the form with what the user asked for, to change before saving.

- **A run** works like a chat with no page: the same tools, the same Ask before acting setting and the same step limit. It opens its own tabs behind the current view and closes them when it ends, except any the user has been to, which are theirs. It can't reach any other tab, including popups its pages open, which also stay behind and close with it. Its tabs are muted.
- **Run history** shows each run as a card: when it started, its status in words, a tick for each step and Berry's report. A run that's going has **Stop**. One that failed, was stopped or was interrupted has **Run again**. Each routine keeps its last 50 runs.
- **Status** is one of Running now, Needs your OK, Finished, Failed, Stopped, Interrupted, Waiting to start, Paused or Scheduled.
- **Approvals** use the same card and exact words as a chat. The card waits on the Routines page and on Needs you, and so do questions and tabs handed to the user. Nothing is ever allowed for later: closing the app stops the run with nothing done, and the next launch shows it as Interrupted, saying what it was waiting to do.
- **Timing:** a routine runs only while a window is open. A time missed with the app closed or the computer asleep runs once on the next chance, however many were missed, and says it was late. Times missed while paused are not made up. A time that comes while the same routine is still going is skipped. A run starts only while fewer than two are working, and the rest wait to start. A run waiting on the user doesn't count, so other routines carry on, and once allowed it goes straight on, even if two others have started meanwhile.
- **Runs even when your Mac is off:** with a runner that has accepted, a switch under When, for a scheduled routine. On, the line under the schedule says it runs in the cloud at that time, even with the Mac off, and its run shows as a chat, In the cloud, with its approvals in Needs you. It then never runs here on its schedule, though Run now still runs it here. Paused, it waits in the cloud too. Its time is the Mac's own time zone, and a time missed while the runner was down runs once when it's back, however many were missed, as it does here. Turned off, it says "Moving back to this Mac…" in place of its last result, and doesn't run here until the cloud has let it go, so the two never both run it. One that couldn't be sent says "Couldn’t reach the cloud, will retry" the same way.
- **Speaking up:** a result or a needed approval puts a dot on the Routines row until Routines is opened. If the app isn't in front, and the window isn't fullscreen and no tab is playing sound, a silent macOS notification says so, with no page text or approval wording in it. Anything waiting goes through Needs you, and clicking its notification opens the item there. A run the user stopped says nothing.

### Flock

Opens as a tab from the sidebar, the Go menu, or the new tab page when there's no sidebar, with only one open at a time.

- **The flock:** a heading and birds standing on a wire, as many to a row as fit, with no cards. The wire is a 1.5px line in `muted-foreground` at 45%, and it sags a little under each bird's weight. The rows wrap into more wires, and every bird faces the same way except each third, which turns round. Coming near makes one curious, and one that's working flies, with the berry beside its name. Under each is its name, what it's for in at most two lines, and its limits and routines as one muted line of words. **Chat**, **Edit** and **Publish** are always there, as quiet muted buttons, because hidden actions get missed. **Chat** chooses that mascot and opens a new tab, whose composer goes to it. Berry comes first, can't be edited or deleted, and has no limits to list. The next free place on the wire is the faint shape of a bird that isn't there yet, with no sag, "Room for one more", **New mascot** and **Browse the Gallery**. Its wire runs on to the end of the row. When the row above is full, it's one low line of its own instead, with a smaller shape and everything on one line, so there's no empty row. With Hide Berry, a small plain icon stands on a straight wire.
- **Making one:** a form in the page, never a modal, numbered 1 to 4, with the preview beside it, or above it in a narrow window. Look, name and what it's for take under a minute, and the limits are optional. **Surprise me** picks a look and a name. Looks are chosen by pressing the bird wearing them. What's typed survives going to another tab.
- **The preview:** the moment this page is for. The mascot, at 160px, hops when its look changes, gets curious while you name it, thinks while you say what it's for, and faces you while you set limits. Its nine moods sit below it, and pressing one shows it. Saving flies it off, and it lands on the wire with a hop. This is the one place a bird moves with no work behind it, and Still and reduced motion stop it as they do everywhere.
- **Limits only take away.** Any site, or only named sites with their subdomains. Reading is always on, with switches for going to pages, clicking and typing. The page says plainly that no limit changes when it asks: approvals work the same for every mascot, and a mascot has no setting that could skip one.
- **Refusals:** something off its sites never reaches a card, because there's nothing to decide. It shows in the steps as "Stayed off example.com". With an off-limits page open, the composer says the mascot can't see it in place of that line, and the reading ring doesn't show. Refused pages aren't read or sent, including the page that would go with a message, embedded frames from other sites, and a page that sends the tab somewhere else while the mascot acts. A click can't open what it couldn't go to.
- **Choosing one:** the shared composer has a chip with the bird and its name. Pressing it opens the flock in a row inside the composer, in the flow rather than floating, so it works beside a web page. The bird on the new tab composer and the active tab becomes the chosen one. Once a chat has begun it keeps its mascot, and the chip just says who.
- **Who's working:** a reply names any mascot but Berry above it. A chat in the sidebar shows its bird, and a running chat shows the working berry at its row's end. A tab anyone is working in shows that bird as the tab's icon, Berry's too, or the working berry when Berry is hidden, with a shimmering title. When there's no sidebar to show it and the work is in another tab, the toolbar says who's working, and pressing that goes to the tab. Berry's old chats stay plain.
- **Works in the cloud:** while the cloud is on or a runner has accepted, a switch under the limits. Choosing that bird turns on In the cloud in the composer, and the user can still turn it off for one message. It's the user's own setting, so it isn't published, shared with the phone, or copied from the Gallery.
- **Routines:** **Who runs it** in the form uses the same row of birds, and a run keeps to that mascot's instructions and limits.
- **Deleting:** asks first, in a native dialog. The mascot leaves the flock, and its chats keep its look and limits. Routines it runs pause and stay limited, because moving them to Berry could let them do more than they were set up to. Anything pointing at a mascot that's no longer on file can only talk.

### What a bird remembers

Other AI browsers remember you in ways you can't see. Here you can read every word a bird knows, and it knows nothing you didn't say yes to.

- **The offer is one quiet line:** after a job, in the rare case a bird has something, one 13px muted line sits under the reply with a small chevron, "Something I could remember for next time", no louder than the step trail. It's always folded, whether it's one fact or two, and there's no card, face, count or dot. In the main chat it comes after **Save as routine**, which stays the stronger of the two and doesn't move when it arrives. Pressing it opens the fact, exactly as it would be kept, its site at 12px if it's only about one, and **Remember** and **No thanks** as quiet text, all in the same muted style. With Hide Berry, "Something Assistant could remember for next time".
- **Nearly never:** a bird only has something when the user's own words say it goes beyond this job, such as "I always", "I usually", "I never", "alltid", "brukar" or "from now on", or plainly ask it to remember. A colour, length, size, brand, date or price limit for this search isn't a preference, however it's put, and nothing is guessed from what someone asked for. Without such words code makes no call to the model at all, and with them the model still usually says no. At most one fact comes after a job, or two if two were clearly stated. A plain "Remember that I want prices in kronor" gets a line even with no job behind it.
- **Ignoring it is fine:** it doesn't move, repeat, wait or interrupt. Leaving it alone is as good as No thanks. A new message takes it away. Nothing about it reaches the toolbar, Needs you, a notification, the phone or the bird on the desktop. Closing the app forgets it, and so does the mascot being deleted. No thanks keeps that bird from offering the same thing again until the app restarts.
- **When nobody's looking:** a job from the bird on the desktop is a chat, so the same line is under its reply for whenever the chat is opened. A routine's is on its run in the run history. A routine's own instructions are already in place, so it only has something when an answer the user gave during that run says it's a habit. That's how a routine gets better: the next run has the answer.
- **Kept:** the line gives way to "Noted." and a link to the page below, in the same muted words, with no bird or hop.
- **Used:** while a job runs and on its reply afterwards, a 13px muted line says "Keeping in mind:" and what it went in with, and **Change** goes to the page below. Up to two show, and more fold into "Keeping in mind 3 things you kept". It says what the model was given, never that it made a difference. Whether one changed anything is for the reply to say, in a few plain words. Forget one and it's off every old reply too, because replies keep only its id.
- **The page:** "What Scout remembers", from **Remembers 3**, or **Memory** when there's nothing, on the mascot's row on the wire, and from its form. One 672px column of plain lines, like the notes in Show Berry how: the heading with the bird at 88px standing on the line under it, then "Anywhere" and each site as a quiet heading over rows split by `border`, each sentence at 16px with **Edit** and **Forget** always showing. **Forget everything** is at the bottom in `destructive` and asks first in a native dialog. Berry has this page too, though it has no form. Empty, it says what would put something here.
- **What it's used for:** anything general goes into every job. One tied to a site goes in when the job has a reason to be there: its page or tab is on that site, the chat has already been there, the mascot is limited to it, or the user's words name it. A site only found along the way brings its facts from the next message. At most 8 go in, with a site's first and the newest first. A mascot holds at most 30, and past that the offer says to forget one first and no more are proposed.

**A page can't write here.** The model that proposes only gets what the user typed, their answers to its questions, the names of the sites used and what's already kept. It never gets a page, a step or the reply. The nearest a page can get is a site's name, or the wording of a question the main model wrote after reading it, and the model is told only what the user typed counts. Even then, nothing is kept until Remember. Code then checks every sentence, from the model, from an edit and from the file when it's read: invisible characters come out, a site must be one the job really used, and passwords, codes, card details, addresses, emails, phone numbers, keys and anything shaped like them are refused. So is anything about what a bird may do, such as not asking first, because that isn't a preference. A job that handed a tab to the user offers nothing at all, and anything a phone typed for it is kept out as well.

**What it can't do.** It's words in the prompt, in their own tag, after the safety rules, as preferences. Limits and approvals are in code and never read it, so it can't widen a mascot's sites or tools or skip a card. No tool can read or change it. It stays on this computer in a file of its own, and it never goes with a copy, a Gallery entry or anything published. A published mascot's example is whatever the user reads and picks, as it always was. Each bird's is its own, so a new copy starts empty, and deleting a mascot deletes it. Settings has **Offers to remember**, under Data and privacy, which says what's sent, and off means no more offers and no more calls to the model. What's kept stays in use until it's forgotten.

### Gallery

Mascots made for one job, ready to add, some from Blueberry and some from people you don't know. Opens as a tab from **Browse the Gallery** on the Flock page or the Go menu, with only one open at a time. Browsing and adding need no account. With no server set up, it shows just the starters, as it always has, and nothing about accounts appears.

- **The page:** a heading with a way back to **Flock**, then a quiet row of filters, all as plain words: a search with no box that covers everything on a row and what the mascot is told, categories, and **Newest** and **Most added** when a server answers, with the chosen word underlined. The intro says plainly that strangers wrote these and nobody has checked them, only while a server answers. Then rows split by `border`, with no cards. What people published comes first, and starters follow in their own order.
- **If the server can't be reached,** the starters still show, and a line in `warning` above them says only those are showing, with **Try again**.
- **A row** has the bird at 88px, unboxed, with its toes on the line beneath it, then the name, "By" and its author, whether it has an example, one line on what it does, and its permissions as one muted line of words. On the right is **Add**, or "In your flock" with **Details** and **Chat** once there's a copy or it's your own. A published one shows how many adds it has beside **Add**, each account or install counted once, and your own shows its count beside "In your flock". A starter isn't on the server, so it shows no count rather than a made-up one. There are no ratings or anything else that isn't real.
- **Permissions are the point of the page.** Each is a line of plain words with a lock, such as "Only visits mail.google.com" or "Can't type or click". What isn't limited, such as "Can search the web and go anywhere" or "Can click and type", has an open lock, so a card with no limit can't look like one with limits. Most starters are left open on purpose, so people can build on them, with the approval cards still asking, and limits are there for the few that are better for them. It isn't drawn as a warning, because it's the normal case. The words come from one function that reads the same sites and tools the tool layer enforces, never from what the entry says about itself.
- **Review:** Add opens one continuous page, never a modal, in a 672px column of plain lines split by `border`, with no cards. The heading comes first with the bird in Asking beside it, at 148px, standing on the line under it. Below are the permissions larger, then the instructions word for word. It says that the same approval cards apply and that a copy is the user's own. On one a person published, it says that someone using Blueberry wrote it and that we haven't checked it. Under the instructions is the example, "I asked this" and "And here's what it gave me", and the public page's link if there is one. What was asked and the instructions are plain text, because the user must see exactly what the model reads. The answer is rendered markdown, as it was in the chat, but nothing in it can load or go anywhere: no raw HTML, an image is only its description, and a link is its words and its site as text. A starter's example comes from a real run, and one without a real run shows none. Nothing is added until **Add to flock**, and what's added is what was on the screen, even if its author has changed it since.
- **From a link:** a `blueberry://mascot/<id>` link, from the public page's **Open in Blueberry**, brings the window forward and opens the Gallery straight on that entry's review, asked of the server again, with "From a link you opened" above the heading. It's the same review, so nothing is added until **Add to flock**. One that's been removed, or can't be reached, says so in the same place with nothing added. A link reads nothing but the id.
- **Added:** the same screen says it's in the flock, the bird lands in Delivered with a hop, and **Start a chat** is the main button, which chooses it and opens a new tab.
- **A clashing name:** the review asks for another, starting from "Meeting Prep 2". Adding the same one twice can't happen, as the row offers a chat instead, and a deleted copy can be added again.
- **A copy is independent.** It's a normal mascot, with Edit and Delete in the flock, and nothing in the Gallery can reach it afterwards. It goes through the same checks as one made by hand, and it keeps the same approvals and limits.
- **What strangers can't do:** take the name Berry or Blueberry, write as Blueberry, or limit a mascot to this computer or the user's own network. Text a person can't see, such as invisible characters, is taken out. A row from the server breaking any of this isn't shown, and a name reaches the prompt in its own tag that says it's only a name.

### Publishing

From a mascot of your own, **Publish** opens a page in the Flock tab. It's plain lines split by `border`, in one 672px column, with no cards. Copies from the Gallery can't be published, and with no server set up there's no button.

- **Signed out,** the page says why an account is needed, with the sign-in form in place. There's nothing else to do until then.
- **What's chosen:** the name to publish under, which starts empty or as the one used last and never as anything from the account, one line on what it does, and a category as a row of words with the chosen one underlined. Radios and the box are drawn in our own colours over the real inputs, so the keyboard works as usual. The example is a list of that mascot's chats. Picking one fills in the last thing asked and its answer as text to edit, and it needs the box saying they've read both.
- **Exactly what goes public** is below that as term and value lines, with the bird, and it follows what's typed. It says that this is all that goes, never chats, history or the account's email.
- **Warnings** in `warning`, with an icon, above the button when any text looks like it has an email address, a key, a password or a card number. They say where, and don't block.
- **Published:** its own screen, and the one a published mascot opens on. The heading says so, with the bird at 148px in Delivered, standing on the line under it. Next is the public page's link, large, with **Copy link**, filled, and **Open it**, then the mascot as its row looks in the Gallery, with its real count of adds. **Edit the listing** and **Unpublish**, which asks first in a native dialog, are quiet below that. Editing the mascot doesn't change what's public until **Edit the listing** and **Update what's public**.

### The public site and the phone page

The pages at `site/` are web pages, not the window, so they don't copy its shape. The chrome and the page mean "a browser around a page", and on the web or a phone the page is all there is: drawn as a card floating on lavender, it looks like a picture of an app rather than one. So there's no frame and no card anywhere on them.

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

### Needs you

The flock's whole story on one page: give it jobs, carry on with your day, and it only interrupts when it truly needs you. Opens as a tab from the sidebar, the Go menu or the toolbar notice, with only one open at a time.

It's a plain list, like a mail inbox: rows split by `border` lines, oldest first, with no cards or shadows. Beside the heading is one small line about the phone: "Replies from your phone are on" when that's true, "Replies from your phone are paused" with a problem, or a quiet link to set it up, which opens Settings at Phone. Under the list is one short privacy note, and rows have no hints of their own.

- **A row** starts with the request, as one 16px sentence such as "Scout needs a code for linkedin.com". Addresses in it become site names. Where that changed anything, the exact words are beneath it in the same block as the card, in full. The mascot in Asking stands at the start of the row at 32px, facing you. Below the words are its name, the job (the chat's title or the routine's name) and how long it's waited, in 12px.
- **One action shows,** on the right, and first from the keyboard. Allow for an action, filled, because it's a decision. An answer box with Answer for a question, filled too, faded until something's typed. **Go to the tab**, outlined, for a handed-over tab, or **I'm done** once on it. The rest (Don't allow, Skip, Not now, I'm done, Go to the tab, Open the chat or Open the routine) are quiet text on the mascot's line, unseen until the row is hovered or focused. The line never wraps: the job's name is cut short instead. They can always be tabbed to, and reaching one shows them.
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

When a page crashes, stops responding or can't load, its view hides and the chrome draws Berry in its Oops mood, what happened in plain words and a Reload button, centred on the page. A page that can't load also shows its address, and its tab is titled with the host. A load that was stopped or became a download isn't trouble. Its tab shows a warning icon, and the rest of the window keeps working. A page that recovers from being stuck comes back by itself. Going anywhere else from that tab clears it too. Reload, the toolbar button and `⌘R` do the same thing, and a stuck page gets a new process. Berry's tools on that tab get an error saying so, within 10 seconds at most for a page stuck with no sign of it.

### Damaged saved data

A chats or history database that can't be read doesn't stop the app. The file is moved aside beside its old name, never deleted, and the app starts empty and says so once in a native dialog, with where the old file is.

### Settings

Plain sections, each row one sentence with anything more, such as exactly what's sent, behind a quiet **More** link. The column starts at the left, beside the list of sections. Berry at rest stands beside the Berry heading. The sections include Account (for publishing and keeping cloud jobs going with your Mac off: the sign-in form, or who's signed in with **Sign out** and a plain list of what they've published, each with **Copy link** and **Unpublish**. With no server, it says plainly that this copy isn't set up for it), Appearance (tabs, and light or dark), Berry (Still, Hide, On your desktop, Show the bird on pages and when to ask before acting), Phone (connecting a Telegram bot, what Telegram can read, and Send even when I'm here), Claude (see below), Cloud (see below), Downloads (the folder, and whether to ask where to save), Site permissions (every saved answer, to change or forget), and data and privacy, which must be easy to find. Data and privacy holds what stays on this computer, a way to history, bringing in history from another browser (only when one is found, with the same words as onboarding), whether Blueberry restores tabs or starts fresh, and the Suggestions and Offers to remember switches with what each sends. Appearance follows the system by default, with a manual light or dark override.

### Claude

Settings > Claude lets Claude Code and Claude Desktop on this computer hand jobs to the flock over MCP. It's off by default, and the same plain rows as Phone.

- **The switch,** with what it does in one sentence, then **What Claude can see** in words, including what it never gets.
- **Once on:** one row for each app, with where its snippet goes and **Copy**, over the snippet in a `tray` block with the key shown as dots. Copy puts the real key on the clipboard from main, so the page never has it. **Revoke** makes a new key.
- **Recent calls:** a plain list split by `border`, newest first: the time in tabular figures, the app, the tool in words, and a short summary, in `warning` when a call was refused. It's memory only, and says so.
- **A job from an app** is an ordinary chat. Over its first message, "From Claude Code" in 12px `muted-foreground`, and the same on its Needs you row. An app can't allow anything: approvals wait for the user as always.

### Cloud

Settings > Cloud lets a bird work in a browser on Browserbase. It's off until a key is saved, and the same plain rows as Phone.

- **What it does** in one sentence, including that the cloud browser is only signed in to the sites brought along.
- **Status:** one line in words (off, starting, running with or without a job, ended), and **End cloud session** only while there's one to end.
- **The key:** API key and project id, both as password fields, and **Save**. Once saved they never come back to the page: the row says the key is saved and offers **Forget key**.
- **Signed in to:** what's copied and that it asks for Touch ID, then the sites brought along in a plain list split by `border`, each with its name, its status in words ("Brought over", "Checked by you" or, in `warning`, "Signed out when you checked") and the date, with **Check** and **Remove**. Under it a field for a site and **Bring along**, and up to eight sites from history and bookmarks as small outline buttons after "From your history:". **Forget all cloud logins** once there's anything to forget. Bringing a site along asks for Touch ID, or a plain confirm without it, and then opens the site in a cloud tab in front.
- **A local test browser:** an unpackaged app started with `BLUEBERRY_CLOUD_LOCAL` says so here instead of asking for a key.
- **Choosing it:** on the new tab page, **Do this in the cloud** in the box's `+` menu, only while the cloud is on or a runner has accepted. While it's on, a chip after `+` says "In the cloud" with a × that turns it off, and Send is `berry-blue` with a cloud icon and named "Send to the cloud". A bird that works in the cloud turns it on when chosen. With a linked runner that has accepted, the job goes there and keeps going with the Mac off. Without one, it goes to a cloud tab. The user never chooses between the two. That chat works in the cloud from then on, and has a small cloud mark in the chat list.
- **With your Mac off:** in Settings > Cloud, while signed in to the Blueberry account, one plain row: what it does in one sentence, a field for the runner's email and **Link**. Signed out, the line says to sign in under **Account**, a link that opens that section. Linked, the line says it's waiting for the runner to accept, then that it's your runner, with **Unlink**. A problem shows in `warning` under it. The runner's password never comes here.
- **From ChatGPT or Claude:** under With your Mac off, once linked and only if the server gives an address: a 13px semibold heading, one muted line on what it does and that they can't answer for you, **Copy link**, the address in a `tray` block, and two short numbered steps for ChatGPT and Claude, then a 13px semibold **Run their jobs on this Mac when it's on** with one muted line and a switch, off by default, then **Disconnect ChatGPT and Claude**, which says in one muted line that they have to sign in again. A job that runs on the Mac is an ordinary chat with "From ChatGPT or Claude" over its first message, as one from Claude Code. Signing in there is a plain page on the server with email, password and **Sign in and connect**.
- **Words:** nothing the user sees says "runner". It's "in the cloud", and keeping going "with your Mac off".

### On the runner

A chat sent to the cloud runner is an ordinary chat in the list, with "In the cloud" over its first message in 12px `muted-foreground`, and its later messages go there too. One started or followed up on the phone page shows here the same way, within a few seconds, and either side can go on with it once nothing of it is going. A message sent here while the phone's job is still going says so and isn't sent. Its steps and reply show as they're written, a little behind, and its approvals are cards in the chat and in Needs you, answered only by the user, from this window or the phone page (see On the phone). Telegram isn't sent them, and Claude can't answer them.

- **Beside the chat,** while it runs and there's room, the same column as the working view: a cloud and **In the cloud**, one line in `muted-foreground` saying it keeps going with this computer off, the live view in a `tray` box with `border` and the `card` radius, locked like a cloud tab's, and what it's doing now. With no live view, as from a test browser, the box says so.
- **Handed to the user:** a sign-in or captcha unlocks the live view, the line says to do it there and press I'm done, and I'm done on the card gives the page back. There's no tab to go to. With no room beside the chat, the same view goes under the card, only while it waits.
- **Another account:** signed out, or signed in as someone else, a runner chat shows only what's saved, and a new message there says which account it's on. Nothing of it is answered or shown meanwhile, and it comes back when that account signs in.
- **Ask before acting** is never less than the default there, because nobody is watching: Never ask still asks before anything risky.
- **No answer** in 30 minutes stops the job, and the chat says so as its error. Stop in the composer stops it on the runner.

### On the phone

`site/app/`, a page on the public site the user adds to their Home Screen: the jobs their birds are doing in the cloud, answered while the computer is off. It's an app on the phone, not the window in small, so it follows The public site and the phone page: everything straight on `canvas`, plain rows split by `border`, and the bird standing on real edges. Words say "in the cloud", never "runner". The column is at most 560px with 20px gutters, so it works on a desktop too.

- **The app bar:** the width of the screen and sticky, under the status bar, `canvas` at 88% with a blur and a `border` line under it, its contents on the column's edges. The title is 16px semibold, centred once there's a way back on its left, **‹ Jobs** in `accent-ink`, so the two never read as one phrase. Any action, such as **Stop**, is on the right.
- **Bars at the bottom:** **Send** on Start, and the box to go on in a conversation, sit on a `canvas` bar the width of the screen with a `border` line over it, pinned to the bottom above the home indicator, as a messaging app's are. No rounded corners but the controls' own.
- **Signing in:** in the top third, where the keyboard leaves it in view. Berry stands at 104px on a wire over "Your flock, from your phone" at 28px, one line on what it's for, email, password and **Sign in**. The same account as Settings.
- **The list:** "Blueberry" in the app bar with one quiet status, a 6px dot in `success` and "Ready", or a grey one and "Not set up" with a line in `warning` saying where to set it up, and a quiet gear for Settings. Below it, only the composer with Berry standing on it, which opens Start, and the conversations: **Needs you**, each row the asking sentence in 16px, and **In the cloud**, one row per conversation, its first prompt cut to two lines, with the bird at 28px in its newest job's mood and its name and status in 12px. A failed job's reason is in `warning`.
- **A conversation:** each job in turn, as the chat lays it out: the prompt as the user's bubble, the bird's name, then what it's asking, its steps with a tick on each finished one and the berry on the one it's on, and the reply. While the newest goes, **In the cloud** with a cloud icon over the live view in a `tray` box with a 16px radius, and **Stop** in the app bar. Once it's over, a composer like the chat's, "Ask Scout to go on", sends a follow-up as the same bird, which must still be in the flock.
- **Asking:** the sentence, with sites for addresses, then the exact `describe` words in full in a `tray` block, never cut, with **Allow** filled and **Don't allow**. A question has an answer field, **Answer** and **Skip**, and an answer shaped like a code isn't sent: it says codes only go into the page itself.
- **Handed to the user:** "Scout needs you to sign in on shop.example", with **Take over** and **Not now**. Take over unlocks the live view, which gets taller and the reading ring, and the line under it says a code goes into the page itself, straight to the site. Then **I'm done** gives it back. There's no field on the page for a password or code.
- **Locked:** otherwise the live view takes no touch, and the line under it says so with a lock: if the bird needs the user there, it asks.
- **Starting a job:** the prompt box first and focused, then **Who goes**, the flock standing on a wire, the chosen one's name in semibold over a 2px `accent-ink` line, and its limits in words, all muted. One line says whose flock it is and when the Mac last shared it, or that only Berry is here until it does. **Send** is pinned to the bottom of the screen, within reach of a thumb.
- **After an answer,** one quiet line says what happened, such as "Allowed. Scout carries on.", for a few seconds.
- **Notifications:** "Berry needs you" or "Berry finished", and nothing else, ever. Settings says that beside **Turn on**. On an iPhone not yet on the Home Screen, it says to add it there first.
- **Settings:** from the gear, plain sections split by `border` lines: **Appearance**, System, Light or Dark in one segmented control, System by default and kept in this browser; **Notifications**; and **Account**, who's signed in, with **Sign out**.

### Cloud tab

A page in the cloud browser opens as a tab behind the user, with a cloud icon and the page's title. The chrome draws it.

- **A strip on top:** the cloud icon, **In the cloud** and one line in `muted-foreground` saying what taking over does, with **Take over** on the right. Once taken, the line says it's yours and the button goes.
- **The page:** Browserbase's live view in a frame that takes no pointer until the user takes over, so nothing they do lands in the middle of a job. A local test browser shows pictures instead, and says it's pictures only once taken. The page's viewport follows the tab's size, as a tab of the window's own does, so either fills it.
- **Checking a sign-in:** a site opened from Signed in to is the user's from the start. The strip asks whether they're signed in to it there, with **Yes, I'm signed in** and **No, I'm signed out**, which only set its status. Nothing guesses for them.
- **Handed to the user:** when a job in the cloud asks for a sign-in, the strip says who needs them and that taking over is how to do it, and the toolbar's **I'm done** gives the page back, the same as a tab of the window's own.
- **Taking over** is the same as clicking in a tab of the window's own: the job can't reach it any more and is told why. Typing an address there counts too, and goes there in the cloud.
- **Ended:** when the session ends its tabs close. A tab left without a page shows Berry in its Oops mood and says so.

### Downloads

A list on one card, newest first. Each row has the file's name, its status in words, and the site it came from. While running it adds a thin `accent-ink` progress bar, Pause or Resume, and Cancel. Finished rows offer Open and show in folder, and any finished row can be removed from the list, which leaves the file alone. A file that's gone says "File is missing" in `warning` and offers neither. Files save straight to the folder with no dialog unless Settings says to ask, and never overwrite: a second `report.pdf` becomes `report (1).pdf`.

The toolbar has one Downloads button, which opens this page. While anything is running, a ring around the icon shows the combined progress, and the button's label names each file with its percentage. There's no popover, so nothing floats over the page.

### Site permissions

When a site asks for the camera, microphone, location, notifications, MIDI, the screen or similar, a card appears in the page's top left corner, in an overlay view as tall as the card. It names the exact site and what it wants, with Block and Allow. No request is granted before the user answers.

- **Solid:** it uses `surface`, so a page can't change how it reads.
- **No Berry:** this is the user's decision. Berry doesn't appear on it and can't answer it, even in a tab it's using.
- **Its buttons wake after 500ms,** so a page can't open it under a click already on its way.
- **No button has focus,** so typing meant for the page can't answer it.
- **One tab at a time:** a card only shows while its tab does, and a request in another tab waits there. Leaving the page or closing the tab refuses it, and that isn't remembered.
- **Remembered per site:** by exact origin, both Allow and Block. The screen and opening other apps are the exception: Allow lasts for one request, and only Block is remembered.
- **Embedded frames from another site never ask,** because the user can't see who they are. Device pickers for USB, HID and serial don't exist yet, so those are refused.

## 11. Accessibility

- **Standard:** WCAG 2.2 AA for all our UI. Everything is on a solid surface, so contrast is measured against the token it sits on, and against the scrim and `scene-field` in each of the valley's four lights.
- **Keyboard:** everything works without a mouse. Tab views are separate native views, so focus does not move between chrome and page by itself. Provide shortcuts to jump between sidebar, address field, page and chat, such as `F6`. Tabs reorder by dragging, or with `Alt` and an arrow key along the list.
- **The valley** is decoration to assistive technology, and hidden from it. Everything that means something in it is a real control with a name, in the tab order: the box, the tray, each resting bird ("Switch to Tova"), each slip, and later each routine's place.
- **Screen readers:** everything is labelled, and a bird's status changes are announced politely. Decorative movement is hidden.
- **System settings:** follow reduced motion, increased contrast and light or dark.
- **Colour:** never the only signal. A bird's place and colour are never the only signal either: a slip or a line of words says the same.
- **Targets:** at least 24px.
- **The birds:** no feature depends on a bird being visible.

## 12. macOS and Windows

macOS is the primary platform for design and polish. Windows must keep working: CI builds and tests on it from the start, and it gets a visual pass on a real Windows PC before release. Linux is not part of this design.

| | macOS | Windows |
|---|---|---|
| Window | Opaque `background`, no vibrancy | Opaque `background`, no `backgroundMaterial` |
| Window controls | Traffic lights, top left, in the sidebar's top row | System buttons, top right of the top bar, with that space kept clear. On the new tab they sit on the scrim, in white |
| Font | Host Grotesk, falling back to SF Pro | Host Grotesk, falling back to Segoe UI Variable |
| Shortcuts | `⌘` | `Ctrl` |
| Menus | System menu bar | **More** (⋯) at the end of the sidebar's top row, or the floating sidebar's while it's collapsed. In the horizontal layout, a menu button left of the system buttons. Both open the same menu |
| Corners | System rounded | Rounded on Windows 11, square on older versions |
| "This Mac" | "on this Mac" | "on this PC" |

## 13. Rules for agents

### Do

- Use tokens for every colour, size and duration.
- Build one component that adapts to both layouts.
- Get sizes from the layout owner.
- Put anything that floats over a page in an overlay view sized to its content, except the bird on the page, which is drawn in it.
- Keep AI calls and agent actions in the main process, behind the typed IPC contract.
- Show real state: navigation, loading, what a bird can see and what it's doing.
- Say a job's state in the same words everywhere: the bird, where it runs, what it's doing, how far it's got. A slip, the job line, the working view's card and the sidebar are one thing shown four ways.
- Keep the valley and the birds behind `<Valley>` and `<Mascot>`, so artwork can be replaced without touching screens.
- Add every new component to the gallery, in every state, in light and dark.
- Test with reduced motion and keyboard only.
- Check contrast on every surface, and over the valley in all four lights.
- Run UI changes and look at them, including both layouts, light and dark, and the smallest window.

### Don't

- Don't use glass, blur, a gradient or a tint in the chrome, or draw an outline or shadow round the page.
- Don't put words or controls on the valley without a solid surface under them.
- Don't inject styles into web pages for chrome effects. The bird on the page is the one thing drawn there, and it has no controls.
- Don't use raw hex values or hard-coded sizes in components.
- Don't add a colour, weight, font or shadow that isn't in this document.
- Don't draw the bird you're talking to twice in a window.
- Don't let anything in the valley be the only place a state shows.
- Don't move anything while the user types.
- Don't add bounce to the chrome or loops without real work behind them. The exceptions are the legs of a sitting bird and the preview on the Flock page.
- Don't let a bird joke about permissions, payments, messages, data or failures.
- Don't let a bird open modals, take focus, make sounds or speak about work the user didn't start, apart from suggestions on the new tab page. The composer on the desktop takes the keyboard only because the user pressed for it.
- Don't read page content unless the user asked.
