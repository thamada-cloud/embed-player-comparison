# Embed Player Comparison

Real, live third-party embed players, for a user-preference test. Two pages over
one shared registry. No build step, no dependencies.

| Page | For |
| --- | --- |
| `index.html` | **One at a time, all 50.** The session stimulus. Step through players, counterbalance the order, one frame mounted so audio cannot overlap. |
| `gallery.html` | **All 50 on one page, no filter.** Scroll through everything for internal review, screenshots and eyeballing the whole field at once. |
| `analysis.html` | **Measured comparison.** Every player scored across 11 dimensions, with the numbers, the visual comparisons and what I would conclude. |

## Files

- `players.js` holds the 50-player registry and every shared helper. **All three
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
| Podcast | Stuff You Should Know, the episode "Social Identity Theory: Your Group Rules, Others Drool" |

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

**Core, 7 players.** Same station and same episode in every player. This is the
only valid comparison set for a content question.
iHeartRadio, TuneIn, YouTube, Apple Podcasts, Spotify, Deezer, Omny Studio.

**Hosts, 13 players.** Podcast hosting players. Each only serves shows it hosts,
so the content differs. These are what publishers actually embed, which makes them
the most relevant chrome comparison even though the content cannot match.
Megaphone, Acast, Libsyn, Captivate, Transistor, Simplecast, Audioboom, Spreaker,
Podbean, Buzzsprout, Blubrry, Castbox, iVoox.

**Other, 12 players.** Other audio and video embeds, different content, form
comparison only.
Apple Music, Tidal, NPR, Mixcloud, Audiomack, Bandcamp, SoundCloud, Zeno.fm,
Vimeo, Dailymotion, TikTok, Twitch.

**Infra, 4 players.** White-label and enterprise player infrastructure. Useful for
deciding what our own player chrome should look like, not consumer brands anyone
has an opinion about. Keep them out of a participant session.
Wistia, Brightcove, Streamable, Odysee.

**Blocked, 14 entries.** Cannot be embedded at all. Kept visible with the reason.

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
| Libsyn | 200 | 100 | ours, 110px |
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

## Removed for not loading

- **Brightcove.** Its player returns `VIDEO_CLOUD_ERR_VIDEO_NOT_FOUND` for every
  public demo account and video id found. Unfixable without our own Brightcove
  account.
- **Twitch.** The channel renders "Twitch is offline". Live status is not something
  a stimulus page can depend on. It can come back pointed at a 24/7 channel if the
  live-video comparison is wanted.

Two others were **wrongly** flagged as broken by an early heuristic and are still
in: **Apple Music** (78 elements, real player, its content just needs a
subscription) and **Streamable** (a real video element). A `textLen` test cannot
judge a video player or a shadow-DOM player. `diagnose.py` now judges on error
signals and near-empty renders instead.

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

- **Apple Music and Tidal need a subscription and a signed-in browser.** Keep both
  out of any listening-preference question. A signed-out participant measures the
  paywall, not the player.
- **YouTube shows a different episode.** The channel runs behind the audio feed and
  does not have the target episode. Its live card is Times Radio, a real broadcast
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
python3 measure.py              # all players, roughly 25 minutes
python3 measure.py spotify      # or just one, for iterating
```

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
