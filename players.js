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

const PODCAST_LABEL = 'Stuff You Should Know, the episode "Social Identity Theory: Your Group Rules, Others Drool"';
const LIVE_LABEL    = 'Z100 New York (WHTZ-FM)';

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
    id: 'iheart', name: 'iHeartRadio', status: 'ok', group: 'parity',
    allow: 'autoplay',
    modes: {
      live:    { src: 'https://www.iheart.com/live/z100-1469/?embed=true', h: 200 },
      podcast: { src: 'https://www.iheart.com/podcast/105-stuff-you-should-know-26940277/episode/social-identity-theory-your-group-343040435/?embed=true', h: 200 }
    },
    facts: {
      'Content': 'Z100 live, and the exact target episode',
      'Sign-in': 'Not required to play',
      'Discovery': 'Public oEmbed at iheart.com/oembed/?url=...&format=json returns the canonical iframe, height and allow attributes',
      'Watch out': 'The URL slug is cosmetic. The trailing numeric ID resolves the content, so a wrong slug silently returns a different episode. Source IDs from us.api.iheart.com.'
    }
  },
  {
    id: 'tunein', name: 'TuneIn', status: 'ok', group: 'parity',
    allow: 'autoplay', scrolling: 'no',
    modes: {
      live:    { src: 'https://tunein.com/embed/player/s340698/', h: 100 },
      podcast: { src: 'https://tunein.com/embed/player/p295446/', h: 350 }
    },
    facts: {
      'Content': 'Z100 live (station s340698) and the Stuff You Should Know program (p295446)',
      'Sign-in': 'Not required to play',
      'Height': 'Station player is a fixed 100px, program player 350px. Neither resizes.',
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
      podcast: { src: 'https://www.youtube.com/embed/IXbs4Gv_BuY', aspect: true,
                 caveat: 'A different episode of the same show. The target episode is not on the YouTube channel, which runs behind the audio feed.' }
    },
    facts: {
      'Content': 'Same show, different episode. Live card is a real radio simulcast from another broadcaster.',
      'Sign-in': 'Not required to play',
      'Format': 'The only genuinely video entry, which is its main point of difference. Do not read that as a flaw.',
      'Live behavior': 'The channel-based embed auto-follows whatever that channel is streaming, so it does not go stale. It shows an offline placeholder if the channel stops.',
      'Fallback': 'If Times Radio is dark, swap channel UCWw6scNyopJ0yjMu1SyOEyw (talkSPORT).'
    }
  },
  {
    id: 'applepodcasts', name: 'Apple Podcasts', status: 'ok', group: 'parity',
    allow: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write',
    modes: { podcast: { src: 'https://embed.podcasts.apple.com/us/episode/1000787615438', h: 175 } },
    facts: {
      'Content': 'The exact target episode',
      'Sign-in': 'Not required to play the full episode',
      'No live radio': 'Apple Podcasts carries no live radio, so the live view falls back to this player.',
      'Watch out': 'Autoplay is not honored. The participant must press play.'
    }
  },
  {
    id: 'spotify', name: 'Spotify', status: 'ok', group: 'parity',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    modes: { podcast: { src: 'https://open.spotify.com/embed/episode/6naVnsbI9VWEMSrqnJpIEI', h: 152 } },
    facts: {
      'Content': 'The exact target episode',
      'Sign-in': 'Not required. Podcast episodes play in full anonymously, unlike music tracks which cut to a 30 second preview.',
      'No live radio': 'Spotify has no live radio product at all, so the live view falls back to this player.',
      'Height': 'Ships at 152px compact. A 352px card variant also exists.'
    }
  },
  {
    id: 'deezer', name: 'Deezer', status: 'ok', group: 'parity', themed: true,
    allow: 'encrypted-media; clipboard-write',
    modes: { podcast: { src: 'https://widget.deezer.com/widget/{theme}/episode/929240302', h: 300 } },
    facts: {
      'Content': 'The exact target episode (Deezer podcast 1845, episode 929240302)',
      'Sign-in': 'Not required for podcasts. Music tracks are capped at 30 second previews.',
      'No live radio': 'No live broadcast product, so the live view falls back to this player.',
      'Theming': 'Follows the page theme toggle through its own light and dark URL variants.'
    }
  },
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
    modes: { podcast: { src: 'https://player.megaphone.fm/GLT4653461142', h: 200,
      caveat: 'Different show. Megaphone only serves podcasts it hosts, and it does not host this one.' } },
    facts: { 'Content': 'Unrelated show on a Megaphone-hosted feed',
             'ID source': 'The ADID is the mp3 token in the feed enclosure, traffic.megaphone.fm/{ADID}.mp3',
             'Use': 'Form comparison only' } },
  { id: 'acast', name: 'Acast', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://embed.acast.com/ec380acc-fe13-46a0-991f-a1e508d126f8', h: 200,
      caveat: 'Different show (Economist Podcasts). Acast only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Levels': 'Show-level and episode-level embeds both work', 'Use': 'Form comparison only' } },
  { id: 'libsyn', name: 'Libsyn', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://html5-player.libsyn.com/embed/episode/id/38143160/', h: 200,
      caveat: 'Different show. Libsyn only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show', 'Use': 'Form comparison only' } },
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
    modes: { podcast: { src: 'https://embeds.audioboom.com/posts/8851135/embed/v4', h: 200,
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
    modes: { podcast: { src: 'https://player.blubrry.com/id/155082134', h: 200,
      caveat: 'Different show. Blubrry only serves shows it hosts.' } },
    facts: { 'Content': 'Unrelated show',
             'Watch out': 'Use player.blubrry.com. The blubrry.com/player/{id} path returns 403 with X-Frame-Options SAMEORIGIN.',
             'Use': 'Form comparison only' } },
  { id: 'castbox', name: 'Castbox', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://castbox.fm/app/castbox/player/id2500926?v=8.22.11&autoplay=0&hide_list=1', h: 500,
      caveat: 'Different show, and channel-level rather than a single episode. Castbox is an aggregator, so it does carry this show, but the embed id could not be confirmed.' } },
    facts: { 'Content': 'Unrelated show, channel-level player',
             'Open item': 'Castbox does carry Stuff You Should Know. Its embed id was not resolvable from any public endpoint, so this card uses a known-good channel instead.',
             'Use': 'Form comparison only' } },

  /* ===================== OTHER AUDIO AND VIDEO ===================== */
  { id: 'applemusic', name: 'Apple Music', status: 'caveat', group: 'other',
    allow: 'autoplay *; encrypted-media *; fullscreen *',
    sandbox: 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation',
    modes: { live: { src: 'https://embed.music.apple.com/us/station/apple-music-1/ra.978194965', h: 450,
      caveat: 'Playback needs an Apple Music subscription and a signed-in browser. A signed-out participant gets a preview or nothing.' } },
    facts: { 'Content': 'Apple Music 1, a curated station rather than broadcast radio',
             'Sign-in': 'Required for real playback. This is why it should stay out of any listening-preference question.',
             'Recommendation': 'Visual comparison only. Any preference signal here measures the paywall, not the player.',
             'Frame': 'Needs a long specific sandbox string or the embed will not initialize.' } },
  { id: 'tidal', name: 'Tidal', status: 'caveat', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://embed.tidal.com/tracks/22560696', h: 120,
      caveat: 'Unrelated music track, and anonymous listeners get 30 seconds only. Same paywall problem as Apple Music.' } },
    facts: { 'Content': 'Unrelated music track', 'Sign-in': 'Required for full playback', 'Use': 'Visual comparison only' } },
  { id: 'npr', name: 'NPR', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://www.npr.org/player/embed/nx-s1-5953112/nx-s1-mx-5953112-1', h: 290,
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
    modes: { podcast: { src: 'https://audiomack.com/embed/future/song/purple-reign-prod-by-metro-boomin', h: 252,
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
  { id: 'dailymotion', name: 'Dailymotion', status: 'ok', group: 'other',
    allow: 'autoplay; fullscreen; picture-in-picture; web-share', allowfullscreen: true,
    modes: { podcast: { src: 'https://geo.dailymotion.com/player.html?video=xb3lqqu', aspect: true,
      caveat: 'Unrelated trending video.' } },
    facts: { 'Content': 'Unrelated video',
             'Watch out': 'The old www.dailymotion.com/embed/video/{id} path 301s to geo.dailymotion.com/player.html. Use the geo host directly.',
             'Use': 'Form comparison only' } },
  { id: 'tiktok', name: 'TikTok', status: 'ok', group: 'other',
    allow: 'fullscreen', allowfullscreen: true,
    modes: { podcast: { src: 'https://www.tiktok.com/embed/v2/6718335390845095173', h: 740,
      caveat: 'Unrelated video. Included because short-form video is a real distribution surface.' } },
    facts: { 'Content': 'Unrelated video', 'Sign-in': 'Not required to play',
             'Watch out': 'Their oEmbed returns a blockquote plus a script, not an iframe. The iframe route is /embed/v2/{id}.',
             'Use': 'Form comparison only' } },
  { id: 'twitch', name: 'Twitch', status: 'caveat', group: 'other',
    allowfullscreen: true, needsParent: true,
    modes: { live: { src: 'https://player.twitch.tv/?channel=twitch&parent={host}', aspect: true,
      caveat: 'Unrelated live channel, and this card only works on a real domain. Twitch reflects the parent parameter into frame-ancestors, so it is blank when the page is opened from a local file.' } },
    facts: { 'Content': 'Unrelated live channel',
             'Parent rule': 'parent= must name the exact hostname. On a deployed domain you get HTTPS only, no wildcard subdomains, no port. On localhost, parent=localhost grants any port and either scheme.',
             'Why it is here': 'The only live video platform in the roster besides YouTube.',
             'Offline case': 'Twitch channels go on and off air. When the channel is dark the player shows an OFFLINE panel with a recent rerun, which is a real state but a weak stimulus. Check it before a session and swap the channel if needed.',
             'Verified': 'Renders on thamada-cloud.github.io. It will be blank from a local file, which is expected, not a bug.' } },

  /* SoundCloud and Zeno.fm were added after the first build. SoundCloud closes a
     real gap in the audio brand set. Zeno.fm roughly triples the live radio arm,
     which is otherwise just iHeart and TuneIn. */
  { id: 'soundcloud', name: 'SoundCloud', status: 'ok', group: 'other',
    allow: 'autoplay; encrypted-media; fullscreen',
    modes: { podcast: { src: 'https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F274720380', h: 300,
      caveat: 'Unrelated music track. SoundCloud does not carry this show.' } },
    facts: { 'Content': 'Unrelated music track',
             'Sign-in': 'Not required to play',
             'ID source': 'Free oEmbed at soundcloud.com/oembed?format=json&url={permalink} returns the numeric track id and the full iframe',
             'Heights': 'Ships at 166, 300 or 450. The visual variant needs 300 or more.',
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
  { id: 'brightcove', name: 'Brightcove', status: 'ok', group: 'infra',
    allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowfullscreen: true,
    modes: { podcast: { src: 'https://players.brightcove.net/1752604059001/default_default/index.html?videoId=6140448705001', aspect: true,
      caveat: 'Unrelated video on the Brightcove demo account.' } },
    facts: { 'Content': 'Unrelated video',
             'Pattern': 'players.brightcove.net/{accountId}/{playerId}/index.html?videoId={id}. Every part is account-specific.',
             'Why it is here': 'The enterprise broadcast video player many media companies license.',
             'Use': 'Chrome reference only. Not a participant card.' } },
  { id: 'streamable', name: 'Streamable', status: 'ok', group: 'infra',
    allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true,
    modes: { podcast: { src: 'https://streamable.com/e/moo', aspect: true,
      caveat: 'Unrelated video.' } },
    facts: { 'Content': 'Unrelated video',
             'Why it is here': 'The minimal end of the video player spectrum, near zero chrome. A useful lower bound.',
             'Use': 'Chrome reference only. Not a participant card.' } },
  { id: 'odysee', name: 'Odysee', status: 'ok', group: 'infra',
    allow: 'autoplay; fullscreen; encrypted-media', allowfullscreen: true,
    modes: { podcast: { src: 'https://odysee.com/$/embed/@Odysee:8/welcome-to-odysee:8', aspect: true,
      caveat: 'Unrelated video.' } },
    facts: { 'Content': 'Unrelated video',
             'Why it is here': 'An independent video platform, a different design tradition from YouTube.',
             'Use': 'Chrome reference only. Not a participant card.' } },

  { id: 'ivoox', name: 'iVoox', status: 'ok', group: 'hosts',
    allow: 'autoplay; encrypted-media',
    modes: { podcast: { src: 'https://www.ivoox.com/player_ej_179998078_4_1.html', h: 200,
      caveat: 'Unrelated Spanish-language episode. iVoox does not carry this show.' } },
    facts: { 'Content': 'Unrelated Spanish-language episode',
             'Why it is here': 'The largest Spanish-language podcast platform. Relevant only if reach outside the US matters.',
             'Watch out': 'The player 200s for any id, including fabricated ones. This id came from a real episode link on ivoox.com, pattern player_ej_{id}_4_1.html.',
             'Use': 'Form comparison only' } },

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

/* Which mode entry does this player actually show, and did it fall back? */
function resolveEntry(p, mode) {
  if (p.status === 'blocked') return { blocked: true };
  const wanted = p.modes[mode];
  if (wanted) return { entry: wanted, fellBack: false };
  const other = mode === 'live' ? 'podcast' : 'live';
  const alt = p.modes[other];
  if (alt) return { entry: alt, fellBack: true, from: mode, to: other };
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

/* Fallback notice, worded by direction. Live-only players such as Zeno.fm,
   Apple Music and Twitch fall back the other way, and telling a moderator the
   opposite of the truth mid-session is worse than saying nothing. */
function fallbackText(to) {
  return to === 'podcast'
    ? 'No live radio on this platform. Showing its podcast player instead.'
    : 'No podcast on this platform. Showing its live radio player instead.';
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
  if (p.scrolling) f.setAttribute('scrolling', p.scrolling);
  if (!entry.aspect) f.height = entry.h;
  return f;
}

/* Per-group tallies, used to stamp counts onto the scope chips. */
function groupCounts() {
  const t = {};
  PLAYERS.forEach((p) => { t[p.group] = (t[p.group] || 0) + 1; });
  return t;
}
