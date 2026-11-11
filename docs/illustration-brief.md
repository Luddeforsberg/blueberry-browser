# Illustration brief: the valley and the birds

Blueberry is an AI browser. Its chrome is plain grey and white. All its colour lives in one drawn place, a lake valley, and in a small flock of birds who work for the user. [DESIGN.md](../DESIGN.md) says how they're used: see The valley, and Berry and the flock.

Today both are drawn in code, as stand-ins. This brief is for the drawings that replace them. The app's own new tab, at the four times of day, is the reference for composition, colour and scale: `images/valley/` has a picture of each. The stand-ins got the composition right and the drawing wrong, so keep where things are and draw them properly.

## What to draw

1. **The valley,** in four lights: dawn, day, dusk and night.
2. **The bird,** in nine moods and three sizes, with five accessories.
3. Later, not now: about eight small places for the shore, and the valley's year.

## 1. The valley

One place, the same every time: a lake in a valley between soft, rolling ridges, with a large meadow bank at the near left and a small one at the near right. Only the light changes.

**The feel:** vivid, clear and a little storybook. Sky blue, green and white by day. Fine stipple grain in full colour on every shape, like a risograph or a gouache with a dry brush, following the light. It should look drawn by a person. It is not a photo, not a 3D render and not a smooth vector gradient.

**The composition is fixed,** because the interface is laid over it. A box the user types in sits a little above the middle of the picture, 680px wide, and a bird stands on its top edge at the right:

- **The sky** takes the upper part. One bright thing sits in its upper left, well away from the box: a cloud by day and at dawn, the sun with a glow at dusk, the moon with a soft halo at night. At night a few stars in loose clusters, of different sizes, with none near the box and none in the top 72px.
- **Five ridges** pass behind one another across the middle, rising towards both sides by different amounts so they cross behind the box. Lit from the upper left: slopes facing the light are paler, slopes facing away are deeper, and each crest catches a thin highlight. Mist gathers at the foot of each ridge, so the far ones fade into the sky. Round and rolling. No spikes, no cliffs, no angles.
- **Behind the box** the scene is at its quietest and palest: a band of light air across the ridges at the height of the box's top edge. The interface adds this itself, so don't paint it in, but leave nothing dark, busy or sharp there.
- **The lake** fills the middle below the ridges and mirrors them, with the reflection broken by soft ripples and getting darker towards the viewer. A few streaks of light, of different lengths. No even stripes.
- **The banks** are the near corners. The left one is large and its crest leads the eye up towards the box. The right one is small. Birds stand on both crests, so each needs a clear, gently rounded top that stays inside the picture at every window size. Their grain should match the ridges', with a soft edge against the water.
- **Leave clear:** the area of the box and 120px each side of it, and the top 104px, where the browser's bar sits on a dark veil of the sky's colour.

**The four lights,** by the clock. The same drawing, relit:

| | Sky, top to horizon | Ridges, far to near | Banks | Water | Bright thing |
|---|---|---|---|---|---|
| Dawn | `#3a62b6` to `#ffe9cf` | `#bab8e2` to `#535ea8` | `#183f2e` to `#e2dcae` | `#4a5fae` | A cloud lit pink from below |
| Day | `#1a46a6` to `#e1edfa` | `#a7c4ef` to `#355fb3` | `#174a28` to `#d2e88e` | `#2a5fb8` | A white cloud |
| Dusk | `#1b1d6a` to `#ffb06e` | `#865ca4` to `#282466` | `#0b1719` to `#b08458` | `#2a246e` | The sun, low, well clear of the ridges, with a glow |
| Night | `#03061a` to `#27418c` | `#2a3779` to `#0f163e` | `#020c07` to `#20573a` | `#0a1440` | A dim moon with a wide soft halo |

These colours are where to start, not a rule. Keep it vivid: a dustier, greyer version was tried and turned down. At night the box is dark grey, so nothing in the night scene near it should be brighter than the moon, and the moon should be quiet.

**The cloud** is one soft shape in the same grain as the ridges, lit from the upper left, with a soft base. Not a pile of circles, and not puffy 3D. A bird sometimes sits on its top, so it needs a broad top.

**What to hand over.** The window can be any size from 900×600 up to a large screen, so the picture is put together from layers that are placed separately:

| Layer | Size at 1x | How it's placed |
|---|---|---|
| Sky | 2880×1800, or a seamless strip | Fills the page |
| Bright thing: cloud, sun, moon | Its own size, with a clear edge | Upper left, above the box |
| Ridges, five layers | 3600 wide each, with a clear edge above | Centred on the box, so the crossing sits behind it |
| Lake, with the ridges' reflection | 3600 wide | Under the ridges, down to the bottom |
| Left bank, right bank | About 700×400 and 300×200, with a clear edge | The bottom corners |

Each layer in each of the four lights, as PNG or WebP at 2x with transparency, plus the layered working file. If one drawing recoloured in code can give all four lights, even better: say which parts can be recoloured.

## 2. The bird

Berry is a small round bird the colour of a blueberry, with the fruit's crown as its crest. It is "it".

- **Shape:** a round body like the fruit. A darker wing low on its side, a short darker tail, and a crest of three points on top, the blueberry's crown. A small orange beak in two tones, orange legs, and one white eye with a big dark pupil and a catchlight. In profile, facing right. Friendly, capable, a little dry. Not a baby, not a sticker.
- **No outline and no rim.** Shape comes from colour: the wing, crest and tail are darker steps of the body.
- **Colour:** body `#3558dc`, its lit side `#6f8ef0`, its far side `#16277f`, wing `#1b309a`, crest and tail `#12227a`, beak `#ff9a2e` and `#e07a1f`, legs `#d9731c`, pupil `#10142e`. Saturated. A pale, dusty bird was tried and turned down.
- **Grain:** at 32px and up, the body has the valley's fine grain, following the light from the upper left. Smaller, flat colour.

**Sizes:**

| Size | Drawing |
|---|---|
| 16–20px | Body, crest, beak and one larger eye. Flat colour. The crest's three points must still read |
| 24–31px | The same with the wing. Head tilt and eye may show a mood |
| 32px and up | Full, with legs and grain. Most often seen at 30, 42, 50, 58 and 76px |

**Moods,** each recognisable from its outline alone:

| Mood | Pose |
|---|---|
| At rest | Perched, blinks now and then |
| Sitting | On an edge, legs hanging and swinging |
| Curious | Leans in, head cocked, eye on something |
| Thinking | Head back, eye up, crest twitching |
| Fetching | In flight, wings beating |
| Asking | Faces you square on, two eyes, head a little to one side |
| Delivered | Chest out, a small folded note in its beak (`#fffaf0`), heavy-lidded and a bit smug |
| Oops | Slumped, crest drooping, a feather falls |
| Off duty | Fluffed up asleep, crest flat |

Also: a very small flying bird, about 30px, still clearly this bird, for one working far off over the ridges, and a few frames of taking off and landing.

**The flock.** Other birds are the same drawing in another colour, so every fill has to be a named part: body, lit side, far side, wing, crest and tail, beak. The colours are in DESIGN.md under Tokens. Each may also wear one accessory on its head, in front of the crest: a crown, a cap, glasses, headphones or a bow, each with a front view for Asking. They have to tell birds apart at 16px.

**What to hand over:** SVG, one per mood per size class, with the parts named as above and the same layer order in every mood, so they can be animated and recoloured in code.

## 3. Later

- **Places on the shore.** About eight small built things for the far shore and the lake, in the valley's grain: a jetty, a boathouse, a birdhouse on a post, a buoy, and four more of that kind. Each about 40–70px, each with a window or lamp that can be lit, and room for a bird on top.
- **The valley's year.** The same place through the seasons, as layers over the same drawing: spring flowers on the banks, taller summer reeds, autumn seed heads, winter frost on the shaded shore. And a handful of small changes from day to day, such as a different cloud or mist on the far water.

## Don'ts

- No spiky or angular mountains.
- No outline, rim or glow round a bird.
- No dusty, greyed or pastel palette.
- No purple gradients, sparkles, glass or anything that looks generated.
- Nothing bright, sharp or detailed behind the box or under the top bar.
- No text, logos or people in the scene.
