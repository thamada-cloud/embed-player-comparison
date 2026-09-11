# Embed Player Comparison

Real, live third-party embed players, for a user-preference test. Two pages over
one shared registry. No build step, no dependencies.

| Page | For |
| --- | --- |
| `index.html` | **One at a time, all 50.** The session stimulus. Step through players, counterbalance the order, one frame mounted so audio cannot overlap. |
| `gallery.html` | **All 50 on one page, no filter.** Scroll through everything for internal review, screenshots and eyeballing the whole field at once. |
| `analysis.html` | **Measured comparison.** Every player scored across 11 dimensions, with the numbers, the visual comparisons and what I would conclude. |
| `widget.html` | **Our own widget prototype**, built from the Figma Audio Widgets frames. Two sizes, podcast and live radio, fully interactive, with a waveform driven by the real audio. |

## Files

- `players.js` holds the player registry and every shared helper. **All three
  pages read it, so adding a player appears everywhere.** This is the only file
  to edit when changing the roster.
- `measure.py` measures every player and writes `measurements.js`. `analysis.html`
  renders that data. See **Measuring** below.
- `export-players.js` flattens `players.js` into `.players.json` for the harness,
  so the measurements can never drift from the real registry.
- `shared.css` holds the chrome and card styles both pages use, so a player looks
  identical on either page.
- `index.html` and `gallery.html` hold only their own layout and behaviour.
- `.nojekyll` is required for GitHub Pages to serve the files as-is.

## The one-at-a-time page

- **One player at a time.** Previous and next, arrow keys, or the jump list.
- **Content toggle.** Live radio or podcast. A platform with no live radio product
  shows its podcast player and says so on the card.
- **No filter.** All 50 players, always. The jump dropdown lists every one,
  grouped by category for navigation.
- **Width selector.** Phone, tablet, full. Embed responsiveness varies sharply
  between platforms and is one of the things participants react to.
- **Theme toggle.** Applies each platform's own dark or light parameter where one
  exists.
- **Shuffle order.** Counterbalance across participants so the first card seen
  does not always win.
- **Moderator notes.** Collapsed by default so the participant does not read the
  caveats before forming an opinion.

Only one iframe is ever mounted. Navigating destroys the previous frame rather
than hiding it, which is the only reliable way to stop cross-origin audio.

The page chrome is deliberately neutral graphite, not iHeart red. A page that
echoes one contender's brand colour biases the comparison.

## The gallery page

Every player, always. No filter, no headings, no jump bar: open it and scroll.

**A card is a service name and the player. Nothing else.** No status chips, no
caveat bars, no notes. Everything that explains a player lives on `index.html`,
which is the page for reading a player rather than looking at it. Blocked entries
are the one exception, since with no embed to show, the one-line reason is all the
card can carry.


- **Content and theme** work the same as the other page.
- **No per-card chrome.** If you need to know why a card shows different content,
  or what its caveats are, open the same player on `index.html`.
- **Columns** switches between 1, 2 and 3. One column is a centred stack.
  Multi-column uses CSS columns rather than grid, because player heights range
  from 100px to 740px and grid rows size to the tallest card, leaving large dead
  gaps. Reading order in multi-column is down, then across.
- **Silence all** rebuilds the page, destroying every iframe. With 36 live
  players there is no way to detect or stop playback inside a cross-origin frame,
  so unmounting is the only reliable kill switch. Scroll position is preserved and
  frames re-mount as they come back into view.
- **The loaded count** shows how many frames are live, so it is clear why the page
  gets heavy as you scroll.

The frame outline is a `box-shadow` ring, not a `border`. This matters: a 1px
border adds 2px outside the reserved min-height, so every frame grew 2px on mount
and the page crept downward by 2px per card, reaching 51px of drift by the bottom.
A ring paints identically at zero layout cost.

Frames mount lazily. This page is 36 live player frames,
several of them full single-page apps, so mounting them all at load would be
brutal. Each card reserves its frame's exact height before mounting, which is
what keeps the page from shifting under the scroll. Verified at 1, 2 and 3
columns: all 36 mount on a full scroll with zero cards drifting more than 4px.

## Content

| Arm | Content |
| --- | --- |
| Live radio | Z100 New York (WHTZ-FM) |
| Podcast, Stuff You Should Know | "Social Identity Theory: Your Group Rules, Others Drool" |
| Podcast, Crime Junkie | "UPDATE: The Sodder Children" |

**The Show toggle picks the podcast.** Six players carry the exact same Crime Junkie
episode: iHeartRadio, TuneIn, Apple Podcasts, Spotify and Deezer play it, and
YouTube plays a different Crime Junkie episode from their own channel because the
target one is not posted there.

Every other player has no Crime Junkie entry and **falls back to Stuff You Should
Know with a visible note saying so**, rather than quietly showing the wrong show.

Crime Junkie IDs, all resolved from free public endpoints and render-checked so the
frame really shows that episode:

| Platform | ID |
| --- | --- |
| iHeartRadio | show `29319113`, episode `343319869` |
| Apple Podcasts | show `1322200189`, episode `1000787219983` |
| Spotify | show `3DgfoleqaW61T2amZQKINx`, episode `3OxGBFEZ5mUzXC1pG0kX2d` |
| Deezer | podcast `679102`, episode `930917952` |
| TuneIn | programme `p1086263` |
| YouTube | `q9Uv9QkDlCU`, a different episode |

Two notes for anyone extending this. The Spotify show id is not discoverable from
Spotify itself without auth, but `crimejunkiepodcast.com` links to it, and its
oEmbed title confirms the show. And **Crime Junkie is Simplecast-hosted**, which
looks like it should let the Simplecast card carry the real thing, but the RSS guid
is not Simplecast's player id and that player answers "Audio Not Found", so
Simplecast keeps its stand-in content.

### Adding another show

Add an entry to `SHOWS` in `players.js` with its own mode key, add that key to the
`modes` of any player that carries it, and add the key to `FALLBACK`. The toggle
and the fallback notes are generated from `SHOWS`, so no page code changes.

Verified per-platform IDs for that episode.

| Platform | ID |
| --- | --- |
| iHeartRadio | show `26940277`, episode `343040435` |
| Apple Podcasts | show `278981407`, episode `1000787615438` |
| Spotify | show `0ofXAdFIQQRsCYj9754UFx`, episode `6naVnsbI9VWEMSrqnJpIEI` |
| Deezer | podcast `1845`, episode `929240302` |
| Omny Studio | show slug `stuff-you-should-know-1` |
| TuneIn | live station `s340698`, program `p295446` |

## Scope groups

**Core.** Same station and same episode in every player. This is the
only valid comparison set for a content question.
iHeartRadio, TuneIn, YouTube, Apple Podcasts, Spotify, Deezer, Omny Studio.

**Hosts.** Podcast hosting players. Each only serves shows it hosts,
so the content differs. These are what publishers actually embed, which makes them
the most relevant chrome comparison even though the content cannot match.
Megaphone, Acast, Captivate, Transistor, Simplecast, Audioboom, Spreaker,
Podbean, Buzzsprout, Blubrry, Castbox.

**Other.** Other audio and video embeds, different content, form
comparison only.
Tidal, NPR, Mixcloud, Audiomack, Bandcamp, SoundCloud, Zeno.fm, Vimeo, TikTok.

**Infra.** White-label and enterprise player infrastructure. Useful for
deciding what our own player chrome should look like, not consumer brands anyone
has an opinion about. Keep them out of a participant session.
Wistia, Streamable.

**Blocked.** Cannot be embedded at all. Kept visible with the reason.

## Cannot be embedded

Every one of these was probed twice, the second time with browser iframe request
headers (`Sec-Fetch-Dest: iframe`), because a plain request produces false
negatives on some hosts.

| Platform | Reason |
| --- | --- |
| Amazon Music | X-Frame-Options SAMEORIGIN |
| YouTube Music | X-Frame-Options SAMEORIGIN. Use the YouTube card for the same audio. |
| Pocket Casts | X-Frame-Options SAMEORIGIN. The WordPress block renders a custom player, not an iframe. |
| Radio.net | CSP frame-ancestors allows only its own CMS domains |
| Live365 | X-Frame-Options DENY |
| Pandora | No public embed exists. oEmbed 404s. |
| SiriusXM | Subscriber-login app, no embed product |
| Global Player | X-Frame-Options SAMEORIGIN. Covers Capital, Heart, LBC, Classic FM. |
| Audacy | SAMEORIGIN for third parties. Its embed is Creator Lab only, for content you own. |
| BBC Sounds | No embed product, and UK geo-restricted |
| Substack | No outbound podcast embed |
| Streema | No embed product |
| Radio Garden | No iframe player. Their content API is public if you want to build your own. |
| Radio France | X-Frame-Options DENY |

## Frame sizing and corners, and who causes what

**The gallery imposes no width.** An embed takes the width of whatever it is
dropped into, so the page hands each player the window and lets it answer for
itself. Earlier builds capped the single column at 760px and the page at 1400,
and both numbers were invented rather than taken from any player. They also
quietly decided the thing the page exists to ask: Spotify and Apple Podcasts
change layout somewhere around 600 to 700px, so a fixed 760 put every player in
the same form at every window size. Measured after the caps came out, one
column: 1880px at a 1920 viewport, 984 at 1024, 350 at 390, with no horizontal
overflow at any of them. Two and three columns divide the same full width, 931
and 615 at 1920.

Heights are a different matter and stay per player, since an embed really does
declare its own height and the registry records the real one for each.

Two things worth recording, because both looked like our doing and only one was.

**The corners are ours.** Measured across every player: **not one rounds its own
outer frame.** Four round an inner card (Acast 8px, Transistor 8px, Captivate 6px,
SoundCloud 4px) and that shows through on its own. The gallery therefore uses
**square** corners, so a frame shows the player's true shape rather than a shape
we invented. Restoring rounding is one line in `gallery.html`.

**The dead space under some players was mostly ours.** Comparing each declared
frame height against the bottom of the player's own last painted pixel found:

| Player | Was | Now | Cause |
| --- | --- | --- | --- |
| Castbox | 500 | 210 | ours, 300px of empty frame |
| NPR | 290 | 215 | ours, 83px |
| Blubrry | 200 | 172 | ours, 36px |
| Apple Podcasts | 175 | 165 | 15px was the player's own internal whitespace |
| Megaphone | 200 | 374 | ours, was clipping the player |
| Audioboom | 200 | 300 | ours, was clipping |
| Audiomack | 252 | 266 | ours, was clipping |
| SoundCloud | 300 visual | 166 compact | the visual variant needs 605px |
| TuneIn podcast | 350 fixed | 350, scrolls | a 1352px episode list, now scrolls internally |

After those corrections the only remaining gap under any player is Audiomack's
own 14px.

**Do not chase these two.** Tidal reports 304px of content below the fold at every
frame height, and YouTube and Spotify report overhangs of 228px and 38px. Those
are hidden or absolutely positioned panels, not clipping. All three render
complete at their documented heights.

## Autoplay

Measured across every player with the browser's real autoplay policy, no override:
each frame is mounted, left alone, and its media elements checked twice to see
whether playback time actually advances.

**Only TikTok starts on its own, and only muted.** That is genuinely TikTok's
default state, and it is never granted the `autoplay` permission, so it can never
gain sound. Every other player sits idle until clicked.

30 players still carry `allow="autoplay"`. That is harmless: the permission only
governs playing *without* a user gesture, and none of them do. A click inside a
frame is a gesture, so click-to-play does not need it.

## The widget prototype

`widget.html` is a separate page and a different kind of thing from the other
three: not a survey of other people's embeds, but a working build of ours, from
Figma `Audio Widgets` nodes 2524:126999, 2526:135968, 2526:142928 and 2527:144307.

**Both widgets are on the page at once**, podcast and live radio, each with its
own search. Playing one pauses the other.

**There is no size switch.** Each widget sizes itself from its own width using
`@container`, not `@media`. The layout **steps** between the two frames rather
than interpolating: the artwork holds 64px until the widget crosses 560px, then
holds 132px, and type does the same. An earlier version scaled it continuously
in `cqw`, which produced sizes appearing in neither frame and read as wrong at
every width in between.

**Podcast type comes off frame 2526:135975**, which is worth stating because it
is easy to guess wrong: title 16/24 SemiBold and subtitle 14/18 Regular at the
wide size, both at -0.2 letter spacing, and 14/18 with 12/16 at the narrow size.
An earlier pass assumed 20/24 and -0.4 for the wide title, which made it
noticeably larger than the design.

**Waveform bars keep the design's width and grow in COUNT.** Figma uses 3px bars
at 350 and 4px at 1280, so flexing a fixed 70 bars across a wide widget ballooned
them to 15px, several times the design. The bar width is now fixed and the count
is derived from the container, rebuilt on resize with the 70 design heights
resampled across it. At 350 that lands on exactly 70 bars and at 1280 on 213,
which is precisely what the 1280 frame shows once its 280-bar strip is clipped.

**Station artwork sits on white.** Station logos are transparent PNGs drawn for a
white tile; left on the dark header the mark loses its edges. Container queries are the right tool here because an
embeddable widget has to respond to the slot it is dropped into, which is not
always the viewport. Below 560px the artwork sits beside the text with controls
on their own row beneath; above it the artwork spans the full height beside both,
which is what the 1280 frame does and what the narrow layout cannot express
without overflowing the 180px player. Artwork and type scale with `cqw` between
the two frames' values, so 350 and 1280 land on the design's numbers and every
width between is interpolated.

### Search

Both widgets search the live iHeart API and load anything you pick.

| Need | Endpoint |
| --- | --- |
| Podcasts | `/v3/search/all?...&podcast=true` |
| Stations | `/v3/search/all?...&station=true` |
| Show detail and artwork | `/v3/podcast/podcasts/{id}` |
| Episode list | `/v3/podcast/podcasts/{id}/episodes` |
| **Episode audio** | `/v3/podcast/episodes/{id}` |
| Station stream and logo | `/v2/content/liveStations/{id}` |

**The episode-audio row is the one that matters.** The episode *list* returns
`mediaUrl: null` for every item; the *single episode* endpoint returns it
populated. Miss that and the search looks broken for podcasts.

Everything in that chain was checked for CORS before the build, because all three
of the features here depend on it: the API responses, the audio (so the analyser
can read samples) and the artwork (so the canvas is not tainted and the colour can
be extracted). All of it answers with `Access-Control-Allow-Origin`, which is why
nothing is proxied or hosted.

### The colour treatment

The header is the artwork's dominant colour with **60% black** over it, authored
the same way Figma authors the fill, as two stacked gradients:

```css
background-image:
  linear-gradient(90deg, var(--overlay) 0%, var(--overlay) 100%),
  linear-gradient(90deg, var(--dominant) 0%, var(--dominant) 100%);
```

### Does 60% still pass contrast

Both header text styles are **normal** text for WCAG, not large: 14px semibold is
under the 18.66px bold threshold and 12px regular is well under it. So the bar is
**4.5 for AA and 7 for AAA**, against `#f6f8f9` text.

The widget computes this live and shows the ratio and verdict under each player,
so it stays checkable for any artwork rather than being asserted once.

**Measured against 12 real catalogue artworks, 60% passes AA and AAA on all of
them.** The tightest is Atlanta Monster at `#eac5a8`, which lands on 7.37 to 1.

Light artwork is where it gets close, so the theoretical limits are worth knowing:

| Artwork | 60% | 70% |
| --- | --- | --- |
| Pure white, if one ever got through | 5.39, AA only | 7.94, AAA |
| Bright yellow | 5.69, AA only | 8.29, AAA |
| Near white but saturated | 5.63, AA only | 8.26, AAA |
| Atlanta Monster, the lightest real one | 7.37, AAA | 9.9, AAA |

**60% never fails AA.** The AA floor for pure white artwork is a 56% overlay, so
60% keeps a 4-point margin even in the worst case. What 60% gives up is **AAA on
very light artwork**, which 70% held everywhere.

Two things keep this from biting in practice. The extractor drops near-white
desaturated pixels, so a white tile yields its brand colour rather than white.
And light *and* saturated artwork is rare, which is why none of the 12 real
samples fell below AAA.

If AAA matters, the robust fix is not a bigger fixed number but an adaptive
floor: compute the overlay each artwork needs and take the larger of that and
60%. `overlayNeededFor()` already does that calculation and drives the "AA floor
for this artwork" note in the readout.

`--dominant` is extracted from the artwork in the browser at load. **A plain
most-common-pixel reading is wrong for logo art**: the Z100 tile is 78% white
padding, so the most common colour is the background, not the brand. The
extractor therefore drops near-white and near-black pixels first and takes the
most populous remaining bucket, falling back to the raw mode for genuinely
monochrome art. Results against the design:

| Artwork | Extracted | After the 70% black | Figma's value |
| --- | --- | --- | --- |
| Las Culturistas | `#161824` | `#07070b` | `rgb(25,27,40)` = `#191b28` |
| Z100 | `#e70588` | `#450229` | dark maroon |

The header shows both swatches live, so the treatment is inspectable rather than
asserted.

### The waveform really is the audio

70 bars at 350, 280 at 1280, four per design bar. Their resting heights are the
design's own waveform, read off the Figma frame, so the idle state matches the
mock. On play they are driven by a Web Audio `AnalyserNode` reading the real
stream, and on pause they ease back to the resting shape.

**Bars are frequency bands measured in hertz, not a slice of the FFT array.**
The first build read one bin per bar, spread across a fixed fraction of the
bins with a power curve. That was wrong twice over. A fraction of the bin array
is a fraction of the Nyquist rate, so the strip covered a different range of
frequencies depending on the listener's sample rate, and the curve put the whole
right half of the strip above 5kHz, where recorded music and speech carry almost
no energy.

The second part is what made it look broken, and it only appears at a normal
sample rate. Headless Chrome opened the context at 24kHz here, which halves
every frequency and hid the fault; forcing the 48kHz a real machine runs at
reproduced it exactly. On live music with the old mapping, **119 of 213 bars
never moved**, the right third averaged 6.2px of a 16px scale, and the left
third sat pinned at 16.0 with 0.5px of movement.

Each bar now owns a log-spaced band between 40Hz and 11kHz, takes the loudest
bin in that band rather than a single sample, and carries a gain that rises with
frequency, since the spectrum of almost all material falls with it. `fftSize` is
2048 rather than 512, because the bass bands need bins narrower than the bands
themselves. Same audio, same 48kHz context, after: **no dead bars at all**, mean
heights of 10.4, 10.5 and 10.4 across the three thirds, and movement spread over
the whole strip.

**Bars rise from the bottom edge with rounded tops.** This is easy to get
backwards and the first build did. Figma authors the bars as `items-start` with
`rounded-bl`/`rounded-br`, inside a wrapper carrying `-scale-y-100`. Read the bar
styling on its own and you produce the mirror image, bars hanging downward with
rounded bottoms. The flip is baked into the CSS here rather than re-applied as a
transform, so the bar heights stay directly readable.

That only works because the browser is allowed to inspect the samples, which
needs CORS on the audio itself. Both sources were checked before the build: the
Omny podcast mp3 and the iHeart HLS stream each return
`Access-Control-Allow-Origin` through their whole redirect chain. **That is why
no audio is hosted in this repo** and why `crossOrigin="anonymous"` is set. Live
radio is HLS, played natively in Safari and through hls.js elsewhere.

The FFT is mapped across the bars on a mild power curve. A linear map leaves the
right half of the strip dead, because speech and music put nearly all their
energy in the low bins.

### Two deliberate deviations, both flagged in the UI

### Spacing is measured, not eyeballed

Every gap here came off the frames. Three that were wrong in an earlier build and
are worth knowing, because each looks plausible until measured:

- **The row gap is 16px everywhere, not 21.** The podcast frame's title block
  starts at y=5 and ends at 51 with controls at 67. The 5 is padding above the
  title, not part of the gap. Counting it twice pushed the whole lower half down.
- **Cache guards must test the DOM, not remembered state.** The bar rebuild was
  skipped when the new count matched `w.bars.length`, but loading new content
  replaces the widget's markup, leaving an empty `.wave` while `w.bars` still
  pointed at the old detached bars. At an unchanged width the counts matched, the
  rebuild was skipped, and the waveform vanished on **every** content switch, in
  both widgets. The guard now compares against `wave.children.length`.
- **The list header is a 32px row**, not the 18px of its own text. It carries a
  32px Buttons frame beside the label, so rendering it at the text's line-height
  closed the gap under "Episodes" by 14px. It also needs `flex: 0 0 32px`,
  because as a flex item in a fixed-height column it was being shrunk back.
- **Play to controls is 16px and the groups are centred on each other.**

### Live radio is its own layout, not the podcast minus parts

The live frames were revised after the first build and now differ structurally:

- **Three metadata lines, not two.** Track title in Regular 14/18, artist in
  SemiBold 14/18, then the station line in Regular 12/16. Note the weighting is
  the reverse of the podcast, where the title is the SemiBold one.
- **One line when nothing is playing, at the podcast title's size.** The
  station line carries the block on its own in that state, so it renders at
  16/24 SemiBold wide and 14/18 SemiBold compact rather than the 12/16 it uses
  as a third line under a track and artist. This is a deliberate step past the
  frame, which drew the state at 12/16. The group is centred, so the larger
  line simply re-centres, 16px above and 16px below inside the 132px artwork.
- **One line when nothing is playing.** Talk stations return an empty track
  history (KFI, WOR and WTAM all do), so the two now-playing lines are dropped
  entirely and only the station line shows. Falling back to the station name on
  the artist row just repeated what the line below already said. Gaining or
  losing a track re-renders, since it changes how many lines the block has.
- **Now playing comes from `currentTrackMeta`, the endpoint iheart.com polls.**
  `/v3/live-meta/stream/{id}/currentTrackMeta?defaultMetadata=true`, every 5
  seconds, which is what `getCurrentTrackMeta` does in
  `packages/playback/src/player/subscription/jw-player.ts` in `iheartradio/web`.
  200 with a body is the track on air, 204 means nothing is on air right now,
  and 404, 410 or 424 mean the station has no metadata service, so the widget
  stops asking it, exactly as the production player does.

  `defaultMetadata=true` is not optional. Without it the same stations answer
  410 rather than 200, because third party listening is disabled on them.

  **`trackHistory` was the wrong source, and it was wrong in both directions.**
  It is a log of songs, not a statement about the present. Taking its newest
  entry showed songs that had finished minutes earlier: on seven stations at one
  moment, three were serving a track that had already ended, by 2 to 11 minutes.
  Filtering that entry by its own `startTime` and `endTime` fixed the stale ones
  but introduced the opposite fault, blanking tracks that really were playing,
  because the log lags and skips. Measured against `currentTrackMeta` across six
  stations, the history covered only 21% to 80% of wall clock time, and 3 of 18
  samples had a song genuinely on air that the history had not recorded at all.
  With the current endpoint the widget matched it 6 times out of 6.

- **A 204 leaves the line alone.** Stations are between songs a large part of
  the time, through spot breaks, live reads and talk. Sampled across 20 stations
  at one instant, 13 answered 204. Clearing the line on every 204 meant it spent
  most of its life empty. The production player does not clear it either:
  `setCurrentTrackMeta` spreads the response over the existing meta and
  preserves a `Track` type that is already set, so a 204 leaves what is on
  screen alone. The line now holds the last track the station actually reported
  and is reset only by loading a different station, so it can still never
  resurrect a song from before the widget was opened, which was the original
  fault with `trackHistory`.

  204 really does mean nothing is on air, checked rather than assumed: on every
  station answering 204, the newest `trackHistory` entry had expired minutes
  earlier, by 8 to 36 minutes on the sample. And where the two sources disagreed
  the other way, `currentTrackMeta` was the correct one: KROQ reported Deftones
  as current while the history's newest entry was a Foo Fighters song that had
  ended 6 minutes before.

- **The poll follows the station, not the transport.** It starts when a station
  loads and runs while the tab is visible, whatever the play button is doing,
  which is what the production player does. Polling only during playback meant a
  station loaded during a commercial break showed no track for as long as it sat
  there, however long the song that followed ran. A station swapped out while a
  request is in flight discards that response rather than writing one station's
  track onto another.
- **No scrubber and no duration.** A live stream has no length, and the Slider
  instance is `hidden` in the frame.
- **Stop, not pause.** A live stream cannot resume where it left off, so the
  button becomes a stop and the position resets.
- **The control group centres on the play button.** With no scrubber above it,
  the frame puts the 32px group at y=14 of a 60px row, which is exactly centred.
- **One control group, left aligned.** Save, info and share sit at x=0 in the
  frame, not pushed to the far edge as in the podcast.
- **No list section.** The 1280 live frame is 180px tall with no List instance
  at all, so the live widget is the player and nothing else.
- **Station artwork on white**, since station logos are transparent PNGs drawn
  for a white tile.
- **Now playing is signalled by the episode title turning brand red**, not by a
  filled row. A filled bar reads as a selection state rather than playback.
- **Symmetric glyphs are centred geometrically, the play triangle is not.** The
  exported play path sits 1.67px right of the viewBox centre, which is correct:
  a triangle's visual mass leans left, so it is optically centred. Drawing the
  pause and stop to the play glyph's bounds inherited that offset and left both
  visibly off centre in the white circle. They now sit on 26.25 exactly.
- **The pause and stop glyphs are the only assets not exported from Figma.** No pause icon
  appears in these four frames, so both are drawn to the play glyph's height and
  corner radius but centred geometrically. Point me at the real nodes and it is a
  two file swap.

Everything else, including the iHeart logo, the transport icons and the artwork,
is the exported Figma asset committed under `assets/`.

### The shipping player sits at the top of the prototype page

The iHeart embed as it is served today, one podcast and one live radio, above
the four prototype cards. It is a live iframe from `iheart.com`, not a
screenshot, and it carries the same episode and the same station as the cards
below, so a comparison is like for like. A search swaps the matching embed too,
so the top row keeps up with whatever was last chosen of that kind.

They are stacked, never side by side. Two columns halved the width each embed
got, and width is the one thing a player's layout actually responds to, so the
baseline was being shown in a form the page never asks about. Each now takes the
full width, the same as the prototype cards below it, measured identical at
1440, 1024 and 430.

The URLs are built at runtime from the ids the page already fetched rather than
hard coded, which is the difference between a baseline that stays current and
one that quietly points at last year's episode. The slug in an iHeart embed URL
is cosmetic and the trailing numeric id resolves the content, checked rather
than assumed: a URL with the slug replaced by a single `x` returns the right
episode and the right station.

### The hero card, a second design on the same page

Frames 2512:113087 (podcast) and 2512:111965 (live radio), built alongside the
first pair rather than replacing them, so the two designs can be compared on one
page with the same content in both.

What is different about it.

- **The artwork is the background**, full bleed under the frames' own 70% black,
  rather than a dominant colour swatch under 60%.
- **One control.** A 64px brand red play button, `#c6002b`, centred on the card.
  No scrubber, no skip, no speed, no save, info or share.
- **The metadata is two lines at the top** beside a 40px thumbnail, and the two
  type styles swap roles between the frames. Podcast leads with the episode at
  12/16 Regular and puts the show under it at 14/18 SemiBold. Live radio leads
  with the station at 14/18 SemiBold and puts its line under it at 12/16
  Regular.
- **The waveform is the same shape at a smaller scale**, 2 to 12 rather than 3
  to 16, on 4px bars with a 1px gap. At the frame's 350 that is exactly 70 bars.
- **One layout at every width.** Only the 350 frame exists for this design, so
  the card holds that frame's 224px stage height rather than inventing a taller
  one for wide viewports. The readout above each card says so instead of naming
  a breakpoint it does not have.
- **The podcast card carries the same 220px episode list** as the other design,
  so that component is written once and used by both.

**Playing is a second state, not a second card.** Frames 2512:113298 (podcast)
and 2512:111876 (live radio) keep everything above unchanged and add the rest of
the controls around the red button, which becomes a pause or a stop.

- **Podcast, seven controls**, 8px apart: save, 1x, back 15, the red pause,
  forward 30, info, share. It also gains a scrubber above the waveform, in a
  column with the frame's 4px gap, with the elapsed and total times either side.
- **Live radio, five**: a spacer, save, the red stop, info, share. The spacer is
  in the frame as a playback speed button at `opacity: 0`, and it is there
  because two icons sit to the right of the red button and only one to the left,
  so without it the red button would not be centred. Reproduced as the frame
  has it rather than replaced with a margin.
- **The row is what is centred, not the button.** Idle simply hides every
  secondary control, which leaves the red one alone in the middle and gives back
  the resting frames exactly. Measured: the button's centre sits at the card's
  centre in all three states, idle, playing and paused.
- **The secondary icons are `#E6EAED`, not white.** The same glyphs in the first
  design's frames export as pure white; these export at `#E6EAED`, so both sets
  are committed rather than one being reused for the other. Back 15 and forward
  30 are white in both and are shared.

One export had to be overruled. The Figma component in the speed slot is named
`Web Internal / Podcast Playback Speed`, but the asset it exports is a play
triangle, its own root being `<g id="Web Internal / Play">`. What the frame
renders there is the text `1x`, so that is what is built, in the Caption 1 style
the frame lists, 14/18 SemiBold at -0.4. Exported assets are the rule; an export
that disagrees with the frame it came from is not one.

The pause and stop glyphs are now real exports too, `Web Internal / Pause` and
`Web Internal / Stop` at 56, which replaced the hand drawn pair the first pass
needed when no frame drew a playing state.

Measured against the frame at 350: stage 224, top bar at y=16, thumbnail 40,
play button 64 at `#c6002b` centred on both axes, waveform 12 tall flush to the
bottom edge, list 220, card 444 overall.

Two things the frames do not survive contact with.

- **A station's artwork is a transparent PNG.** The frames stack white, then the
  artwork, then 70% black, which is right for a podcast's opaque square. A
  station logo is drawn for a white tile, so the same stack leaves most of the
  card flat grey, which the mock never shows because the mock used an opaque
  image. The base is the artwork's own mean colour for live radio instead, so
  the card takes the station's brand colour where the logo does not cover.
- **The contrast readout means something different here.** Text sits over a
  photograph, not a flat colour, so the figure reported is the mean colour of
  the whole picture under the 70% scrim, and the page says as much: a light
  patch behind a word can still read worse than the average.

A third leak turned up in the scrubber. The hero's track needed a different
colour and a smaller touch padding than the first design's, and writing that as
`background: var(--ihr-grey-450)` reset `background-clip`, which is what keeps
the 2px line inside the padding. The whole 16px box painted grey and swallowed
the red elapsed fill. `background-color` is the only safe way to change one of
these.

Two class names from the first design leaked in during the build and both were
caught by measuring rather than by looking. `.thumb` is the slider's drag
handle, which is `position: absolute`, so the hero's thumbnail left the flex row
and the text ran underneath it. And `.widget.live .art` gives a station's
artwork a white plate and 4px of padding, correct for a 64px tile and wrong for
a full bleed background, which is what made the live card grey even after the
base colour was right. Its selector needed to outrank that one, not merely
follow it.

### The buffering ring is iheart.com's spinner

Geometry and timing come from `packages/accomplice/src/icons/loading` in
`iheartradio/web`: a circle of r=47 in a 100 viewBox, `stroke-linecap: round`,
`stroke-dasharray: 60 300` so the arc covers about a fifth of the 295 unit
circumference, rotating once every .75s, linear, stroked in gray300 `#a9afb2`.

**How it is mounted matters as much as how it is drawn**, and is the part a
first pass got wrong. In `button.tsx` a pending icon button renders the loader
through `LOADER_BOX_PROPS_ICON`: `position: absolute`, inset 0, width and height
100%, laid over the button with the glyph still visible underneath. So the ring
is the button's own diameter with a stroke of 8/100 of it, 4.8px on this 60px
button. The first version sat 7px outside the button with a 3.3px stroke, on the
theory that the site's weight should be preserved from its 24px render, and it
read as a different spinner because it was one.

**What raises it is derived from the element's state, never latched by an
event.** Driving it from `waiting` and `stalled` put the ring up when nothing
was buffering: live radio fires `stalled` while playing perfectly well, and
stopping a live stream resets `currentTime`, whose `seeking` raised the ring
with no later event left to clear it. The only honest question is whether the
listener asked for audio and is not getting it, so the state is
`want && (paused || readyState < HAVE_FUTURE_DATA)`, re-asked on every event
that could change the answer.

**A 350ms delay is the other half.** Audio that starts promptly should never
flash a spinner. Measured: a synthetic `stalled` during playback does not raise
it, stopping live radio leaves it down, and a genuine load raises it at 0.38s
and clears it at 1.52s when sound starts.

The flag lives on the widget object rather than in the markup, because a
re-render would otherwise drop the ring mid-load.

### Long text marquees on hover, on pointer devices only

Every clipping line of text (both widget titles, both subtitles, the live
now-playing pair, and the episode rows) ellipsises exactly as before. On a
device with a real pointer, hovering a line whose text does not fit scrolls it
so the rest can be read, then returns.

Three details matter.

- **Only when it actually overflows.** The `.over` class is applied from a
  measurement of `scrollWidth` against `clientWidth`, re-run on every render and
  on every resize, because the same string fits at one widget width and not at
  another. Applying the animation blindly makes short lines twitch on hover.
- **The inner span stays `inline` until hovered.** `text-overflow: ellipsis`
  and an `inline-block` child do not reliably agree, so the span only becomes
  `inline-block` (and the box switches to `text-overflow: clip`) inside the
  `:hover` rule. The resting state is untouched.
- **Gated on `(hover: hover) and (pointer: fine)`.** Touch has no hover state,
  so a phone keeps the ellipsis rather than inheriting an animation it can never
  trigger. `prefers-reduced-motion` disables it as well.

## Deploying

**Use `./deploy.sh "commit message"`.** It stamps a fresh version onto every asset
reference, commits, pushes, then waits and confirms Pages is actually serving that
version.

The stamp is the point. Nearly all the content lives in `players.js` and
`measurements.js`, and GitHub Pages serves them with `cache-control: max-age=600`.
A browser will therefore use its cached copy for **up to ten minutes without
asking the server**, so a reload looks like it did nothing: the HTML is fresh but
the data behind it is not. This bit us once, with a YouTube content swap that was
correctly deployed and invisible in the browser.

Versioning each reference makes every deploy a new URL, so there is nothing stale
to serve and no hard-reload ritual. `deploy.sh` bumps it automatically so it cannot
be forgotten. Do not hand-edit the `?v=` values.

## Ordering

**Page order is registry order.** Both pages render `PLAYERS` top to bottom exactly
as written in `players.js`. To move a player, move its object.

It did not always work that way. Rendering used to iterate the scope groups and
filter by them, which meant position on the page was a side effect of a player's
group. Putting Tidal below Deezer was then impossible without relabelling Tidal as
"Core", which would have been false: it plays an unrelated music track. Group is
now metadata only, still shown in the analysis matrix, and never a layout rule.

## Removed for not loading or not behaving

- **Brightcove.** Its player returns `VIDEO_CLOUD_ERR_VIDEO_NOT_FOUND` for every
  public demo account and video id found. Unfixable without our own account.
- **Twitch.** Renders "Twitch is offline". Live status is not something a stimulus
  page can depend on. Can come back pointed at a 24/7 channel if wanted.
- **Odysee.** Renders "No Content Found" even with a freshly resolved, valid claim
  id pulled from their own API. Its embed does not work for third-party content.
- **Libsyn, Apple Music, iVoox.** Removed by request, not for any fault. Apple
  Music worked but needed a subscription to play anything; Libsyn and iVoox both
  rendered fine.
- **Dailymotion.** Autoplays **with sound** and cannot be stopped. `autoplay=0`
  and `autoplay=false` are ignored on both `geo.dailymotion.com/player.html` and
  the legacy `/embed/video/` path, because that setting lives on their player
  server-side, not in the URL. Withholding the `autoplay` permission removes the
  sound but substitutes a "click to unmute" overlay, which is not its default
  state either. **There is no way to show Dailymotion in a default paused state**,
  so it cannot take part in a default-state comparison. YouTube and Vimeo both
  idle correctly and cover video.

**Streamable** was **wrongly** flagged as broken by an early heuristic and is still
in: it renders a real video element. A `textLen` test cannot judge a video player
or a shadow-DOM player. `diagnose.py` now judges on error signals and near-empty
renders instead. (Apple Music was cleared the same way, then later removed by
request.)

## Zeno.fm and the live radio arm

Live radio is the thin arm of this comparison. Only iHeart and TuneIn have a real
public live radio embed for a station we do not own. Zeno.fm is the one meaningful
addition, and it is worth knowing why.

It is free, needs no ownership, and its station API at `zeno.fm/api/stations` is
public. It carries real broadcast brands, including ESPN Radio KVSF, BBC World
Service, France Inter, France Info and ABC Newsradio. BBC World Service is the
interesting one, because BBC Sounds itself refuses framing.

The card ships pointed at ESPN Radio KVSF, a real US commercial broadcast station
and the closest competitive analogue to Z100 in the roster. Swap the slug to
change station.

One trap. The Zeno player URL returns 200 for any slug, real or fabricated, at an
identical byte length. Confirm a station by loading the frame and checking it
mounts an `audio` element, never by status code.

## Known limits

- **Tidal needs a subscription and a signed-in browser.** Keep it out of any
  listening-preference question: a signed-out participant measures the paywall,
  not the player.
- **YouTube shows different content, deliberately.** Its podcast card is a KFI AM
  640 clip, "Gary Hoffmann Slams MLB's Netflix Debut", 2m46s. KFI is an iHeart
  station, so this is real iHeart content rather than a third-party stand-in, but
  at 2m46s against a 47 minute episode elsewhere, do not compare its progress bar
  or timecodes with the other cards. Its live card is Times Radio, a real broadcast
  station simulcasting 24/7, because no iHeart station simulcasts live on YouTube.
- **Twitch only works on a real domain.** It reflects `parent=` into
  frame-ancestors, so the card is blank when the page is opened from a local file.
- **Castbox does carry Stuff You Should Know** but its embed id was not resolvable
  from any public endpoint, so that card uses a different channel.

## Investigated and rejected

Kept here so nobody re-runs the same research.

- **Reddit** and **JW Player** both frame and technically paint, but too thinly to
  distinguish a real player from an error state, and Reddit's JSON API returns 403
  so a real post id could not be pinned. Left out rather than shipped unverified.
- **Art19** is the most competitively relevant thing still missing, Amazon-owned and
  a direct rival to Omny. Its show slugs 404 and no public listing was found.
- **RedCircle** (403) and **Fireside** (404) both failed on the only IDs available.
- **Rumble** frames but needs a real video id, which its listing pages do not expose.
- **Triton / StreamTheWorld** is the streaming infrastructure many US broadcast
  stations actually run on, and so the highest-value unknown. The player host tried
  does not resolve.
- **Google Podcasts** folded into YouTube Music, **Stitcher** into SiriusXM,
  **RadioPublic**'s domain is dead, **Breaker** and **Chartable** are gone.
- **Social surfaces** (Instagram, X, Facebook video, Bluesky) were all verified as
  frameable and painting, but deliberately left out. They answer a different
  question, which is where clips get distributed rather than where episodes get
  played.
- **International music** (Boomplay, Anghami, JioSaavn, Qobuz, Beatport) was not
  probed. Worth doing only if reach outside the US matters.

## Adding a player

Add one object to `PLAYERS` near the top of the script. Nothing else changes.

```js
{
  id: 'example', name: 'Example', status: 'ok', group: 'other',
  allow: 'autoplay; encrypted-media',
  modes: {
    live:    { src: 'https://...', h: 200 },
    podcast: { src: 'https://...', aspect: true, caveat: 'Different content.' }
  },
  facts: { 'Content': '...', 'Sign-in': '...' }
}
```

- `status` is `ok`, `caveat` (iframe plus a visible warning), or `blocked` (no
  iframe, shows `why` and `detail` instead).
- `modes` takes one entry per content type. Omitting `live` makes that player fall
  back to its podcast entry with a visible note.
- `h` is a fixed pixel height. Use `aspect: true` for a 16:9 video frame. Heights
  are per player on purpose, they range from TuneIn's fixed 100px to Spotify's
  352px card, and forcing a common height would misrepresent every player.
- `themed: true` substitutes `{theme}` in the src with the page theme.
- `needsParent` players substitute `{host}` with the current hostname.

Before trusting a new entry, verify it two ways. A 200 response proves nothing:
Vimeo, Bandcamp and Simplecast all return 200 for content that cannot play. Use
the platform's oEmbed endpoint where one exists, then confirm the frame actually
paints.

## Measuring

`analysis.html` renders baked data, not live readings, and it has to.

Every player is a **cross-origin iframe**, so no published page can read inside
one. Playwright can, because it drives the browser rather than living in the page.
So the numbers are measured offline and written to `measurements.js`.

```bash
node export-players.js          # players.js -> .players.json
python3 -m http.server 8899     # measure.py needs the host page served
python3 measure.py              # all players, roughly 25 minutes, replaces the file
python3 measure.py youtube      # just one, MERGED into the file, under a minute
```

**Partial runs merge.** Naming ids re-measures only those and folds them into the
existing data, so swapping one player's content no longer costs a full run. A full
run still replaces everything, and either way any player no longer in the registry
is dropped, so removals cannot linger as stale rows.

Serve on **localhost**, not `127.0.0.1`. Twitch reflects `parent=` into
`frame-ancestors` and special-cases `localhost` for any port; on a mismatched host
it refuses the frame and measures as empty.

### What is measured, and the traps in measuring it

- **Play button.** Candidates are scored, not taken first-match, and shadow roots
  are walked because Apple Music, Tidal and TikTok build controls inside them.
  Two bugs worth remembering: excluding any class containing `player` threw away
  the real controls (Megaphone's is `player__controls__play-btn`), and a strict
  "innermost element" rule discarded controls that wrap a tiny icon.
- **Theme response** is read from **actual pixels**, by rendering each frame twice
  under `prefers-color-scheme` and comparing mean brightness. Computed styles are
  useless here: every player's body background resolves to transparent.
- **Readings are accepted only after they stop changing** across three consecutive
  polls plus a minimum dwell. Breaking on first sign of life measured players
  half-rendered, and recorded iHeart's 166-bar waveform as absent.
- **A frame that rendered nothing is not a measurement.** Empty frames are marked
  not measured with a reason, rather than counted as a player with no features.
- **Page weight** counts one player mounted alone, so the figures belong to it.
  Transfer size is a floor: some responses do not expose their length.

Anything that could not be determined is recorded as null and rendered as "not
determined". Nothing is inferred to fill a gap.

## Verification

The page was verified with local headless Chrome driven by Playwright, which can
read into cross-origin frames and so can tell a real player from a silent blank.
The Claude Code browser pane blocks iheart.com, so it cannot be used to check the
iHeart cards.

**One-at-a-time page.** 100 checks across all 50 cards in both content modes,
**0 blanks**. All 36 embeddable players paint real content. All 14 blocked cards
mount no iframe and show their reason.

**Gallery page.** All 50 cards render on load with no interaction. All 36 frames
mount on a full scroll and all 36 paint, at 1, 2 and 3 columns. **0 cards drift
more than 4px** as frames mount. Silence all takes
the page to 0 iframes and preserves scroll position.

**Both pages.** Neither page filters anything: all 50 cards are reachable on load.
Every control exercised while capturing page and console errors.
**0 errors originate from our own code.** The two that do appear come from inside
third-party embeds, Captivate's own bundle and Audiomack's Next.js build,
confirmed by stack trace.

A note on how that last check came about. An earlier pass reported a clean run
while a real bug was live: the All button sat inside the scope container whose
handler matched any button, so clicking All added an undefined group and threw in
render. It went unnoticed because every value being measured is written before the
throwing line. **Check the console, not just the output.**

Also confirmed: navigating destroys the previous iframe so audio cannot bleed
between cards, the width selector constrains the card without horizontal overflow
at any setting, the scope filter cannot be emptied, and the theme toggle swaps the
Deezer and Spreaker URL variants.

## Live URL

https://thamada-cloud.github.io/embed-player-comparison/

Re-verified on the live URL signed out, which is the state a participant is in.
86 checks, 0 blanks. Twitch renders there, confirming its `parent=` frame policy
resolves against the github.io host.
