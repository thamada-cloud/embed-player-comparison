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

## The theme control drives iHeart's own theme parameter

The iHeart embed takes `&theme=light` or `&theme=dark` on the URL, so the
gallery's theme control now rewrites it rather than only restyling the page
chrome around it.

Found by reading the production code rather than by guessing. The embed is
served by the legacy widget app, not the new listen app, and
`apps-legacy/www/src/widget/styles/getThemeFromQuery.ts` looks the value up in
its own themes map and falls back to `light` on anything it does not recognise.
It ignores `prefers-color-scheme` entirely.

That last point matters for the measurement on the analysis page. The harness
tests theme response by emulating `prefers-color-scheme` in both directions,
which iHeart does not read, so it was filed as having one fixed appearance. It
has two, reached a different way. Any other player driven by a URL parameter is
open to the same mistake, so read that dimension as "does not follow the
browser" rather than "has no dark theme".

Confirmed against production, same URL with the parameter flipped:
`backgroundPrimary` moves from `#FFFFFF` to `#2D3134`, `fontPrimary` from
`#27292D` to `#FFFFFF`, and the border goes from a grey hairline to none.

The same app also documents `thumbnail`, `subheading` and `description` as
`true` or `false`, and carries an undocumented `secretColorParam` that takes a
JSON object and overrides individual theme tokens on top of the chosen baseline.

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

### The top bar sticks

It stays put while the page scrolls, so the width control is reachable from any
card rather than only from the top. It sits above the drawers, which live at 3
and 4 inside a card against the bar's 5, checked by asking the page what is
actually painted where an open drawer meets the bar. Sections carry a
`scroll-margin-top` so anything scrolled to lands below the bar rather than
under it.

### A slider at the top sets every player's width

Dragging it caps the four prototypes and the two shipping embeds together,
through one custom property, so they all answer the same width and the
comparison stays like for like. The readout beside it shows the number, and each
card's own gauge keeps reporting what that card actually measures.

A number beside it takes a typed width, and the two stay in step in both
directions. It applies as you type while the value is sensible and clamps on
blur or Enter, so a half typed `3` does not slam every player to the minimum
mid-keystroke. Out of range values clamp rather than being refused, and the
range runs all the way down to 0, since watching a card collapse is a legitimate
thing to want to see and an embed slot really can be handed nothing.

Zero is also where the field's own arithmetic went wrong once. Falling back with
`Number(value) || max` treats 0 as absent, so typing the one value the new
minimum allows snapped every player back to full width. Only an empty field
falls back now.

The maximum is whatever the page can give, re-read on resize, and sitting at the
maximum means no cap at all rather than a cap that happens to match, so the
default is the page filling the window exactly as before. Fill puts it back.

This is a page control, not a widget feature. It resizes the container, which is
what an embedding site really varies, rather than scaling anything: the players
respond through their own container queries, so what you see at 380 is what a
380px slot would get.

Measured across a drag from 1280 to 320: all three prototypes and the embed
report the same width at every stop, and the bar card's gauge flips from wide to
compact at its 560 breakpoint on the way down.

### The page says what is real and what is not, everywhere

The prototype page carries the production player and four prototypes at once,
which is the point of it and also the easiest thing in the world to misread,
particularly in a screenshot of one section. So status is never more than a
glance away.

- A green **Live today** band opens the page and says the embeds under it are
  real iframes from `iheart.com`, already in production.
- An amber **Prototype, not shipped** band cuts the page in two before the
  first prototype and says everything below it is a test build that nobody has
  been served.
- Each of the two designs gets its own band naming it, Design A the bar card and
  Design B the hero card, so neither reads as a revision of the other.
- Every individual section repeats its tag beside the heading, because a section
  can be scrolled to, screenshotted or linked on its own, and a band three
  screens up is no use then.
- The browser tab says it too, since a tab title is often all a person sees.

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

A fourth leak, and the most instructive, was a five pixel padding. The bar
card's wide layout offsets its text block by 5px against its 132px artwork, and
the rule was written as `.meta`, unscoped. The artwork cards' metadata is also
`.meta`, so above the 560 breakpoint they inherited it: a 36px text block became
41 beside a 40px tile and stopped being centred on it. Invisible on a phone,
since the rule lives inside the container query, which is exactly why it
survived several passes of measuring the compact layout.

Two class names from the first design leaked in during the build and both were
caught by measuring rather than by looking. `.thumb` is the slider's drag
handle, which is `position: absolute`, so the hero's thumbnail left the flex row
and the text ran underneath it. And `.widget.live .art` gives a station's
artwork a white plate and 4px of padding, correct for a 64px tile and wrong for
a full bleed background, which is what made the live card grey even after the
base colour was right. Its selector needed to outrank that one, not merely
follow it.

### The artwork cards show what is playing too

Neither hero frame draws a now playing state, so the first build of designs B
and C showed only the station name and its line, and their metadata poll was
switched off as pointless. That was wrong. A live card that says only the
station while a song is on air is withholding the one thing a listener is
looking at it for.

All three designs now poll and all three show the track, each in the lines it
has.

- **A** keeps its three lines, track, artist, station.
- **The podcast pair leads with the episode.** Frames 2548:250303 (design B)
  and 2548:250299 (design C) are identical: the episode at 14/18 SemiBold in
  true white, the show under it at 12/16 Regular in grey-100, 2px apart beside a
  40px tile. An earlier build had the order and the colour pairing both the
  other way round.

  Note the two blocks disagree on colour on purpose. The podcast pair is white
  over grey-100; the live block is grey-100 throughout.

- **All three designs read the same, and the order is station first.** The
  frames were revised, and 2527:144307, 2512:111965 and 2548:133528 now agree
  line for line.

  | Line | Style |
  | --- | --- |
  | Station and description, joined | 12/16 Regular |
  | Artist | 14/18 SemiBold, -0.2 |
  | Track | 14/18 Regular, -0.2 |

  Every line is grey-100 `#f6f8f9`, including the station line, which is neither
  white nor dimmed. The three sit 2px apart on design A and flush on B and C,
  which is a deliberate step past the frames: they carry 2px everywhere, and the
  artwork cards were asked to run their live block tight. The line heights, 16
  and 18 against 12 and 14, still do the separating. Earlier builds had
  the track first and the station last, which was the older revision.

  With nothing on air all three fall back to the station's name over its
  description.

  The tiles are 48 on both artwork designs now, podcast and live alike, which is
  a step past the podcast frames' own 40. A's compact card keeps its 64.

The station line stays under the track rather than being replaced by it. A card
that swaps the station out for the song has told you what is on but not where it
is coming from, which for radio is half the point. The extra line is dimmer than
the artist line above it, so two Regular 12/16 lines read as two things rather
than one block. B's top bar grows from 40 to 54 to hold it, measured with no
overlap against the control row or the waveform, and C's stays at 48 since its
tile is taller than the text.

Identity survives either way, since both cards carry the station's own tile
beside the text.

One thing worth settling in the design file. The design A frames weight this the
other way round, artist SemiBold over track Regular. Reading order won here, the
song being what a listener asks first, so B emphasises the track. That is a
decision rather than a reading of any frame.

Verified against a stubbed endpoint so the state is deterministic rather than
whatever Z100 happens to be doing. With a track, all three carry the station
line last: A reads Espresso, Sabrina Carpenter, Z100; B the same three lines;
C the same. A track change reaches all three. With nothing on air, B falls back to Z100 over its
description and C to the joined station line, both losing the third line rather
than showing an empty one.

### An episode row plays that episode

Clicking a row loads and plays it, on all three designs and in design C's
drawer, and the red now-playing title moves with it. Enter or Space does the
same from the keyboard, since a row is a button in all but tag name.

The list endpoint carries no `mediaUrl`, only the single episode one does, which
is the same trap the search path hit: a row knows enough to be drawn and not
enough to be played, so the audio is fetched on the way.

The media element is kept rather than replaced. `createMediaElementSource` can
only be called once per element, so a fresh element would need a fresh analyser
and the waveform would stop reading the audio. Checked after two episode
switches: the bars are still moving.

A row chosen from inside design C's drawer closes the drawer, since it has done
its job and the card it just changed is underneath it.

### The info button opens a drawer on designs A and B

Frame 2562:285883. The same Drawer component as design C's episode list, mounted
differently and filled differently.

- **It covers the CARD, not the stage.** The frame draws it over all 400px, the
  player and the episode list together, so it is a child of `.widget` rather
  than of `.stage`. Measured: it matches the card's own box exactly on all four
  cards, sitting at offset 0 when open and at the card's full height when
  closed.
- **The header grows to fit the title.** 80 tall where the title wraps to two
  lines, 64 where it fits on one, which is the difference between a podcast's
  show name and a station's. It wraps rather than ellipsising, unlike the
  episode drawer's header.
- **The body is a paragraph**, 16/24 with -0.5 tracking in black, not a list of
  rows. It scrolls when the description is long.
- Content is the show's own description, HTML stripped, or the station's line.
- Playback continues behind it, and Escape closes whichever drawer is open.

Design C has the same drawer, frame 2562:371764, and is the only card carrying
two of them. They cover the same space, so opening one closes the other rather
than stacking. In practice a person cannot reach the second button anyway, since
the open drawer covers it, which is the drawer doing its job; the exclusion is
there for the keyboard path. Escape closes whichever is open.

Design C's drawer is clipped by its own card, so it shows less of the
description than A and B do, 234px of card against their 400. That is the frame,
which draws a 400px drawer inside a 263px card.

### The artwork and the metadata link to iHeart

On all three designs, the artwork and each metadata line are real anchors,
opening in a new tab, built from the same ids the embeds use so a link lands on
the content rather than on a search result.

Each line goes to the page it names.

| What is clicked | Where it goes |
| --- | --- |
| Episode line | the episode page |
| Show line | the show page |
| Podcast artwork | the show page, since that is the show's own tile and it is where a podcast tile leads on iheart.com |
| Artist line | the artist page |
| Track line | the song page |
| Live radio, artwork and station line | the station page |
| The iHeart logo | iheart.com |

Confirmed by clicking through on the bar card: the episode line opens
`"Yumming My Yuck" (w/ Carly Rae Jepsen)`, the show line and the artwork both
open `Las Culturistas with Matt Rogers and Bowen Yang | iHeart`, the artist line
opens `Bruno Mars | iHeart` and the track line `Bruno Mars - Risk It All |
iHeart`.

The artist and song links are built from the `artistId` and `trackId` the
now-playing feed carries alongside the names, with the slug rules copied from
`packages/utilities` slugify. iHeart canonicalises the slug on arrival anyway,
checked by requesting the same ids with a single `x` in the slug's place and
watching it redirect to the real one, but a link that reads correctly before the
redirect is worth the few lines. A track arriving without ids renders as plain
text rather than a dead link, which is what the production slug builder does for
the same reason, and the anchors are re-pointed when the track changes rather
than being left on the previous song.

They are anchors rather than click handlers, so a middle click, a cmd click and
a keyboard both work, and the focus ring is there for the keyboard.

The anchor sits inside the paragraph rather than around it, so the clickable
area is the text and the paragraph keeps its clipping and its marquee. That
does mean the marquee's own rule had to stop using a child combinator, since
there is now an anchor between the line and its span.

A hovered line underlines, and the underline is declared on the span as well as
on the anchor. A line that overflows turns its span into an inline-block the
moment it is hovered, so the marquee can translate it, and an inline-block does
not draw its ancestor's text decoration. Declared only on the anchor, the
underline vanished at exactly the moment it was asked for, on every line long
enough to marquee, which is most of them.

Only `text-decoration` is reset on the text link. Adding `color: inherit`
alongside it outranked the `.meta` rule that sets the header text to grey-100,
so the anchor took the page's own dark colour and every line on the bar card
turned near black against the artwork. The two image links still inherit, since
they carry no text. The anchor
takes the grid slot on the bar card so the image keeps its own box, and colour
and underline are inherited away: measured before and after, every artwork and
metadata box is the same size it was.

On the two artwork designs this coexists with click-to-play, since the card's
own click handler already skips anchors. The big background image stays the play
surface; it is the 40 or 48px tile that carries the link. Verified: clicking the
tile opens the tab and leaves playback untouched.

### Clicking the card plays and pauses it, on the artwork designs

Designs B and C toggle from anywhere on the card, the way a video player does.
Design A does not: it has no surface that is not already a control or the
episode list.

Four things are deliberately excluded from the toggle.

- **Anything carrying `data-act`**, so the real buttons fire once rather than
  twice.
- **The scrubber**, since a seek is a click.
- **The drawer**, which covers the card and has rows of its own.
- **A drag**, measured as more than 6px of travel or a live text selection, so
  pulling across a title to read or copy it does not stop the audio.

It adds no `role` and no `tabindex`. The play button is still the accessible
control, and a second one would only duplicate it in the tab order.

Verified on all four artwork cards: the card click starts and stops, the play
button still works, the info button leaves playback alone, the scrubber seeks
from 3s to 2950s while playing, a click inside the open drawer does nothing, a
drag across the title does nothing, and the bar card ignores surface clicks
entirely.

### How the contrast check works, and why an average was not good enough

The first version of this readout reported the artwork's mean colour under the
scrim. That was a poor check, and measuring it said so. Sampling the actual
artwork pixels behind each line of text, the average overstated the true worst
case by as much as 7.6 on a dark cover.

The fix is two figures, one measured and one proved.

**Measured.** Every metadata line's box is mapped back through the
`object-fit: cover` transform into artwork pixels, the scrim is applied to each
sample, and the worst ratio behind the text is reported along with the share of
that area below AA. Sampled at 64px per line, which is enough to catch a bright
patch behind a word.

**Proved.** The scrim sets a floor that no artwork can break. The worst any
picture can be is pure white, so white under the scrim is the worst background
any artwork can produce, and that is arithmetic rather than a sample.

| Scrim | Guaranteed floor, grey-100 text |
| --- | --- |
| 55% | 4.47 |
| 60% | 5.39 |
| 65% | 6.55 |
| 70% | 8.00 |
| 75% | 9.77 |
| 80% | 11.86 |

Read the other way, the scrim would have to fall below 55.2% before AA could
fail on some artwork, and below 66.7% before AAA could. Design A at 60% clears
AA on anything by construction; B at 70% and C at 75% clear AAA on anything.

The model was then checked against the extreme. Across a scan of the catalogue
the brightest cover found was Crime Junkie, mean luminance 0.81 with 80% of its
pixels bright. Behind the text it measured 8.00 to 1 at 70% and 9.77 at 75%,
which is the computed floor exactly, to two decimal places. The artwork contains
pure white where the text sits, so it produced the theoretical worst case and
still passed AAA.

### Both artwork designs darken their scrim to 80%

The frames draw `rgba(0,0,0,0.7)`. Both designs paint 80 instead, which is a
choice rather than a reading, arrived at by looking at 70 and 80 side by side.
The value is still held per design rather than collapsed into one constant,
since the two have differed before and may again.

The contrast readout under each card reports the worst pixel behind the text
rather than an average. At 80% all four cards read between 13.53 and 15.28 to 1,
where design B read 9.95 at 70%. The guaranteed floor, the worst any artwork can
produce, goes from 8.00 to 1 at 70% to 11.86 at 80%. Every card already cleared
AAA, so the gain is headroom on bright artwork rather than a change of grade,
paid for in how much of the picture still reads.

### Design C, the third set

Frames 2533:85625 (podcast) and 2533:91574 (live radio). Design B's card again,
with two differences that change how it behaves rather than how it looks.

- **The controls appear on play**, as in design B. An earlier build had them on
  at rest, generalised from C's live frame, which is drawn idle with its icons
  showing. C's own podcast idle frame, 2533:85718, says otherwise: top bar, one
  centred play button, waveform, and nothing else, no control row, no scrubber
  and no list button. Idle is now exactly that, on both C cards.
- **A list button over the scrubber**, right aligned, 8px above it, opening a
  drawer. Frame 2533:85717 settles what it opens: a Drawer instance the same 358
  by 263 box as the player, at 0,0, so it slides up OVER the card and covers it
  rather than opening a panel beneath it. Header 64 tall on ihr grey-200 with
  the title at 18/24 Bold and a close X; body white with 16 of padding and the
  same 72px rows.

  It is closed by transform rather than by display, so the slide is visible, and
  visibility flips only at the end of the travel, which keeps a closed drawer
  out of the tab order instead of leaving it invisibly over the controls. Focus
  moves to the close button on open and back to the list button on close, and
  Escape closes it. The frame has no opinion about the keyboard; a sheet that
  covers the player needs a way out regardless.
- **The two halves are less alike than in design B.** Podcast keeps the 40px
  thumbnail, two lines of text and the seven control row. Live radio has a 48px
  thumbnail and ONE line joining the station and its description.

  Its own frame, 2533:91574, parked three icons at the bottom right and drew no
  waveform. That was built as drawn and then corrected: the icons belong in the
  centred row beside the play button and the card ends in a waveform, per
  2512:111876, which is where that row is actually drawn. So live C is now the
  spacer, save, the red button, info and share, 8px apart and centred, over a
  waveform running to the edge, with no bottom padding. The 48px tile and the
  single line of text stay design C's own.

**Its waveform is the same shape at double the hero's scale**, 4 to 24 rather
than 2 to 12, on the same 4px bars, read off 2533:85718, so the strip is 24px
tall rather than 12. The floor a bar rests at is held per design now rather than
inferred from its ceiling.

**Design C is 16:9 and fluid, like a YouTube embed.** The card keeps the ratio
and its height follows its width, rather than being pinned to the frame's 263.
Measured: 1.778 exactly from 390 up to the 400px ceiling, 660 by 371 at a 700
viewport, 390 by 219 on a phone.

Two things follow from that, and both are worth knowing before reading the card
at a wide width.

- **The contents do not scale.** A video fills its box; this card's parts are
  fixed pixel sizes, so at 1280 by 720 the 64px button and the 40px thumbnail
  sit in a large empty field. That is what a 16:9 box does to fixed content, not
  a layout fault, but it is the reason the design was drawn at 263.
- **There is a ceiling at 400px.** A video can be any size because it scales;
  this card cannot, so past a point 16:9 is just a taller and taller field of
  artwork around the same 64px button. 400 holds the ratio through every width
  an embed slot realistically gets, phones and article columns up to 711, and
  past that the card grows wider rather than taller: 740 by 400 at a 780
  viewport, 1280 by 400 at 1440. The card stays full bleed either way, so the
  cap is on the height and never on the width.
- **There is a floor at 234px.** The top bar is 56, the centred control row is
  64 and the bottom block is 72, so below 210 the centred row starts to overlap
  what is above and below it. The row sits at `calc(50% + .5px)`, the frame's
  own half pixel, which is why 208 was a fraction short. 16:9 reaches 210 at a
  width of 373, so the floor only applies on narrow phones, and no overlap
  occurs at 360, 320 or 300.

Measured against the frames at 350, before the ratio change. Podcast: stage 263,
top bar at 16, thumbnail 40, seven controls 8px apart, play button centred, list button 16px
from the right edge and 8px above the scrubber, scrubber 4px above the waveform,
waveform flush to the bottom, list closed. Live, after the correction: thumbnail 48,
five items 8px apart with the red button centred, waveform 12 tall flush to the
bottom.

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

- The iHeart logo sits in the same corner on all three designs, 16px from the card's right edge and 16px from its top. On the bar card the anchor is absolutely positioned against `.body`. On the artwork cards it used to be the last flex item in `.topbar`, which put it 24px in and vertically centred against the top bar, so it drifted as the text block grew. It is now absolute against `.topbar` as well. The top bar takes the same 16px of right padding the bar card's `.body` takes, because `.meta` already carries its own right padding, which is the whole of what keeps any design's lines off the logo. That padding is 33px, the logo's 25 plus 8 of clearance, so all three designs truncate their text at the same point, 49px in from the card's right edge, 8px clear of the logo.

## Shared widget code, `widget-core.css` and `widget-core.js`

The widget was lifted out of `widget.html` into these two files so that the prototype
page and the single card page cannot drift apart. Both pages load the same CSS and the
same JS.

The JS builds whatever widget roots it finds in the page rather than six fixed ids, so
`embed.html` gets exactly one card and makes one API call instead of two. The width
slider and the window width readout are skipped when their controls are absent.

## Single card page, `embed.html`

One card, no chrome, sized by whatever iframe holds it. Query parameters pick which:

    embed.html?design=a|b|c&mode=podcast|live

This is what `host-home.html` points its slot at for the six prototypes. The two
shipping options point at iheart.com directly, so what renders there is the production
player rather than a rebuild of it.

## Widget in a homepage rail, `host-home.html`

The widget dropped into a real publisher rail, so it can be judged at the size and in
the position a host actually gives it rather than on a blank canvas. Built from Figma
frame `2566:86936` in the Audio Widgets file, which
is a web capture of the live homepage at a 1728 viewport, cross-checked against the
homepage itself read in headless Chrome. The two agree.

| piece | measured |
| --- | --- |
| wrapper | 1160, centred, 0 20px padding |
| grid | 9 columns, 32px gap: main spans 6 at 736, rail spans 3 at 352 |
| main column | 32 of right padding plus a 1px rule, so 703 of content |
| hero lead | 703 with 32 of side padding, 639 image at 3:2 |
| hero pair | 416 and 255 inside the 703, 32 apart |
| rail modules | 352, 48 clear of each other |
| widget module | 21/25 700 head at 0.63 track, 8, a 1px black rule, 24, iframe, 12, a 14/18 500 credit |
| the iframe | **352 x 150** |

That last row is the finding. The homepage gives the widget **half** the height an
article page gives it, 150 against 300, in an otherwise identical module. None of the
six prototype cards fits 150: the shortest is design A live at 180.

### Where the prototype sits

The homepage's shipping iHeart module is titled **Strictly Business** and lives in the
second block's rail, below a long vertical news list. `host-home.html` keeps that module
exactly as it ships, pointed at iheart.com, and puts the swappable prototype slot
directly beneath it, marked with a red rule and a Prototype flag so the two stacked
players cannot be confused. That makes the comparison a vertical one on a real page.

### Fitting the slot to the card

An iframe cannot resize itself, so the card reports the height it needs and the host
decides what to do with it. `embed.html` posts `{ type: 'widget-height', design, mode,
height }` to its parent whenever the card's measured height changes, watched with a
ResizeObserver so it keeps up with artwork arriving, the episode list filling in, a
control row appearing on play and a drawer opening. `host-home.html` listens, checks the
message came from its own frame and that the height is in a sane band, and sets the slot
to it.

The harness has a **Slot height** control with the two cases side by side:

- **Fit to the widget**, the default. Every card gets the height it asks for, and nothing
  is cut off.
- **Fixed 150, as shipped**, which is what the real host hardcodes. The readout then names
  the gap, for example `352 x 150, card wants 444, clipped by 294`.

The two shipping embeds are cross-origin and report nothing, so they stay at 150 in both
modes, which is exactly what they get on the real page.

## The scrubber is the accomplice Slider

The progress bar in all three designs is now the design system's Slider, which is what
the Storybook **Seek Bar** story renders. It was rebuilt from
`packages/accomplice/src/components/slider/slider.css.ts` in the `iheartradio/web`
monorepo rather than eyeballed off the Storybook page, so the values are the
component's own.

| | before | now, from the component |
| --- | --- | --- |
| track line | 2px, fixed | 2px, and 3px from 1025 up (the `large` breakpoint) |
| hit area | a padded box, 26 on A and 16 on B and C | `min-height: 16` on all three, with the line drawn by `::before` |
| line colour | grey250 on A, grey450 on B and C | grey450 on all three |
| line radius | 6px | 6px (`radius[6]`, 0.6rem on a 10px rem base) |
| fill | red550 only | red550, **red400** while the track is hovered, **red650** while dragging |
| thumb | 12px, always visible | 12px, same two states, and **hidden until hover or drag** |
| preview | none | the segment from the playhead to where a click would land |

Three notes on the port.

**The colour pairs are `lightDark()` in the original.** These cards are dark surfaces in
every state, so they take the dark half of each pair: grey450 for the line, grey250 for
the preview.

**`1.2rem` is 12px, not 19.2.** accomplice sets a 10px rem base, which its own space
scale confirms, where `space[12]` is `1.2rem`. So the thumb stays the 12px the Figma
frames draw.

**The hero's separate scrubber geometry is gone.** It existed because the old track was a
padded box whose padding had to be tuned per design. The component separates the hit area
from the line, so one rule now serves all three.

### What it cost

Nothing in layout. The slider row was not the binding constraint in any of the three
cards, so all six keep their exact heights: 400, 180, 444, 224, 234, 234.

Design A's hit area does drop from 26 to 16, which is the component's own `min-height`.
That takes it below the WCAG 2.2 target size minimum of 24, where it previously cleared
it by 2. B and C were already at 16 and are unchanged. Raising it would mean departing
from the component.

## The widget is built on accomplice's values

Every value that accomplice already defines is taken from the component sources rather
than from the Figma frames. Nothing was ported by eye: each value was read out of
`packages/accomplice/src` in the `iheartradio/web` clone.

This began as a second build alongside the original so the two could be compared. The
comparison is done and the original has been replaced by it, so there is one stylesheet
again.

### What the port changed

| piece | before | accomplice | source |
| --- | --- | --- | --- |
| scrubber | hand-built | `Slider`, including hover preview and thumb-on-hover | `slider.css.ts` |
| explicit badge | weight 600 | **weight 700** | `badge.css.ts` |
| iHeart logo | 25 x 26 | **24 tall**, width follows | `logo.css.ts` size scale |
| icon buttons | radius 999px | `aspect-ratio: 1/1`, radius[999] | `button/size.ts` size `icon` |
| button hover | `rgba(255,255,255,.14)`, invented | **gray400** `#717277` | `button.css.ts` tertiary/white |
| button pressed | same wash as hover, `scale(.96)` | same colour as hover, **`scale(.95)`** | `baseButtonStyles` |
| play button, A | white, no hover state | white, hover and pressed **gray300**, fine pointer only | primary/white |
| play button, B and C | red600, no hover state | **red550** at rest, hover and pressed **red400**, fine pointer only | primary/red |
| button focus | none | 2px solid **blue400** at 2px offset | `baseButtonStyles` |
| button motion | none | `scale(1)` with a 300ms transition under `(pointer: fine)` | `baseButtonStyles` |
| speed control | 14px, tracking -0.4, no line-height | **button-2**: 14 / 16 / 600 / -0.2 | `text/kind.ts` |
| marquee | overflow + ellipsis | adds `max-width:100%`, `width:100%`, `position:relative` | `marquee.css.ts` base |
| text links | 2px focus ring at 2px offset | **1px at 1px offset**, radius[2] | `link.css.ts` |
| every type value | numbers from the frames | named kinds via tokens | `text/kind.ts` |

### What did not change, and why that matters

**Every card kept its height through the whole port**: 400, 180, 444, 224, 234, 234.

**The type barely moved.** `.title` was already 14 / 18 / 600 / -0.2, which is exactly
`subtitle-4`. The info drawer body was already 16 / 24 / 400 / -0.5, which is exactly
`body-3`. The drawer heading was already 18 / 24 / 700, which is exactly `h5`. The
sheet's radius and slide were already the Drawer's. That is not luck: the frames were
drawn from the system, so transcribing the frames landed on the system's values. The
port's real gain is that the values now have names instead of being numbers that happen
to be right.

### Three things about the real button states

Worth writing down, because the first pass of this port got all three wrong by
assuming rather than reading.

1. **The base button has no hover background.** Hover is `cursor: pointer` and nothing
   else. Every background belongs to a compound variant of `color` x `kind`.
2. **Coloured variants only hover on a fine pointer.** Their hover background sits inside
   `@media (pointer: fine)`, so a touch device never paints it. Only the neutral
   tertiaries (white, default, gray) hover unconditionally.
3. **Hover and pressed are the same colour.** Pressed is told apart by
   `transform: scale(0.95)`, not by a darker fill.

Three things stay bespoke because accomplice has no equivalent: the waveform, the artwork
scrim, and the card shell itself. accomplice's `Player` is the site's fixed 6.4rem bottom
bar, which is the wrong shape for an embed card.

## Gallery defaults

The gallery opens at **three columns** rather than one, and **blocked players are no
longer rendered at all** rather than shown as a card saying why they cannot be embedded.
That takes the grid from 43 cards to 29.

Blocking is per MODE, not per player, so the filter runs on every build rather than once:
a service can serve a podcast fine and refuse the frame for live radio. The loaded count
under the header already counted this way, so it needed no change.

The 14 left out are Amazon Music, YouTube Music, Pocket Casts, Radio.net, Live365,
Pandora, SiriusXM, Global Player, Audacy, BBC Sounds, Substack, Streema, Radio Garden and
Radio France. They stay in `players.js` with their reasons, so the registry is still the
record of what was tried and why it failed; only the grid stops showing them.

## The loaded episode is brand red

The episode currently loaded carries `.on` in the list, and its title is painted brand
red so it is findable at a glance among the rest.

The colour is `#C6002B`, which accomplice names **`brandRed`** in
`themes/default/theme-tokens.ts`, beside `brandBlack`, `brandGray` and `brandWhite`. It
happens to equal `red600`, but it is named separately in the accomplice build because the
intent is "the brand colour" rather than "the 600 step", and those two are free to
diverge later.

This line previously used `red550` (`#CC032E`), a neighbouring value on the red scale
that reads as the same colour at a glance and is not the brand one.

### The selector leak that hid it

Applying brandRed exposed a bug that had been there the whole time. `.row-meta span`
used a descendant combinator, and every marquee wraps its text in a `.mqi` span, so the
rule also matched the span INSIDE the episode title's `<b>` and restyled it with the
subtitle's rules.

That span is what actually paints the text, so the effect was invisible in the CSS and
obvious on screen once looked for:

| | `<b>` said | the `.mqi` inside it painted |
| --- | --- | --- |
| loaded title | 14/18, 600, `#C6002B` | 12/16, 600, `#55565B` |
| other titles | 14/18, 600, `#27292D` | 12/16, 600, `#55565B` |

So every episode title had been rendering two sizes small in the wrong grey, and the
brand red never reached the screen at all. Computed style on the `<b>` reported the right
colour throughout, which is why a measurement alone did not catch it.

The fix is `>` instead of a descendant: `.row-meta > span` matches the subtitle, which is
a direct child, and not the marquee span nested inside the title. The subtitle's own
`.mqi` still inherits from its parent, so it is unaffected.

## Design C shows its list button at rest

The artwork cards reveal their controls on play. The list button is now the exception on
design C, so the episodes are reachable before anything is playing.

Written as an exclusion from the hide rather than a re-show:

    .widget.hero:not(.playing) .h-btn:not([data-act="list"]) { display: none; }

Two reasons for that shape. It does not have to restate a `display` value, which is
`flex` in the original build and `inline-flex` in the accomplice one. And design C is the
only card that puts a list button in that row, so the attribute selector needs no design
scoping to stay correct.

Design B is unaffected, since its episode list sits under the card rather than behind a
button, and design C's live card has no list button because live radio has no episodes.
Card heights are unchanged at every width.

## Tooltips on the icon buttons

Every button on the card shows an accomplice Tooltip on hover and on keyboard focus,
built from `components/tooltip/tooltip.css.ts` and `tooltip.tsx`:

| | value |
| --- | --- |
| surface | `lightDark(gray600, brandWhite)`, so **white** on these dark cards |
| text | `lightDark(brandWhite, gray600)`, so **`#27292D`** |
| border | 1px `gray350` `#96979F` |
| radius | `radius[2]`, 2.5px |
| shadow | `elevation1` |
| padding | `space[4]` `space[8]`, so 4 by 8 |
| type | 10 / 14, weight 400, `letterSpacing[0]` |
| offset | 4, with the arrow 16 x 8 on the path `M0 0 L8 8 L16 0` |
| motion | in over 200ms from an 8px offset, out over 100ms eased |
| delay | **200ms to open, 100ms to close** |

**The label is `attr(aria-label)`, not a second attribute.** The tooltip text and the
accessible name are therefore the same string by construction and cannot drift apart. It
also means the tooltip follows state for free, because those labels are already kept
current: the play button reads Play, Pause or Stop, and the list button reads Show
episodes or Hide episodes.

Only the buttons ON the card carry one. The drawer's close button sits on white, where a
white bubble would be invisible, and it is excluded by selector rather than by accident.

### The open delay

The animation duration and the open delay are different things, and the component only
fixes the first. accomplice's `Tooltip` wrapper sets **no delay at all**: it re-exports
react-aria's `TooltipTrigger` unchanged, so every call site picks its own.

| accomplice call site | open | close |
| --- | --- | --- |
| `number-field.tsx` | 200 | 100 |
| `textarea` story | 200 | 100 |
| `field.tsx` | 500 | not set |
| `tooltip` stories | 250, and 50 | 100 |
| tests | 0 | 0 |

So there is no house value to match, and the spread is deliberate: a form field waits
500ms because you are typing in it, a compact control waits 200ms. These cards use
**200 open, 100 close**, matching `number-field` and `textarea`, the two closest things to
a compact control whose icon is doing the explaining.

Measured after the change: nothing appears before ~200ms, full opacity by ~400ms, and the
tooltip holds ~100ms after the pointer leaves before fading. A 90ms sweep across a button
never shows one at all, which is the behaviour the delay exists for.

The delays survive `prefers-reduced-motion`. They are about intent rather than motion, and
dropping them would make the tooltips more eager for someone who asked for less.

### Two deviations, stated rather than buried

**The arrow is a data URI, not an `<svg>`.** The component renders a real element; a
pseudo-element has nowhere to put one, so the same path is inlined as a background image.
The geometry is the component's, the delivery is not.

**One tooltip is right-anchored.** react-aria shifts an overlay back inside the viewport
when it would overhang, and a pseudo-element has no such machinery. Design C's list
button sits flush right, always 32px from the card edge, so any bubble wider than 64px
overhangs at every width rather than only at narrow ones, and "Show episodes" is 83. That
one anchors its right edge to the button's, which is where react-aria would put it
anyway. The arrow stays centred on the button. Checked at 352 and 1280: nothing else
overhangs in any design.

## The plus button raises the auth toast

Saving needs an account and an embed is never signed in, so the plus button no longer
pretends to latch a saved state it cannot have. It raises the accomplice **Toast**,
`kind: 'info'`, which is what iheart.com shows for the same action.

A Toast renders a `Notification`, so the visual spec is
`components/notification/notification.css.ts` and the layout is its render:

| | value |
| --- | --- |
| surface | `blue100` `#9ADAFF`, radius `space[6]`, min-height 5.6rem, padding `space[16]` |
| icon | `InfoFilled` in `blue600` `#0055B7`, aligned to the start |
| copy | `gray600`, body-4, with the component's inline 2.4rem line-height override |
| close | Button `size: icon`, `kind: tertiary`, `color: gray`, nudged up 0.3rem |
| actions | 8 column gap, justified to the end, 8 of padding above |

The copy is `LIBRARY_AUTHENTICATION_MESSAGE` verbatim from
`apps/listen/app/utilities/constants.ts`, and the two actions come from
`getAuthCTAToastProps`: tertiary, gray, with `gray600` text.

### Three judgement calls

**The region is local, not global.** accomplice's global toast region is `position: fixed`
against the viewport. An embed has no viewport worth speaking of, and in the prototype
page six cards share one, so the toast is absolute inside the card that raised it. That is
also the only honest place for it: the toast belongs to that player, not to the host page.
It fits the shortest card with room, 122 tall inside 180.

**The links were checked, not assumed.** `iheart.com/login` is a **404**.
`account.iheart.com/login` answers 200 and is what iheart.com's own signup page links to,
so that is the Log in destination; Sign up goes to `iheart.com/signup/`. Both open in a new
tab, because navigating the frame would take the player with it.

**No timeout.** A toast whose whole purpose is two links to click should not time out from
under the person reading it. The component's stories use `timeout: null` for this shape.

The toast also stops its own clicks reaching the card, since the artwork designs treat a
click anywhere as play/pause.

## The share button opens the accomplice Dialog

The share icon opens the social share sheet iheart.com opens from the same control.
Surface from `components/dialog/dialog.css.ts`, contents from
`apps/listen/app/components/social-share`:

| | value |
| --- | --- |
| underlay | `rgba(0 0 0 / 0.8)`, centred, fading in over 350ms |
| modal | 35.5rem wide, 40.1rem from large up, scaling in from .75 over 350ms |
| dialog | `brandWhite`, `radius[6]`, column with 16 gap, centred, body-3 base, 24 top and bottom, 16 sides and 24 from medium |
| heading | h5, h4 from medium up |
| close | absolute, top -40, `brandWhite`, aligned to the end |
| artwork | 5.6rem square, `radius[6]`, `elevation1` |
| name / desc | subtitle-4 then caption-4, stepping to subtitle-3 and caption-2 from medium |
| embed row | a flushed, disabled input beside a small primary button, 4 gap |

The title follows `SHARE_TITLE_BY_TYPE`: the live card shares a **Station**, the podcast
card is showing an episode so it shares an **Episode**. The embed snippet is what
`EmbedWidget` builds, height 200 and all, and both copy controls revert after 5 seconds
exactly as it does.

### It does not fit three of the six cards

The dialog needs **399px** of height. Measured:

| card | height | dialog |
| --- | --- | --- |
| A podcast | 400 | fits, with 1px to spare |
| B podcast | 444 | fits |
| C podcast / live | 234 | scrolls, 165 hidden |
| A live | 180 | scrolls, 219 hidden |
| B live | 224 | scrolls |

It stays usable because the component already sets `overflow: auto`, and Copy Code is
reachable by scrolling on every card, checked rather than assumed. But a sheet designed
for a full page is a poor fit for a 180px embed, and that is worth knowing before anyone
ships it there. A compact variant, or opening the share page in a new tab instead, are the
two obvious answers.

### On the three share targets

They are drawn with neutral glyphs rather than the platforms' own marks. Those are
trademarks and this is a public repository. The row's structure, sizes and labels are what
the prototype is testing, and a circle with the platform's name beneath it carries both.
The links themselves are real.

## Controls latch on after the first play

The artwork cards used to key their controls off `playing`, so pausing hid them again.
They now key off `started`, which latches on the first play and clears only when new
content is loaded. Pristine cards are still bare; a card you have played keeps its
controls whether it is playing or paused.

| state | design B | design C |
| --- | --- | --- |
| pristine | no icons, no scrubber | list button only |
| playing | 6 icons, scrubber | 6 icons, list, scrubber |
| paused | 6 icons, scrubber | 6 icons, list, scrubber |

`started` lives on the widget object rather than the element, because `render()` rebuilds
the element and a class set on the old one would be lost.

The scrubber follows the same rule rather than staying tied to `playing`. Hiding it on
pause would take away the one thing a paused player most needs to show, which is where it
stopped. Live radio has no scrubber either way.

## The current episode's row toggles

Clicking the row for the episode already loaded is a transport control, not a selection,
so it toggles play and pause. Clicking any other row loads that episode and plays it, as
before.

| click | before | now |
| --- | --- | --- |
| current row, playing | nothing at all | pauses |
| current row, paused | refetched and reset to 0, losing your place | resumes where it stopped |
| another row | loads and plays | unchanged |

Two reasons beyond matching what Spotify, Apple Music and Pocket Casts do. A row that
answers a click with nothing reads as broken rather than as already-playing, so people
click it again. And the guard this replaces only covered the playing case:

    if (String(id) === String(d.currentEpisodeId) && w.playing) return;

so the paused branch fell through to `selectEpisode`'s full refetch, which sets
`currentTime = 0`. That was worse than either answer to the original question, and
resuming is the only correct behaviour there whichever way it had gone.

Measured: play to 4s, click the row, paused at 4s; click again, resumes and reaches 6s
rather than restarting; click a different row, the new episode loads and starts at 0.

## Episode rows carry a play control on the artwork

From `apps/listen/app/components/row/row-image.tsx`, where `Row` clones the play button
into `RowImage` as a child. Two things fade in together over 300ms: a black scrim at 0.2
opacity, and the button from 0 to 1.

The trigger there is `isHovering || isActive || isMenuOpen`, and `active` is a semantic
prop meaning *this row is the current item*, not a press state. So the current episode
keeps its control on screen while every other row reveals one on hover, which is exactly
what `.row.on` already marked here.

| row | scrim | button | glyph |
| --- | --- | --- | --- |
| current, idle | 0.2 | shown | play |
| current, playing | 0.2 | shown | **pause** |
| other, idle | 0 | hidden | play |
| other, hovered | 0.2 | shown | play |
| any, coarse pointer | `display: none` | `display: none` | n/a |

The button is `<Button color="default" kind="primary" size="icon">`: `brandWhite` behind a
`gray600` glyph on this light surface, `space[4]` padding, square, fully round. The
existing `play.svg` and `pause.svg` are already `#27292D`, which is that `gray600`.

`RowImage` also sets pointer-events and display to none under `pointerCoarse`, and that
carries over. A touch device has no hover, so an overlay that only appears on hover would
either never show or never leave. The row itself stays tappable, and it toggles.

One deliberate difference: the tile stays **56px**, the size the Figma frames draw for
these cards. `RowImage` sizes its own at 6.8 to 8.8rem, which belongs to a full page rather
than an embed.

## Design C keeps its actions in the bottom right row

Frames 2533:85717 and 2512:111876 put design C's plus, info and share in the bottom
right row beside the list button, not around the play button. Podcast takes all four,
live radio takes the same three without the list button, in the same place.

| | centre row | bottom right row |
| --- | --- | --- |
| C podcast | back 15, play, forward 30 | speed and list left, plus, info, share right |
| C live | play only | plus, info, share |
| B podcast | unchanged: plus, speed, back, play, forward, info, share | none |
| B live | unchanged | none |

The row's gap is **4**, which is what both frames draw between these; it sits 16 in from
each edge and hugs the right.

The reveal rule is now scoped to `.hero-controls` rather than excluding the list button by
attribute. The transport still hides until the first play, but design C's actions are no
longer in that row and both of its frames show all of them on a card nobody has played
yet, so they stay put. Design B keeps everything in `.hero-controls` and is untouched.

## Design C's play button stays centred on the card

`.hero-controls` is a centred flex row, which centres the GROUP. Design C's group is
lopsided once playback reveals it, speed and back to the left of the button and forward
alone to the right, so the button sat right of centre from the moment you pressed play,
and it would move again whenever the set changed.

Design C's row is now a three column grid, `1fr auto 1fr`, with the side groups wrapped in
`.cc-side`. The two sides are the same width whatever they hold, including nothing, so the
button is centred on the card rather than on whatever happens to be beside it. Live
radio's lone button lands in exactly the same place as the podcast card's.

Design B keeps the flex row: its group is symmetrical by construction, three each side.

Measured as the distance between the button's centre and the card's, at 352 and 1280, at
rest and playing: **0 in all sixteen cases**, designs B and C, podcast and live.

### A rem bug that made three things 1.6x too big

The token block at the top of the stylesheet is written in px, with a note saying why:
accomplice runs a **10px** rem base and this page runs 16px, so `1.4rem` there is 14px
and here it is 22.4. Every token respects that. Then, porting the Toast and the Dialog, I
copied four values straight out of the component sources as literal `rem` and they all
rendered 1.6x too large:

| | was | should be |
| --- | --- | --- |
| share modal | `35.5rem` = 568px | **355px** |
| share modal, large | `40.1rem` = 642px | **401px** |
| share artwork, toast min-height | `5.6rem` = 89.6px | **56px** |
| toast close offset | `-0.3rem` = -4.8px | **-3px** |

The numbers were in my own test output and I read past them. Anything taken from an
accomplice source now goes in as px, the same as the tokens.

### The share targets

From `SocialShareOption`: a **48px** square with `radius[999]`, `elevation1` and
`space[4]` of padding, `brandWhite` on a light sheet. No border; the shadow is what lifts
it off the surface. Glyph sizes are the call sites' own, **Copy at 40** and the two social
marks at **32**. The label is `overline-2`, 10 / 14 / 400, sitting `space[8]` below.

The two social targets keep neutral glyphs rather than the platforms' own marks, which are
trademarks, in a public repository. Sizes, spacing and labels are the part under test.

Frame 2533:85625 splits that bottom row rather than stacking everything to the right:
speed and the list button at the left edge, plus, info and share at the right. Two groups
either end of a `space-between` row, 4 apart within each group, 16 in from each edge.

Live radio has neither a speed control nor an episode list, so its left group is empty. It
is still emitted: `space-between` with a single child pushes that child to the START, so
dropping the empty span would move plus, info and share to the wrong side.

Moving speed out of the transport also leaves that row symmetrical, back 15 and forward 30
either side of the play button, so it reads balanced as well as measuring centred.

### Two things the move to the left edge broke

**The speed label outgrew its button.** `.h-speed` was a fixed 24px box, which is right for
an icon and wrong for text: the label cycles 1x, 1.25x, 1.5x, 2x, 0.75x, and 1.25x needs
34. It spilled outside the button's own hover background. It now takes a 40px min-width,
sized to the longest label rather than left to grow, so the button holds one width through
the whole cycle and the group beside it never shifts. The `aspect-ratio: 1/1` is dropped
for this button too: that comes from Button size `icon`, and this is a text button.

| label | needs | before | now |
| --- | --- | --- | --- |
| 1x | 15.2 | 24 box, fits | 40 box, fits |
| 1.25x | 34 | 24 box, **spills 10** | 40 box, fits |
| 1.5x | 26.5 | 24 box, **spills 2.5** | 40 box, fits |

**Tooltips at the row's ends were clipped.** The bottom row now pins groups to BOTH edges,
so a button at either end sits 16 from the card and any bubble wider than 32 overhangs.
"Playback speed" is 86 and "Show episodes" is 83. Each end group now anchors its bubbles to
its own edge, which is where react-aria would put them; the arrow stays centred on the
button.

The anchoring is scoped per group. The earlier rule anchored everything in the row to its
right edge, which was correct while the row only had a right group. Applied to the left
group it would push those bubbles further off the card rather than back onto it.

Measured at 352 and 1280, podcast and live: **no tooltip overhangs the card on any button**.
