# Blueberry design

Blueberry is an AI browser that should feel like a good Mac app with one capable colleague inside it. The direction is **Ink on glass**: solid web pages, quiet tinted glass around them, and one deep blue ink.

**Current phase:** the layout, proportions and interaction patterns closely follow Strawberry on purpose, as a reference to iterate away from. Blueberry keeps its own mascot, wording, icons and background art, and uses no Strawberry assets. Where this document and the older principles below disagree, the values here win.

This document is the source of truth for the UI. Values marked *to tune* are starting points, to be adjusted on real windows without changing the intent.

## 1. Principles

1. **The page comes first.** Web pages stay solid and get the space. The chrome stays quiet around them.
2. **One colleague.** Berry is a single character who helps with your work, not a team to manage.
3. **Calm by default.** Nothing moves, glows or asks for attention without a reason.
4. **Trust you can see.** The UI always shows what Berry can see and what it is doing, and it asks before anything that matters.
5. **A normal browser first.** Tabs, navigation and bookmarks must be excellent with no account and no AI.
6. **Crafted and warm.** Warmth comes from Berry's voice, its character and the motion. It never becomes corporate or childish.

### What we reject

- A team of humanoid companions, or characters assigned to job roles.
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
| Chat panel | Right, pushes the page | Same |
| Web page | Reaches the window edges, in one card with the toolbar and bookmarks bar | Same |

Sizes (*to tune*):

| Item | Value |
|---|---|
| Sidebar | 280px default, resizable 200–360px, collapses fully |
| Chat panel | 400px default, resizable 320–480px |
| Address row | 40px |
| Bookmarks bar | 36px, with a hairline under it |
| Sidebar row | 34px |
| Horizontal tab row | 40px |
| Minimum window | 900×600 |
| Minimum page width | 480px |

- **When space runs out:** the sidebar collapses first, then the chat panel closes. The page keeps its minimum width.
- **Collapsed sidebar:** it returns when the pointer reaches the frame gutter at the window's left edge. It slides in over the page and slides away when the pointer leaves, so it is an overlay view (see below).
- **Sidebar contents, top to bottom:** window controls with search, then New Tab, New chat and Routines, then chats, then tabs. The account and Settings stay at the bottom. The collapse button is in the toolbar.
- **Bookmarks bar:** pinned sites and bookmarks, under the address bar.
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
- **Internal pages** (new tab, main chat, Routines, Settings) open as tabs drawn by the chrome renderer, with no tab view. Their content sits on the same `canvas` card as the toolbar, in the same position as the web page card, so the sidebar stays visibly separate from the page.

## 3. Glass

There is one glass strength, not a user setting.

| Level | Used for | How it is made |
|---|---|---|
| Solid | Web pages, always | An opaque view |
| Frame | Window frame, sidebar, chat panel | Native window material plus the glass tint |
| Panel | Cards and popovers inside the chrome | CSS `backdrop-filter` plus the glass tint |
| Floating | Anything over a web page | Overlay view with `backdrop-filter` plus the glass tint |

The glass tint is 88% of `background`, in both light and dark mode (*to tune*).

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
| `background` | `#eeeeee` | `#2b2b2b` | Frame, sidebar, chat panel |
| `canvas` | `#fcfcfc` | `#1f1f1f` | Internal pages, the card a web page sits on |
| `surface` | `#ffffff` | `#242424` | Composer, inputs, raised content |
| `tray` | `#f4f4f4` | `#181818` | Tray under the composer, page card, code blocks |
| `card` | `#f3f3f3` | `#2a2a2a` | Idea cards |
| `selected` | `#ffffff` | `#565656` | Selected rows in the sidebar, selected segments |
| `muted` | `#ececec` | `#303030` | Address bar, bubbles, hover, selected rows on `canvas` |
| `border` | `#e4e4e4` | `#404040` | Separators |
| `foreground` | `#1a1a1a` | `#f2f2f2` | Main text |
| `muted-foreground` | `#5a5a5a` | `#b0b0b0` | Secondary text |
| `primary` | `#4f568e` | `#4f568e` | Primary button fill |
| `primary-foreground` | `#ffffff` | `#ffffff` | Primary button text |
| `accent-ink` | `#2f3aa8` | `#a3aefb` | Links, focus rings, selected states |
| `success` | `#17653c` | `#6fcf97` | Status |
| `warning` | `#744b00` | `#e0b050` | Status |
| `destructive` | `#ab241c` | `#f59e96` | Status, destructive actions |
| `glass-tint` | `background` at 88% | `background` at 88% | All glass |

Worst-case contrast is calculated with pure black (light mode) or pure white (dark mode) behind the glass, ignoring blur. Re-measure on real glass.

| Text colour | Light on background | Light on worst-case glass | Dark on background | Dark on worst-case glass |
|---|---|---|---|---|
| `foreground` | 15.0:1 | 11.4:1 | 12.6:1 | 8.7:1 |
| `muted-foreground` | 5.9:1 | 4.5:1 | 6.5:1 | 4.5:1 |
| `accent-ink` | 7.9:1 | 6.0:1 | 6.7:1 | 4.6:1 |
| `success` | 6.1:1 | 4.6:1 | 7.4:1 | 5.1:1 |
| `warning` | 6.6:1 | 5.0:1 | 7.1:1 | 4.9:1 |
| `destructive` | 6.0:1 | 4.6:1 | 6.9:1 | 4.7:1 |

White on `primary` is 6.9:1 in both modes.

Berry has separate tokens and never uses the UI accent:

| Token | Light | Dark |
|---|---|---|
| `berry-ink` (body) | `#181c2e` | `#3a4270` |
| `berry-wing` | `#2e3454` | `#525c8e` |
| `berry-nape` | `#9ea6be` | `#a8b0c8` |
| `berry-eye` | `#f4f1e6` | `#f4f1e6` |
| `berry-pupil` | `#141624` | `#141624` |
| `berry-beak` | `#3e4466` | `#5c648c` |
| `berry-fruit-mid` | `#5568b2` | Same |
| `berry-fruit-dark` (shade) | `#37478f` | Same |
| `berry-fruit-bloom` | `#7e8ec8` | Same |
| `berry-fruit-crown` | `#182054` | Same |

Dark `berry-ink` is lifted just enough to stay visible while still reading as a dark bird. It is below the 3:1 for meaningful graphics, so the eyes, hood and berry carry the shape, and nothing may rely on Berry alone: moods have text labels.

### Spacing, radius, elevation

- **Spacing:** 4, 8, 12, 16, 24, 32, 48px.
- **Radius:** 8px for controls, 10px for sidebar rows and inputs, 20px for cards and panels, 24px for the composer, and full for buttons and segmented controls.
- **Elevation:** chrome regions are separated by tone, with a soft left-facing shadow on the page card when the sidebar is open. The page shadow is `-2px 0 6px`, black at 4% in light mode and 12% in dark mode. Things that float, the composer, and selected rows in the sidebar also get a shadow.

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

Berry is a small jackdaw in flat ink who nearly always has a blueberry in its beak. Berry is "it", and it refers to itself as "I".

### Character

- **Bird:** a big head on a plump, smooth body with stubby legs, turned three-quarters so it can look at you. Softness comes from gentle light on the chest and a few deliberate feathers, never a bumpy outline. A dark cap and throat, a grey hood behind them and pale eyes with big pupils make it a friendly jackdaw, and the eyes carry most of the expression.
- **Blueberry:** its signature, and what ties Berry to the name. It stays in Berry's beak, even in the smallest icon, and leaves only when Berry is thinking, finishes a job, makes a mistake or sleeps. It has a matte, dusty bloom, a slightly squashed shape, and a sunken crown with uneven lobes set off-centre. It is never a blue circle with a star.
- **Style:** flat ink, with the berry in the same flat style as the bird. Large moments may add engraved detail.
- **Implementation:** one SVG drawing per mood behind a `<Mascot mood size>` interface, animated with CSS, so artwork can be replaced without touching screens. Each mood should be recognisable from its outline. Rive is the next step for the large animated moments.

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

Berry, large, sitting on the top edge of a 752px composer with a tray under it linking to Routines, a new chat and Settings. Below that are two idea cards linking to real features, then recent pages if there are any. Faint, irregular trails of alternating bird footprints sit in the background, with varied lengths, directions and faded sections instead of a repeating tile, and two small birds walk around behind the page leaving new prints that slowly fade. They pause to peck now and then. Each print is the size of the bird's foot and lands under it, and a stride is what its legs really cover. Still, Hide Berry and reduced motion remove the birds and keep the old trails. Nothing appears in the recent list unless it is real. The chat panel doesn't open here, because this page has its own composer. It returns on the next page if it was open.

`Enter` opens anything that looks like an address and asks Berry about everything else. `⌘Enter` (`Ctrl+Enter` on Windows) always asks. Searching is the address bar's job.

### Browsing

The page gets the space. The address bar shows the real URL and real navigation state. Berry stays small and only shows a mood when something is happening.

### Main chat

A full page for talking to Berry about anything, not about a particular web page. It opens as a tab, and past chats are listed in the sidebar.

- A centred conversation and composer of 752px, with the composer fixed at the bottom. A new chat with no messages looks like the new tab page instead.
- Messages and the composer are the same components as the chat panel, so the two sizes look like one chat.
- Berry's working state says what it is doing and offers to show the work in a tab.

### Chat panel

- Opens on the right with `⌘E` (`Ctrl+E` on Windows) and pushes the page.
- A card on the composer, with the page's icon, title and address, shows the page Berry can see. Removing it takes the page away from Berry, and the composer's + brings it back. No card means Berry sees no page.
- Approval requests are cards showing exactly what will happen.
- Using Berry requires an account, requested the first time someone uses it. Browsing, tabs and bookmarks never need one.

### Routines

A list with schedule, last run and result, plus a run history showing what Berry did at each step. Anything risky waits for approval.

### Settings

Plain sections, including layout, appearance, Berry (Still and Hide), and data and privacy, which must be easy to find. Appearance follows the system by default, with a manual light or dark override.

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
- Don't add bounce to the chrome or loops without real work behind them. The one exception is Berry's world on the new tab page and the legs of a sitting Berry.
- Don't let Berry joke about permissions, payments, messages, data or failures.
- Don't let Berry open modals, take focus, make sounds or speak about work the user didn't start.
- Don't read page content unless the user asked.
- Don't send browsing data to third-party services for UI features such as favicons.
- Don't make any feature depend on Berry being visible.
- Don't add a settings slider for glass strength.
