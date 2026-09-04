# Embed Player Comparison

A single-page stimulus for a user-preference test. It shows real, live third-party
embed players one at a time so a participant can compare them and say which they
prefer.

Open `index.html` in a browser. No build step, no dependencies.

## What it does

- **One player at a time.** Previous and next, arrow keys, or the jump list.
- **Content toggle.** Live radio or podcast. A platform with no live radio product
  shows its podcast player and says so on the card.
- **Scope filter.** Defaults to Core, which is 7 cards and the right length for a
  real session. The other groups are for internal review.
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

**Hosts, 12 players.** Podcast hosting players. Each only serves shows it hosts,
so the content differs. These are what publishers actually embed, which makes them
the most relevant chrome comparison even though the content cannot match.
Megaphone, Acast, Libsyn, Captivate, Transistor, Simplecast, Audioboom, Spreaker,
Podbean, Buzzsprout, Blubrry, Castbox.

**Other, 10 players.** Other audio and video embeds, different content, form
comparison only.
Apple Music, Tidal, NPR, Mixcloud, Audiomack, Bandcamp, Vimeo, Dailymotion,
TikTok, Twitch.

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

Result: **86 checks across all 43 cards in both content modes, 0 blanks.** All 29
embeddable players paint real content. All 14 blocked cards mount no iframe and
show their reason.

Also confirmed: navigating destroys the previous iframe so audio cannot bleed
between cards, the width selector constrains the card without horizontal overflow
at any setting, the scope filter cannot be emptied, and the theme toggle swaps the
Deezer and Spreaker URL variants.
