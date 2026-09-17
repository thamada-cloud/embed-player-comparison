/* ============================================================================
   SHARED PLAYER REGISTRY

   One source of truth for both pages. index.html steps through players one at a
   time for a moderated session. gallery.html stacks them all on one scrolling
   page. Adding a player here appears on both, which is the whole point of the
   file existing.

   Every entry was verified by loading it in a real cross-origin iframe and
   checking it paints. A 200 response proves nothing here: Vimeo, Bandcamp,
   Simplecast, Zeno.fm and iVoox all return 200 for content that cannot play.

   status  'ok'      renders the iframe
           'caveat'  renders the iframe plus a visible moderator warning
           'blocked' renders no iframe, shows `why` and `detail` instead
   modes   one entry per content type. A player missing one mode falls back to
           the other and says so, worded by the direction of the fallback.
   h       fixed pixel height, or aspect:true for a 16:9 video frame. Heights are
           per player on purpose: they run from TuneIn's fixed 100px to TikTok's
           740px, and forcing a common height would misrepresent every player.
   group   key into GROUPS. Drives the scope filter on both pages.
   ==========================================================================*/

const LIVE_LABEL = 'Z100 New York (WHTZ-FM)';

/* One track across every player that can embed one, so music mode compares the
   chrome rather than the content. Each id was resolved from the service's own
   public endpoint, never guessed, and every embed below was loaded in a real
   cross-origin iframe and checked that it PAINTS. That check earned its keep:
   four of the eight candidates rendered something wrong rather than nothing.
   See MUSIC_NOTES for what failed and why. */
const MUSIC_LABEL = 'Blinding Lights, The Weeknd';

/* Two podcasts, switchable. Each maps to its own mode key in a player's `modes`,
   so a player can carry one, both, or neither, and the fallback chain below
   handles the gaps honestly instead of showing the wrong show silently. */
const SHOWS = {
  sysk: { label: 'Stuff You Should Know', mode: 'podcast',
          episode: 'Social Identity Theory: Your Group Rules, Others Drool' },
  cj:   { label: 'Crime Junkie',          mode: 'podcastCJ',
          episode: 'UPDATE: The Sodder Children' }
};
const SHOW_BY_MODE = { podcast: 'sysk', podcastCJ: 'cj' };

function showLabel(mode) {
  const k = SHOW_BY_MODE[mode];
  return k ? SHOWS[k].label + ', the episode "' + SHOWS[k].episode + '"' : LIVE_LABEL;
}

/* Kept for anything still importing the old constant. */
const PODCAST_LABEL = showLabel('podcast');

/* Group metadata. `parity` is the only group on by default, which keeps a real
   session to 7 cards. The others are for internal review. */
const GROUPS = {
  parity:  { label: 'Core',    note: 'Same station and same episode in every player. This is the valid comparison set.' },
  hosts:   { label: 'Hosts',   note: 'Podcast hosting players. Different content, because each one only serves shows it hosts. These are what publishers actually embed, so compare the player chrome.' },
  other:   { label: 'Other',   note: 'Other audio and video embeds. Different content. Form comparison only.' },
  infra:   { label: 'Infra',   note: 'White-label and enterprise player infrastructure. Useful for deciding what our own player chrome should look like. Keep these out of a participant session, they are not consumer brands.' },
  blocked: { label: 'Blocked', note: 'Cannot be embedded at all. Kept visible with the reason so the team stops re-asking.' }
};

const PLAYERS = [
  /* ===================== CORE, same content ===================== */
  {
    id: 'iheart', name: 'iHeartRadio', status: 'ok', group: 'parity', themed: true,
    allow: 'autoplay',
    modes: {
      live:    { src: 'https://www.iheart.com/live/z100-1469/?embed=true&theme={theme}', h: 200 },
      podcast: { src: 'https://www.iheart.com/podcast/105-stuff-you-should-know-26940277/episode/social-identity-theory-your-group-343040435/?embed=true&theme={theme}', h: 200 },
      podcastCJ: { src: 'https://www.iheart.com/podcast/crime-junkie-29319113/episode/update-the-sodder-children-343319869/?embed=true&theme={theme}', h: 200 }
    },
    facts: {
      'Content': 'Z100 live, plus the exact target episode of both shows',
      'Sign-in': 'Not required to play',
      'Discovery': 'Public oEmbed at iheart.com/oembed/?url=...&format=json returns the canonical iframe, height and allow attributes',
      'Theme': 'Takes &theme=light or &theme=dark on the embed URL, which the theme control here drives. Served by the legacy widget app, whose getThemeFromQuery reads the query string and falls back to light on anything it does not recognise. It ignores prefers-color-scheme entirely, which is why an earlier measurement filed it as having one fixed appearance.',
      'Watch out': 'The URL slug is cosmetic. The trailing numeric ID resolves the content, so a wrong slug silently returns a different episode. Source IDs from us.api.iheart.com.'
    }
  },
  {
    id: 'tunein', name: 'TuneIn', status: 'ok', group: 'parity',
    allow: 'autoplay', scrolling: 'no',
    modes: {
      live:    { src: 'https://tunein.com/embed/player/s340698/', h: 100 },
      podcast: { src: 'https://tunein.com/embed/player/p295446/', h: 350, scrolling: 'auto' },
      podcastCJ: { src: 'https://tunein.com/embed/player/p1086263/', h: 350, scrolling: 'auto' }
    },
    facts: {
      'Content': 'Z100 live (station s340698), plus the Stuff You Should Know (p295446) and Crime Junkie (p1086263) programmes',
      'Sign-in': 'Not required to play',
      'Height': 'Station player is a fixed 100px and must not scroll. The programme player is a 350px window onto a 1352px episode list, so it scrolls internally.',
      'Watch out': 'Two decoys share the Z100 name, s343865 and s26824. Both are different stations.'
    }
  },
  {
    id: 'youtube', name: 'YouTube', status: 'ok', group: 'parity',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: true,
    modes: {
      live:    { src: 'https://www.youtube.com/embed/live_stream?channel=UCF-VP3b3oH0XASqsLI5rnLw', aspect: true,
                 caveat: 'Times Radio, a real broadcast station simulcasting 24/7. No iHeart station simulcasts live on YouTube, so this stands in for the format.' },
      podcast: { src: 'https://www.youtube.com/embed/p7sNqWWk1No', aspect: true,
                 caveat: 'Different content: a 2m46s KFI AM 640 clip, not the target episode. Still iHeart content, unlike the earlier stand-in.' },
      podcastCJ: { src: 'https://www.youtube.com/embed/q9Uv9QkDlCU', aspect: true,
                   caveat: 'A different Crime Junkie episode, 56m, from their own channel. The target episode is not posted there.' }
    },
    facts: {
      'Content': 'Podcast card is a KFI AM 640 clip, "Gary Hoffmann Slams MLB\'s Netflix Debut", 2m46s. KFI is an iHeart station, so this is real iHeart content rather than a third-party stand-in, but it is a short clip and not the episode the other players are playing. Live card is a real radio simulcast from another broadcaster.',
      'Sign-in': 'Not required to play',
      'Format': 'The only genuinely video entry, which is its main point of difference. Do not read that as a flaw.',
      'Length': 'At 2m46s this is far shorter than the 47 minute episode elsewhere, so do not compare progress bars or timecodes against the other cards.',
      'Live behavior': 'The channel-based embed auto-follows whatever that channel is streaming, so it does not go stale. It shows an offline placeholder if the channel stops.',
      'Fallback': 'If Times Radio is dark, swap channel UCWw6scNyopJ0yjMu1SyOEyw (talkSPORT).'
    }
  },
  {
    id: 'applepodcasts', name: 'Apple Podcasts', status: 'ok', group: 'parity',
    allow: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write',
    modes: { podcast: { src: 'https://embed.podcasts.apple.com/us/episode/1000787615438', h: 165 },
             podcastCJ: { src: 'https://embed.podcasts.apple.com/us/episode/1000787219983', h: 165 } },
    facts: {
      'Content': 'The exact target episode of both shows',
      'Sign-in': 'Not required to play the full episode',
      'No live radio': 'Apple Podcasts carries no live radio, so the live view falls back to this player.',
      'Watch out': 'Autoplay is not honored. The participant must press play.'
    }
  },
  {
    id: 'spotify', name: 'Spotify', status: 'ok', group: 'parity',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    modes: { podcast: { src: 'https://open.spotify.com/embed/episode/6naVnsbI9VWEMSrqnJpIEI', h: 152 },
             podcastCJ: { src: 'https://open.spotify.com/embed/episode/3OxGBFEZ5mUzXC1pG0kX2d', h: 152 },
             music: { src: 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b', h: 152 } },
    facts: {
      'Content': 'The exact target episode of both shows',
      'Sign-in': 'Not required. Podcast episodes play in full anonymously, unlike music tracks which cut to a 30 second preview.',
      'No live radio': 'Spotify has no live radio product at all, so the live view falls back to this player.',
      'Height': 'Ships at 152px compact. A 352px card variant also exists.'
    }
  },
  {
    /* Added for music mode. Apple Podcasts is a separate product and a separate
       entry; this is the music one, and it is the only other service on the
       roster that embeds a single on-demand track. */
    id: 'applemusic', name: 'Apple Music', status: 'caveat', group: 'parity',
    why: 'Plays a 30 second preview unless the viewer is signed in to a subscription.',
    allow: 'autoplay; encrypted-media; clipboard-write',
    sandbox: 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation',
    modes: { music: { src: 'https://embed.music.apple.com/us/album/blinding-lights/1499378108?i=1499378607', h: 175 } },
    facts: {
      'Content': 'The target track (Apple album 1499378108, track 1499378607)',
      'Sign-in': 'A signed-out viewer gets a 30 second preview and a Sign In button, so any preference it attracts is partly about the paywall rather than the player.',
      'Podcasts elsewhere': 'Apple serves podcasts from a different host and a different embed, which is the separate Apple Podcasts entry.',
      'Height': 'Ships at 175px for a single track.'
    }
  },
  {
    id: 'deezer', name: 'Deezer', status: 'ok', group: 'parity', themed: true,
    allow: 'encrypted-media; clipboard-write',
    modes: { podcast: { src: 'https://widget.deezer.com/widget/{theme}/episode/929240302', h: 300 },
             podcastCJ: { src: 'https://widget.deezer.com/widget/{theme}/episode/930917952', h: 300 },
             music: { src: 'https://widget.deezer.com/widget/{theme}/track/908604612', h: 300 } },
    facts: {
      'Content': 'The exact target episode of both shows (Deezer 929240302 and 930917952)',
      'Sign-in': 'Not required for podcasts. Music tracks are capped at 30 second previews.',
      'No live radio': 'No live broadcast product, so the live view falls back to this player.',
      'Theming': 'Follows the page theme toggle through its own light and dark URL variants.'
    }
  },
  { id: 'tidal', name: 'Tidal', status: 'caveat', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://embed.tidal.com/tracks/22560696', h: 120,
      caveat: 'Unrelated music track, and anonymous listeners get 30 seconds only. Same paywall problem as Apple Music.' } },
    facts: { 'Content': 'Unrelated music track', 'Sign-in': 'Required for full playback',
             'Height': 'The documented 120px is correct and renders a complete player. Measurement reports 304px of content below the fold at every frame height, which is a hidden panel, not clipping. Do not chase it.',
             'Use': 'Visual comparison only' } },
  {
    id: 'omny', name: 'Omny Studio', status: 'ok', group: 'parity',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://omny.fm/shows/stuff-you-should-know-1/social-identity-theory-your-group-rules-others-drool/embed', h: 200 } },
    facts: {
      'Content': 'The exact target episode',
      'Sign-in': 'Not required to play',
      'Why it is here': 'Omny is iHeart-owned and is the actual host serving iHeart podcast audio. Participants have never heard of it, so read this as an internal reference rather than a brand comparison.',
      'Watch out': 'The show slug is stuff-you-should-know-1, not stuff-you-should-know. The unsuffixed slug 404s at episode level.',
      'No live radio': 'Podcast hosting only.'
    }
  },

  /* ===================== PODCAST HOSTING PLAYERS ===================== */
  { id: 'megaphone', name: 'Megaphone', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://player.megaphone.fm/GLT4653461142', h: 374,
      caveat: 'Different show. Megaphone only serves podcasts it hosts, and it does not host this one.' } },
    facts: { 'Content': 'Unrelated show on a Megaphone-hosted feed',
             'ID source': 'The ADID is the mp3 token in the feed enclosure, traffic.megaphone.fm/{ADID}.mp3',
             'Use': 'Form comparison only' } },
  { id: 'acast', name: 'Acast', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://embed.acast.com/ec380acc-fe13-46a0-991f-a1e508d126f8', h: 200,
      caveat: 'Different show (Economist Podcasts). Acast only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Levels': 'Show-level and episode-level embeds both work', 'Use': 'Form comparison only' } },
  { id: 'captivate', name: 'Captivate', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://player.captivate.fm/episode/89833521-aae1-4b28-8ad3-fae843746ee7', h: 200,
      caveat: 'Different show. Captivate only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Note': 'Server-renders its real title, which makes it the easiest of the small hosts to verify', 'Use': 'Form comparison only' } },
  { id: 'transistor', name: 'Transistor', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://share.transistor.fm/e/2de9c335', h: 200,
      caveat: 'Different show. Transistor only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Use': 'Form comparison only' } },
  { id: 'simplecast', name: 'Simplecast', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://player.simplecast.com/4a64cc76-fe4a-4858-b34d-d6b61e6eccef?dark=true', h: 200,
      caveat: 'Different show. Simplecast only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show',
             'Watch out': 'The player id is NOT the RSS guid. Feed guids 404 against their API. Verify with api.simplecast.com/episodes/{id}, since the player HTML is a static shell that returns 200 regardless.',
             'Use': 'Form comparison only' } },
  { id: 'audioboom', name: 'Audioboom', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://embeds.audioboom.com/posts/8851135/embed/v4', h: 300,
      caveat: 'Different show. Audioboom only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Use': 'Form comparison only' } },
  { id: 'spreaker', name: 'Spreaker', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media', themed: true,
    modes: { podcast: { src: 'https://widget.spreaker.com/player?episode_id=45323435&theme={theme}', h: 200,
      caveat: 'Different show. Spreaker only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show',
             'Watch out': 'Use widget.spreaker.com. The www.spreaker.com/widgets/player path sends X-Frame-Options SAMEORIGIN.',
             'Use': 'Form comparison only' } },
  { id: 'podbean', name: 'Podbean', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media', scrolling: 'no',
    modes: { podcast: { src: 'https://www.podbean.com/player-v2/?i=ng2ci-1865db7-pb', h: 150,
      caveat: 'Different show. Podbean only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Size': 'Ships at 500 by 150', 'Use': 'Form comparison only' } },
  { id: 'buzzsprout', name: 'Buzzsprout', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://www.buzzsprout.com/2170846/episodes/12628304?client_source=small_player&iframe=true', h: 200,
      caveat: 'Different show. Buzzsprout only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'ID source': 'Episode id is the Buzzsprout-{id} value in the feed guid', 'Use': 'Form comparison only' } },
  { id: 'blubrry', name: 'Blubrry', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://player.blubrry.com/id/155082134', h: 172,
      caveat: 'Different show. Blubrry only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show',
             'Watch out': 'Use player.blubrry.com. The blubrry.com/player/{id} path returns 403 with X-Frame-Options SAMEORIGIN.',
             'Use': 'Form comparison only' } },
  { id: 'castbox', name: 'Castbox', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://castbox.fm/app/castbox/player/id2500926?v=8.22.11&autoplay=0&hide_list=1', h: 210,
      caveat: 'Different show, and channel-level rather than a single episode. Castbox is an aggregator, so it does carry this show, but the embed id could not be confirmed.' } },
    facts: { 'Content': 'Unrelated show, channel-level player',
             'Open item': 'Castbox does carry Stuff You Should Know. Its embed id was not resolvable from any public endpoint, so this card uses a known-good channel instead.',
             'Use': 'Form comparison only' } },

  /* ===================== OTHER AUDIO AND VIDEO ===================== */
  { id: 'npr', name: 'NPR', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://www.npr.org/player/embed/nx-s1-5953112/nx-s1-mx-5953112-1', h: 215,
      caveat: 'Unrelated NPR story audio. NPR embeds only its own content.' } },
    facts: { 'Content': 'Unrelated NPR story',
             'Pattern': 'npr.org/player/embed/{storyId}/{audioId}. The story page prints its own embed URL in the HTML, which is how to harvest IDs.',
             'Use': 'Form comparison only. A strong reference point for public-radio audio chrome.' } },
  { id: 'mixcloud', name: 'Mixcloud', status: 'ok', group: 'other',
    allow: 'encrypted-media; fullscreen; autoplay; web-share',
    modes: { podcast: { src: 'https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=https%3A%2F%2Fwww.mixcloud.com%2FNTSRadio%2Fbridget-small-2nd-september-2026%2F', h: 120,
      caveat: 'Unrelated NTS Radio show replay. The closest thing to a radio programme in this group, but it is on-demand, not live.' } },
    facts: { 'Content': 'Unrelated radio show replay', 'Sign-in': 'Not required, plays in full with ads', 'Use': 'Form comparison only' } },
  { id: 'audiomack', name: 'Audiomack', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media', scrolling: 'no',
    modes: { podcast: { src: 'https://audiomack.com/embed/future/song/purple-reign-prod-by-metro-boomin', h: 266,
      caveat: 'Unrelated music track.' } },
    facts: { 'Content': 'Unrelated music track',
             'Note': 'Sends frame-ancestors *, the most permissive policy in the whole roster',
             'Use': 'Form comparison only' } },
  { id: 'bandcamp', name: 'Bandcamp', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://bandcamp.com/EmbeddedPlayer/v=2/album=4070884389/size=large/tracklist=false/artwork=small/', h: 120,
      caveat: 'Unrelated album.' } },
    facts: { 'Content': 'Unrelated album',
             'Watch out': 'Returns 200 even for bogus album ids, and some label-exclusive releases refuse specific hosts with an in-player message. Get ids from the album id comment in the artist page HTML.',
             'Use': 'Form comparison only' } },
  { id: 'vimeo', name: 'Vimeo', status: 'ok', group: 'other',
    allow: 'autoplay; fullscreen; picture-in-picture; clipboard-write', allowfullscreen: true,
    modes: { podcast: { src: 'https://player.vimeo.com/video/347119375', aspect: true,
      caveat: 'Unrelated sample video. A second video comparison point next to YouTube.' } },
    facts: { 'Content': 'Unrelated video',
             'Watch out': 'The player returns 200 for private and deleted videos. Confirm a video is really playable with the key-free vimeo.com/api/oembed.json?url= endpoint, which 404s when it is not.',
             'Use': 'Form comparison only' } },
  /* Live video, which is the surface live radio would actually extend onto.
     Both were loaded in a real cross-origin iframe and PAINT: Twitch drew its
     player around a "Monstercat is offline" card and Kick drew its own around
     "Trainwreckstv is offline", which is the player working rather than
     failing. Neither logged a frame refusal. */
  { id: 'twitch', name: 'Twitch', status: 'caveat', group: 'other',
    allow: 'autoplay; fullscreen', allowfullscreen: true,
    modes: { live: { src: 'https://player.twitch.tv/?channel=monstercat&parent=thamada-cloud.github.io&muted=true',
      aspect: true,
      caveat: 'Unrelated channel, and it shows an offline card whenever that channel is not streaming.' } },
    facts: { 'Content': 'Unrelated live channel',
             'Watch out': 'The only player here whose embed is tied to the HOST. `parent=` must name the exact domain doing the embedding, so this card works on thamada-cloud.github.io and nowhere else, local files included. It cannot be verified before deploy.',
             'Offline': 'A channel that is not live renders an offline card rather than a blank frame, so the card is honest either way.',
             'Use': 'Form comparison only' } },
  { id: 'kick', name: 'Kick', status: 'caveat', group: 'other',
    allow: 'autoplay; fullscreen', allowfullscreen: true,
    modes: { live: { src: 'https://player.kick.com/trainwreckstv', aspect: true,
      caveat: 'Unrelated channel, and it shows an offline card whenever that channel is not streaming.' } },
    facts: { 'Content': 'Unrelated live channel',
             'Host': 'No parent parameter, unlike Twitch, so it embeds anywhere.',
             'Offline': 'Renders an offline card rather than a blank frame.',
             'Use': 'Form comparison only' } },
  { id: 'tiktok', name: 'TikTok', status: 'ok', group: 'other',
    allow: 'fullscreen', allowfullscreen: true,
    modes: { podcast: { src: 'https://www.tiktok.com/embed/v2/6718335390845095173', h: 740,
      caveat: 'Unrelated video. Included because short-form video is a real distribution surface.' } },
    facts: { 'Content': 'Unrelated video', 'Sign-in': 'Not required to play',
             'Autoplay': 'Starts on its own, muted, and cannot be stopped by any parameter. Unlike Dailymotion, which was removed for autoplaying with sound, muted autoplay genuinely is TikTok\'s default state, so this card is honest. It is never granted the autoplay permission, so it can never gain sound.',
             'Watch out': 'Their oEmbed returns a blockquote plus a script, not an iframe. The iframe route is /embed/v2/{id}.',
             'Use': 'Form comparison only' } },
  { id: 'soundcloud', name: 'SoundCloud', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media; fullscreen',
    modes: { podcast: { src: 'https://w.soundcloud.com/player/?visual=false&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F274720380', h: 166,
      caveat: 'Unrelated music track. SoundCloud does not carry this show.' } },
    facts: { 'Content': 'Unrelated music track',
             'Sign-in': 'Not required to play',
             'ID source': 'Free oEmbed at soundcloud.com/oembed?format=json&url={permalink} returns the numeric track id and the full iframe',
             'Heights': 'Compact is 166px. The visual variant needs 605px, which measured as clipped at anything less, so this card uses compact.',
             'Use': 'Form comparison only' } },

  { id: 'zeno', name: 'Zeno.fm', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { live: { src: 'https://zeno.fm/player/espn-radio-kvsf', h: 250,
      caveat: 'ESPN Radio KVSF, a real US broadcast station, standing in for Z100. Zeno does not carry iHeart stations.' } },
    facts: { 'Content': 'ESPN Radio KVSF live. A real commercial broadcast station, which makes it the closest competitive analogue to Z100 in this roster.',
             'Sign-in': 'Not required to play',
             'Why it matters': 'Free, no ownership requirement, and the only meaningful addition to the live radio arm besides iHeart and TuneIn.',
             'Alternates': 'Swap the slug for bbc-world-service-english, france-inter-tgbo or abc-newsradio. BBC World Service is notable because BBC Sounds itself refuses framing.',
             'ID source': 'Free public station API at zeno.fm/api/stations',
             'Watch out': 'The player URL returns 200 for any slug, real or not, at an identical byte length. Confirm a station by loading the frame and checking it mounts an audio element, not by status code.' } },

  /* ===================== PLAYER INFRASTRUCTURE ===================== */
  { id: 'wistia', name: 'Wistia', status: 'ok', group: 'infra',
    allow: 'autoplay; fullscreen; picture-in-picture; clipboard-write', allowfullscreen: true,
    modes: { podcast: { src: 'https://fast.wistia.net/embed/iframe/26sk4lmiix', aspect: true,
      caveat: 'Unrelated video. Wistia is a white-label host, so there is no consumer brand to react to.' } },
    facts: { 'Content': 'Unrelated video',
             'Why it is here': 'A widely used white-label video player. Look at the chrome, not the brand.',
             'Use': 'Chrome reference only. Not a participant card.' } },
  { id: 'streamable', name: 'Streamable', status: 'ok', group: 'infra',
    allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true,
    modes: { podcast: { src: 'https://streamable.com/e/moo', aspect: true,
      caveat: 'Unrelated video.' } },
    facts: { 'Content': 'Unrelated video',
             'Why it is here': 'The minimal end of the video player spectrum, near zero chrome. A useful lower bound.',
             'Use': 'Chrome reference only. Not a participant card.' } },
  /* ===================== CANNOT BE EMBEDDED ===================== */
  { id: 'amazonmusic', name: 'Amazon Music', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options SAMEORIGIN',
    detail: 'Confirmed twice, including with browser iframe request headers. There is no embed product and no workaround.' },
  { id: 'youtubemusic', name: 'YouTube Music', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options SAMEORIGIN',
    detail: 'music.youtube.com cannot be framed. Use the YouTube card, which serves the same audio.' },
  { id: 'pocketcasts', name: 'Pocket Casts', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options SAMEORIGIN',
    detail: 'The WordPress Pocket Casts block is oEmbed rendering its own custom player, not an iframe of pca.st. No embeddable player exists.' },
  { id: 'radionet', name: 'Radio.net', status: 'blocked', group: 'blocked',
    why: 'CSP frame-ancestors allows only its own CMS domains',
    detail: 'frame-ancestors is limited to radio.net itself plus cms.radiodevtools.net. Every public host is excluded.' },
  { id: 'live365', name: 'Live365', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options DENY',
    detail: 'Broadcasters get widget code from their own dashboard. No public frameable URL exists.' },
  { id: 'pandora', name: 'Pandora', status: 'blocked', group: 'blocked',
    why: 'No public embed exists',
    detail: 'Station pages send X-Frame-Options SAMEORIGIN and pandora.com/oembed/ returns 404. Confirmed dead end.' },
  { id: 'siriusxm', name: 'SiriusXM', status: 'blocked', group: 'blocked',
    why: 'Subscriber-login app, no embed product',
    detail: 'player.siriusxm.com is frameable but has no anonymous playback and no embed player.' },
  { id: 'globalplayer', name: 'Global Player', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options SAMEORIGIN',
    detail: 'Capital, Heart, LBC and Classic FM all sit behind globalplayer.com, which refuses framing.' },
  { id: 'audacy', name: 'Audacy', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options SAMEORIGIN for third parties',
    detail: 'Audacy does ship an iframe embed, but only through Creator Lab for content you own. Live station pages refuse framing.' },
  { id: 'bbcsounds', name: 'BBC Sounds', status: 'blocked', group: 'blocked',
    why: 'No embed product, and UK geo-restricted',
    detail: 'Live pages are technically frameable but serve the full Sounds app, and a US panel gets nothing.' },
  { id: 'substack', name: 'Substack', status: 'blocked', group: 'blocked',
    why: 'No outbound podcast embed exists',
    detail: 'Substack podcasts cannot be embedded on external sites. Only the subscribe widget goes outward.' },
  { id: 'streema', name: 'Streema', status: 'blocked', group: 'blocked',
    why: 'No embed product',
    detail: 'The only iframes on a Streema station page are analytics and a support form.' },
  { id: 'radiogarden', name: 'Radio Garden', status: 'blocked', group: 'blocked',
    why: 'No iframe player',
    detail: 'radio.garden/embed/ returns 404. The visit URL is frameable but serves the whole globe app, not a widget. Their content API is public if you want to build your own audio element.' },
  { id: 'radiofrance', name: 'Radio France', status: 'blocked', group: 'blocked',
    why: 'Sends X-Frame-Options DENY',
    detail: 'No public embed player.' }
];

/* ============================================================================
   SHARED HELPERS
   Pure functions, no page state, so both pages behave identically.
   ==========================================================================*/

/* Ordered fallbacks per mode. A podcast falls back to the other podcast before
   it falls back to live radio, because a different episode of a different show
   is a closer substitute than a completely different medium. */
const FALLBACK = {
  /* Empty, for the same reason music is. Live radio substituted a podcast on 25
     of the 29 players, so a Live Radio view was mostly not live radio, and the
     gallery never said so. A podcast player has no live stream to show and
     nothing to learn from pretending: the four that carry one are the whole
     comparison. Podcast falls back to the OTHER podcast, which is a real
     substitution worth making, and is now labelled where it happens. */
  live:      [],
  podcast:   ['podcastCJ'],
  podcastCJ: ['podcast'],
  /* Deliberately empty. The other modes fall back because a podcast player
     showing the wrong show still tells you something about its chrome. Music is
     different: a player with no track embed has nothing to substitute, and
     filling the grid with podcast cards under a Music heading would answer a
     question nobody asked. Music mode shows only the players that do music. */
  music:     []
};

/* What failed the paint check, kept here so nobody re-tries them from memory.
   Every one returned a 200 and rendered something, which is exactly why the
   registry's rule is to look at the frame rather than the status code. */
const MUSIC_NOTES = {
  iheart:     'No track embed exists. ?embed=true on a song URL serves the full site chrome with a mini player on an unrelated station.',
  youtube:    'Error 153, embedding disabled. True of the official video and the official audio upload alike, which is normal for major label music.',
  tidal:      'Has a track embed, but no public endpoint to resolve an id from, and a guessed id resolved to an unrelated track.',
  soundcloud: 'Same. The track endpoint needs a client id to search.',
  audiomack:  'Refused the frame.'
};

/* Which mode entry does this player actually show, and did it fall back? */
function resolveEntry(p, mode) {
  if (p.status === 'blocked') return { blocked: true };
  if (p.modes[mode]) return { entry: p.modes[mode], fellBack: false };
  for (const alt of (FALLBACK[mode] || [])) {
    if (p.modes[alt]) return { entry: p.modes[alt], fellBack: true, from: mode, to: alt };
  }
  return { blocked: true };
}

/* Substitute the per-page bits. `theme` picks a platform's own light or dark
   variant; `{host}` is for Twitch, which reflects parent= into frame-ancestors
   and so only works on a real domain. */
function buildSrc(p, entry, theme) {
  return entry.src
    .replace('{theme}', p.themed ? theme : 'dark')
    .replace('{host}', location.hostname || 'localhost');
}

/* Fallback notice, worded by what was asked for and what was substituted.
   Getting this wrong is worse than saying nothing: live-only players such as
   Zeno.fm fall back the opposite way from podcast-only ones, and a show
   substitution is a different thing again from a medium substitution. */
function fallbackText(to, from) {
  if (to === 'live') return 'No podcast on this platform. Showing its live radio player instead.';
  if (from === 'live') return 'No live radio on this platform. Showing its podcast player instead.';
  const missing = SHOW_BY_MODE[from], shown = SHOW_BY_MODE[to];
  if (missing && shown) {
    return SHOWS[missing].label + ' is not on this platform. Showing ' +
           SHOWS[shown].label + ' instead.';
  }
  return 'Showing different content on this platform.';
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* Apply the shared iframe attributes for a player. Kept here so the two pages
   cannot drift on allow / sandbox / scrolling, which is exactly the kind of
   difference that makes one page silently blank. */
function applyFrameAttrs(f, p, entry, theme) {
  f.src = buildSrc(p, entry, theme);
  f.title = p.name + ' embed player';
  f.setAttribute('frameborder', '0');
  if (p.allow) f.setAttribute('allow', p.allow);
  if (p.allowfullscreen) f.setAttribute('allowfullscreen', '');
  if (p.sandbox) f.setAttribute('sandbox', p.sandbox);
  /* Per-mode override: TuneIn's station player is a fixed 100px and must not
     scroll, but its programme player is a 1352px episode list inside a 350px
     frame and has to. */
  const scrolling = entry.scrolling || p.scrolling;
  if (scrolling) f.setAttribute('scrolling', scrolling);
  if (!entry.aspect) f.height = entry.h;
  return f;
}
