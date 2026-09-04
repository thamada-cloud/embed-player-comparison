# Embed Player Comparison

Real, live third-party embed players, for a user-preference test. Two pages over
one shared registry. No build step, no dependencies.

| Page | For |
| --- | --- |
| `index.html` | **One at a time, all 50.** The session stimulus. Step through players, counterbalance the order, one frame mounted so audio cannot overlap. |
| `gallery.html` | **All 50 on one page, no filter.** Scroll through everything for internal review, screenshots and eyeballing the whole field at once. |

## Files

- `players.js` holds the 50-player registry and every shared helper. **Both pages
  read it, so adding a player appears on both.** This is the only file to edit
  when changing the roster.
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

Every player, always. There is no filter to discover or configure: open it and
scroll. Sections and the jump-to nav are for navigation, not filtering.

The section headings stay because they are not a filter. They carry the one thing
needed to read a card correctly, whether it shows the same content as the others
or something different. A Megaphone card playing a different show means something
very different from an iHeart card playing the target episode, and without the
heading that distinction is invisible.

- **Content and theme** work the same as the other page.
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
