/* ============================================================================
   iHeart's public API. Every endpoint used here answers with
   Access-Control-Allow-Origin, as does the audio and the artwork it points at,
   which is what makes both the analyser and the colour extraction possible
   from the browser with nothing hosted locally.
   ==========================================================================*/
const API = 'https://us.api.iheart.com/api';
const jget = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

const searchPodcasts = (q) => jget(`${API}/v3/search/all?keywords=${encodeURIComponent(q)}` +
  `&maxRows=8&bundle=false&station=false&artist=false&track=false&playlist=false&podcast=true`)
  .then((d) => (d.results && d.results.podcasts) || []);

const searchStations = (q) => jget(`${API}/v3/search/all?keywords=${encodeURIComponent(q)}` +
  `&maxRows=8&bundle=false&station=true&artist=false&track=false&playlist=false&podcast=false`)
  .then((d) => (d.results && d.results.stations) || []);

const searchArtists = (q) => jget(`${API}/v3/search/all?keywords=${encodeURIComponent(q)}` +
  `&maxRows=8&bundle=false&station=false&artist=true&track=false&playlist=false&podcast=false`)
  .then((d) => (d.results && d.results.artists) || []);

/* A playlist is addressed by TWO ids, the owner and the collection, so the
   result's userId is carried through the picker alongside its id. Everything
   else here needs one. */
const searchPlaylists = (q) => jget(`${API}/v3/search/all?keywords=${encodeURIComponent(q)}` +
  `&maxRows=8&bundle=false&station=false&artist=false&track=false&playlist=true&podcast=false`)
  .then((d) => (d.results && d.results.playlists) || []);

/* The episode LIST omits mediaUrl; the single-episode endpoint includes it.
   That one detail is the difference between a searchable widget and a
   decorative one. */
async function loadPodcast(id) {
  const [show, eps] = await Promise.all([
    jget(`${API}/v3/podcast/podcasts/${id}`),
    /* Five. The Design D Episodes Drawer draws five rows and then the
       link out to the rest, where this used to load eight and scroll. */
    jget(`${API}/v3/podcast/podcasts/${id}/episodes?limit=5`).then((d) => d.data || [])
  ]);
  if (!eps.length) throw new Error('no episodes');
  const first = await jget(`${API}/v3/podcast/episodes/${eps[0].id}`).then((d) => d.episode);
  return {
    kind: 'podcast',
    /* Carried so the production embed above the prototypes can be pointed at
       the same episode rather than a hard coded one that goes stale. */
    showId: id, episodeId: eps[0].id, showSlug: show.slug || 'podcast',
    /* The SHOW's description, kept apart from infoBody, which is the episode's.
       The share drawer's second line on a show card is the show's. */
    showDesc: stripHtml(show.description || ''),
    title: first.title, subtitle: show.title,
    /* The info drawer describes the EPISODE, which is what the card is playing,
       not the show it belongs to. The show's own description is one level up
       from what you are listening to, and the episode carries its own in both
       the list and the single episode endpoint. */
    infoTitle: first.title, infoBody: stripHtml(first.description),
    art: show.imageUrl, audio: first.mediaUrl, hls: false,
    listTitle: 'Episodes',
    /* Which row reads as playing. It starts on the episode the widget loads and
       moves when another is chosen. */
    currentEpisodeId: eps[0].id,
    rows: eps.map((e) => ({
      id: e.id, title: e.title,
      sub: new Date(e.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
           (e.duration ? ' • ' + Math.round(e.duration / 60) + ' min' : ''),
      badge: e.isExplicit ? 'e' : null, art: e.imageUrl || show.imageUrl,
      /* Kept per row so choosing an episode can update the info drawer without
         waiting on a second request. */
      info: stripHtml(e.description)
    }))
  };
}

/* ---------------------------------------------------------------------------
   The three content types added after podcast and live radio, from the Design D
   frames: Podcast Episode 2669:136836, Artist Radio 2669:137076 and Playlist
   2669:136837.

   Artist radio and playlist do NOT play here, and that is a decision rather
   than a gap. Their audio comes from POST /api/v2/playback/streams, which needs
   an x-ihr-profile-id and x-ihr-session-id; iheart.com's own embed gets those by
   calling /api/v1/account/loginOrCreateOauthUser, which MINTS AN ANONYMOUS
   ACCOUNT ON PRODUCTION on every visit. That is the designed route and it works
   from this origin, CORS included, but this page is public, so every visitor
   would create one. The transport here is simulated instead and every other
   thing on these cards is real data pulled from public endpoints.

   Everything below is unauthenticated and was confirmed by request:
     /v3/catalog/tracks/{ids}                      title, artist, art, duration
     /v3/catalog/artists/{ids}                     artist name and image
     /v3/catalog/artist/{id}/albums                albums with nested track ids
     /v3/collection/user/{owner}/collection/{id}   playlist name, author, tracks
   --------------------------------------------------------------------------*/

/* The image host 403s a direct fetch and answers 200 through the proxy, which
   also sets access-control-allow-origin. The stage image is crossorigin because
   its colour is read off a canvas, so the proxy is required, not cosmetic. */
const catalogArt = (u) => (u ? imageProxy(u) : null);

async function tracksByIds(ids) {
  if (!ids.length) return [];
  const d = await jget(`${API}/v3/catalog/tracks/${ids.slice(0, 24).join(',')}`);
  return (d.tracks || []).map((t) => ({
    id: t.id, title: t.title, artist: t.artistName, artistId: t.artistId,
    art: catalogArt(t.imageUrl), duration: Number(t.duration) || 0
  }));
}

/* "Featured artists" is not invented. It is the distinct artists across the
   tracks the station or playlist actually holds, in first appearance order,
   which is what the phrase means on a playlist. The real artist radio seed list
   comes from the authenticated station call and is not reachable from here, so
   this is the honest public equivalent rather than a stand in. */
function featuredFrom(tracks) {
  const seen = new Map();
  tracks.forEach((t) => {
    if (t.artist && !seen.has(t.artist)) seen.set(t.artist, { name: t.artist, id: t.artistId, art: t.art });
  });
  return [...seen.values()].slice(0, 5);
}

/* The same five, wearing their own faces and pointing at their own pages.
   featuredFrom can only offer the track's artwork, which is the ALBUM cover, so
   a Featured Artists row showed a record sleeve where the shipping player shows
   the artist. The ids are already on the tracks, and the catalog endpoint takes
   them comma separated, so this is one request for all five rather than one
   each. An artist with no image keeps the album cover rather than a hole.

   The href uses the API's OWN slug rather than slugifying the row's text, and
   the difference is not cosmetic. A row reads "Taylor Swift & Chris Lake" while
   its artistId is Taylor Swift's, so a slug built from the visible name would
   point at an artist who does not exist. The API's slug already carries the id,
   so it is exact. */
async function withArtistInfo(featured) {
  const ids = featured.map((f) => f.id).filter(Boolean);
  if (!ids.length) return featured;
  try {
    const d = await jget(`${API}/v3/catalog/artists/${ids.join(',')}`);
    const byId = new Map((d.artists || []).map((a) => [String(a.id), a]));
    return featured.map((f) => {
      const a = byId.get(String(f.id));
      if (!a) return f;
      return Object.assign({}, f, {
        art: a.image ? catalogArt(a.image) : f.art,
        href: a.slug ? `https://www.iheart.com/artist/${a.slug}/` : null
      });
    });
  } catch (e) { return featured; }
}

/* A single episode, from the same fetch the show card makes. The frames draw no
   episode list on this one and put an info button where the list button sits,
   so the rows are dropped rather than hidden. */
async function loadEpisode(showId) {
  const d = await loadPodcast(showId);
  /* The episode's own artwork, carried apart before the rows are dropped.
     It is the rows that hold it, so stripping them took it with them and the
     card fell back to the SHOW's image for its backdrop. Episodes really do
     ship their own art here, a different one per episode, so that fallback was
     visible rather than academic.

     Only the backdrop. The thumbnail stays the show, which is exactly how the
     podcast card behaves: the tile is what you are listening to in general and
     the backdrop is what is playing right now. */
  const ep = (d.rows || []).find((r) => String(r.id) === String(d.currentEpisodeId)) || (d.rows || [])[0];
  return Object.assign({}, d, { kind: 'episode', rows: [], listTitle: null,
                                episodeArt: (ep && ep.art) || null });
}

async function loadArtist(id) {
  const [artist, albums] = await Promise.all([
    jget(`${API}/v3/catalog/artists/${id}`).then((d) => (d.artists || [])[0]),
    /* This one answers {meta, data, links} while the sibling catalog endpoints
       answer {artists} and {tracks}. Reading d.albums here returned undefined
       and the artist card loaded with an empty track list and no featured
       artists, silently. */
    jget(`${API}/v3/catalog/artist/${id}/albums?limit=25`).then((d) => d.data || [])
  ]);
  if (!artist) throw new Error('no artist');
  /* One track per album, not the first 24 ids flattened. Flattening took almost
     everything from the first album, and an album is frequently one song in five
     remixes, so the station played "I Knew It, I Knew You" five times and the
     featured artists read Taylor Swift, Taylor Swift & Chris Lake, Taylor Swift
     & Skream. Spreading across albums is what makes it read as a station. */
  const ids = albums.map((a) => ((a.tracks || [])[0] || {}).id).filter(Boolean);
  /* De-duplicated by TITLE, not by id. The albums endpoint returns singles
     newest first, and one song ships as several of them: eight albums for this
     artist were two "I Knew It, I Knew You" and four "Opalite", so skip next
     changed the artwork and left the title alone. Distinct ids, same song. */
  const seenTitle = new Set();
  const tracks = (await tracksByIds(ids)).filter((t) => {
    const k = (t.title || '').toLowerCase();
    if (!k || seenTitle.has(k)) return false;
    seenTitle.add(k); return true;
  });
  const name = artist.artistName;
  const featured = await withArtistInfo(featuredFrom(tracks));
  return {
    kind: 'artist', artistOnlyId: id,
    /* The frame's one idle line is "<artist> Radio", and the station is named
       for the artist rather than being a separate thing with its own name. */
    title: name + ' Radio', subtitle: name,
    infoTitle: name + ' Radio', infoBody: stripHtml(artist.bio || ''),
    slug: artist.slug || ('artist-' + id),
    art: catalogArt(artist.image),
    tracks, trackIndex: 0,
    listTitle: 'Featured Artists',
    /* The featured artists ARE the list, so they are shaped as rows and
       listMarkup is reused rather than a second list component written. They
       are inert: no episode to select and no overflow menu in the frames. */
    rowsInert: true,
    rows: featured.map((f) => ({ id: 'a' + f.id, title: f.name, sub: '', art: f.art, href: f.href })),
    audio: null, hls: false
  };
}

async function loadPlaylist(owner, id) {
  const pl = await jget(`${API}/v3/collection/user/${owner}/collection/${id}`);
  const tracks = await tracksByIds((pl.tracks || []).map((t) => t.trackId));
  const featured = await withArtistInfo(featuredFrom(tracks));
  return {
    kind: 'playlist', playlistOwner: owner, playlistId: id,
    webUrl: (pl.urls && pl.urls.web) || `https://www.iheart.com/playlist/${pl.slug}-${owner}-${id}/`,
    /* Two idle lines on this one where artist radio has one, the playlist's
       name and its description. */
    title: pl.name, subtitle: pl.description || pl.author || '',
    infoTitle: pl.name, infoBody: pl.description || '',
    slug: pl.slug || 'playlist',
    /* A collection DOES carry artwork of its own, at urls.image, which is what
       iheart.com puts on the playlist. This used to fall straight to the first
       track's art on the belief that there was none, so the tile showed a song
       rather than the playlist. The backdrop is unaffected: stageArt() paints
       the track that is playing and only reaches for this when there is none. */
    art: (pl.urls && pl.urls.image) || (tracks[0] && tracks[0].art) || null,
    tracks, trackIndex: 0,
    listTitle: 'Featured Artists',
    /* The featured artists ARE the list, so they are shaped as rows and
       listMarkup is reused rather than a second list component written. They
       are inert: no episode to select and no overflow menu in the frames. */
    rowsInert: true,
    rows: featured.map((f) => ({ id: 'a' + f.id, title: f.name, sub: '', art: f.art, href: f.href })),
    audio: null, hls: false
  };
}

/* What is playing on a station right now.
   This is `currentTrackMeta`, the endpoint iheart.com itself polls. See
   packages/playback/src/player/subscription/jw-player.ts in iheartradio/web,
   where `getCurrentTrackMeta` is called on a 5 second interval and a 404, 410
   or 424 stops the polling for that station.
   The endpoint answers the question directly, so nothing has to be inferred:
   200 with a body is the track on air, 204 means nothing is on air right now.
   `trackHistory` was the wrong source. It is a log of songs, not a statement
   about the present, and reading it two ways was wrong two ways. Taking its
   newest entry showed songs that had finished minutes earlier. Filtering that
   entry by its own startTime and endTime stopped the stale ones but also
   blanked tracks that really were playing, because the log lags and skips:
   measured against this endpoint across six stations, the history covered only
   21% to 80% of wall clock time, and 3 of 18 samples had a song genuinely on
   air that the history had not recorded at all.
   `defaultMetadata=true` is not optional. Without it the same stations answer
   410 rather than 200, since third party listening is disabled on them. */
/* iHeart's image proxy. Takes a base64 of the source URL and re-serves it with
   CORS, which is the only way the track artwork above is usable here. */
const imageProxy = (url) => 'https://i.iheart.com/v3/url/' + btoa(String(url));

async function nowPlaying(id) {
  if (NO_META.has(id)) return null;
  try {
    const r = await fetch(`${API}/v3/live-meta/stream/${id}/currentTrackMeta?defaultMetadata=true`);
    /* 204 is the station saying nothing is on air, which is an answer, not a
       failure. 404, 410 and 424 mean this station has no metadata service at
       all, so stop asking it, exactly as the production player does. */
    if (r.status === 404 || r.status === 410 || r.status === 424) { NO_META.add(id); return null; }
    if (!r.ok || r.status === 204) return null;
    const d = await r.json();
    /* artistId and trackId come with the track, and are what the artist and
       song links are built from. */
    return d && d.title
      ? { track: d.title, artist: d.artist || null,
          artistId: d.artistId || null, trackId: d.trackId || null,
          /* The now-playing payload carries the track's own artwork in
             `imagePath`, and that URL is NOT usable as given: fetched directly
             it answers 403, over http rather than https, which on an https page
             would be blocked as mixed content even if it did answer.

             Through iHeart's own image proxy it answers 200 image/png AND
             sends access-control-allow-origin, which matters twice over: the
             stage image carries crossorigin="anonymous", so without CORS it
             would not load at all, and the artwork colour is read off a canvas,
             which a tainted image cannot do. */
          art: d.imagePath ? imageProxy(d.imagePath) : null }
      : null;
  } catch (e) { return null; }
}
const NO_META = new Set();

/* Who is on air right now, which is a different question from what is playing.
   currentTrackMeta answers the second and says nothing about the first, so a
   station between songs had nothing to show but its own name and description.

   This is the same source iheart.com uses for the On-Air Now block on a live
   profile: sites.find(type: STREAM).onAirSchedule.current, from the webapi
   GraphQL service. See packages/api/src/webapi/query/sites/live-profile.ts in
   iheartradio/web, whose scheduleFields fragment this is a subset of. It
   answers unauthenticated and sends access-control-allow-origin: *, so it is
   usable from here directly.

   `current` is null off schedule, which is an answer rather than a failure and
   simply leaves the card on its existing lines. */
const ON_AIR_URL = 'https://webapi.radioedit.iheart.com/graphql';
const ON_AIR_QUERY = `query LiveOnAir($streamId: String!, $timeZone: String) {
  sites { find(type: STREAM, value: $streamId) {
    onAirSchedule(timeZone: $timeZone) {
      current { name coreShowId startMs stopMs destination { href } } } } }
}`;

async function onAirNow(id) {
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/New_York';
    const r = await fetch(ON_AIR_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: ON_AIR_QUERY, variables: { streamId: String(id), timeZone: tz } })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const cur = j && j.data && j.data.sites && j.data.sites.find
      && j.data.sites.find.onAirSchedule && j.data.sites.find.onAirSchedule.current;
    if (!cur || !cur.name) return null;
    return { name: cur.name,
             href: (cur.destination && cur.destination.href) || null,
             stopMs: Number(cur.stopMs) || 0 };
  } catch (e) { return null; }
}

async function loadStation(id) {
  const [d, np, show] = await Promise.all([
    jget(`${API}/v2/content/liveStations/${id}`),
    nowPlaying(id),
    onAirNow(id)
  ]);
  const h = d.hits[0];
  const st = h.streams || {};
  const url = st.secure_hls_stream || st.hls_stream || st.secure_shoutcast_stream || st.shoutcast_stream;
  return {
    kind: 'live', stationId: id,
    /* With a track on air the block is three lines, the station line then
       artist then track. With nothing on air it is two, the station NAME and
       its description, which is why both are carried apart as well as joined.
       No list, so no rows. */
    /* Left null when the station reports nothing playing. The widget then
       shows only the station line rather than repeating the station name on
       the artist row. */
    track: (np && np.track) || null,
    artist: (np && np.artist) || null,
    trackArt: (np && np.art) || null,
    artistId: (np && np.artistId) || null,
    trackId: (np && np.trackId) || null,
    /* Who is on air, used only when there is no track to show. Null off
       schedule, and then the card reads as it always did. */
    show: (show && show.name) || null,
    showHref: (show && show.href) || null,
    showStopMs: (show && show.stopMs) || 0,
    title: h.name,
    subtitle: [h.name, h.description].filter(Boolean).join(' \u2022  '),
    infoTitle: h.name, infoBody: h.description || '',
    /* The hero frame puts the station name on line one and its description on
       line two, so it needs them apart, not joined. */
    desc: h.description || '',
    art: h.logo || `https://i.iheart.com/v3/re/assets/images/${id}.png`,
    audio: url, hls: /\.m3u8/.test(url || ''),
    rows: []
  };
}

/* Descriptions arrive as HTML. Stripping tags with a regex leaves the entities
   behind, so &nbsp; and &amp; showed up as text. Parsing it and reading the
   text content handles both, and never injects the markup anywhere. */
function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/* The design's own resting waveform, read off the Figma frame. */
const IDLE = [3,3,3,5,5,5,11,5,11,8,11,13,11,13,13,16,13,13,11,13,11,13,16,13,11,11,13,13,11,8,
              13,13,11,13,16,13,13,11,13,8,11,5,11,11,13,11,5,11,5,11,5,8,5,5,11,5,5,3,5,3,3,5,
              3,3,3,3,3,3,3,3];
const WAVE_MAX = 16;
/* The hero frames draw the same waveform shape at a smaller scale, 2 to 12
   rather than 3 to 16, on 4px bars set with justify-between. At 350 that is 70
   bars of 4 in 350, so the gap is 1. Read off 2510:109552 and 2512:111980. */
const IDLE_HERO = [2,2,2,4,4,4,8,4,8,6,8,10,8,10,10,12,10,10,8,10,8,10,12,10,8,8,10,10,8,6,
                   10,10,8,10,12,10,10,8,10,6,8,4,8,8,10,8,4,8,4,8,4,6,4,4,8,4,4,2,4,2,2,4,
                   2,2,2,2,2,2,2,2];
/* Design C's waveform is the same shape again at exactly double the hero's
   scale, 4 to 24 rather than 2 to 12, read off 2533:85718. Same 4px bars. */
const IDLE_C = IDLE_HERO.map((h) => h * 2);
const WAVE = {
  bar:  { idle: IDLE,      max: 16, floor: 3, gap: 2, barW: (width) => width < 560 ? 3 : 4 },
  hero: { idle: IDLE_HERO, max: 12, floor: 2, gap: 1, barW: () => 4 },
  c:    { idle: IDLE_C,    max: 24, floor: 4, gap: 1, barW: () => 4 }
};
/* "Listen on" and the iHeart logotype, frame 2613:77793. Measured off the
   frame at 350 wide: the copy is 9px of ink over 49px, which is 12/16 and the
   card's own caption size; the logo reads 62 by 14, taken from the heart, whose
   16px of ink against its 28 units of viewBox gives a scale of 0.571 and so a
   107 by 24 box at 61 by 13.7. 14 sits between accomplice's 12 and 16 rungs and
   is what the frame draws, so it is what this uses. 8px between the two, and
   the whole lockup ends 16 from the card's right edge. */
/* Where "Listen on iHeart" goes. The card's own content, not the iHeart home
   page, which is what it pointed at while there were two content types and no
   good answer for a third.

   Built from the API's own url where one is given rather than reconstructed.
   The playlist endpoint returns urls.web and the slug is cosmetic in exactly
   the way the podcast slugs are, so reconstructing it is a chance to be wrong
   for no gain. */
/* The name has to match the destination. The show card's d.title is the
   EPISODE it happens to be playing while its link goes to the show, so reading
   d.title everywhere labelled "Listen to <episode> on iHeart" a link that opens
   the show. Every other kind's title is its own. */
const listenName = (d) => !d ? null : (d.kind === 'podcast' ? d.subtitle : d.title);

function listenUrl(d) {
  if (!d) return 'https://www.iheart.com/';
  if (d.webUrl) return d.webUrl;
  switch (d.kind) {
    case 'live': return stationUrl(d);
    case 'episode': return episodeUrl(d);
    case 'artist': return `https://www.iheart.com/artist/${d.slug}/`;
    default: return showUrl(d);
  }
}

/* The label names the destination rather than saying "Listen on iHeart" five
   times over, so a screen reader hears which thing the link opens. The visible
   words are unchanged; only the accessible name carries the content. */
const ihrLockup = (href, what) =>
  '<a class="ihr-lockup" href="' + esc(href) + '" target="_blank" rel="noopener"' +
    ' aria-label="' + esc(what ? 'Listen to ' + what + ' on iHeart' : 'Listen on iHeart') + '">' +
    '<span>Listen on</span>' +
    '<img src="assets/ihr-logotype-white.svg" alt="" width="62" height="14">' +
  '</a>';

const icon = (n, a) => `<img src="assets/${n}.svg" alt="${a || ''}">`;
/* Every clipping line of text is written as a span inside its box so the span
   can be translated on hover while the box does the clipping. */
const mqs = (t) => `<span class="mqi">${esc(t)}</span>`;

/* What the artwork cards put in their metadata lines.
   Neither hero frame draws a now playing state, so this is a decision rather
   than a reading. A live card that says only the station name while a song is
   on air is withholding the one thing a listener is looking at it for, so the
   track takes the lines while there is one and the station line comes back when
   there is not. Identity is not lost either way, since both cards carry the
   station's own tile beside the text.
   The station line stays, under the track, the way design A carries all three.
   A card that swaps the station out for the song has told you what is on but
   not where it is coming from, which for radio is half the point.
   Both artwork cards read the same way: track in the SemiBold line, artist
   under it, station under that in a dimmer tone so two Regular lines do not
   read as one block. Design C's own live frame drew a single joined line, and
   it was built that way first; one metadata layout across the two cards is
   worth more than that detail, since it leaves the designs differing in the
   things being compared rather than in how a song is written out.
   Note that the design A frames weight the first pair the other way round,
   artist SemiBold over track Regular; reading order won here, the song being
   what a listener asks first. Worth settling in the design file. */
/* The live block for both artwork cards. All three designs were revised to one
   order, station line first at 12/16 Regular, artist under it at 14/18 SemiBold,
   track last at 14/18 Regular, every line in grey-100 and 2px apart. Read off
   2527:144307, 2512:111965 and 2548:133528, which now agree line for line.
   With nothing on air it falls back to the station's own name and description. */
/* "track name • artist name" as one line, used by live radio, artist radio
   and playlist, and by the two pollers that rewrite it. Four writers, one
   builder: the live line has been patched in one place and not the other twice
   in this project, and each time the renderer and the poller disagreed from the
   first poll onward rather than on first paint.

   The bullet sits outside both anchors and is hidden from assistive tech, since
   it separates rather than says anything. The marquee wrapper goes around the
   WHOLE line, because markOverflow measures one .mqi per line and nesting one
   inside another gave it two candidates and it measured the wrong one. */
/* How many skips are left on this card, or null where the idea does not apply.
   Only the simulated stations have an allowance: a podcast has no skip button
   and live radio has no next. Undefined before the first play means the full
   allowance, so the button reads 6 from the start rather than blank. */
function skipsLeft(d) {
  if (!d || !caps(d).stopNext) return null;
  return d.skipsLeft === undefined ? SKIP_LIMIT_N : d.skipsLeft;
}

function trackArtistLine(track, artist, trackHref, artistHref) {
  return '<span class="mqi">' +
    maybeLink(trackHref, track, trackHref ? 'Open this song on iHeart' : null, true) +
    (artist
      ? '<span class="np-sep" aria-hidden="true"> • </span>' +
        maybeLink(artistHref, artist, artistHref ? 'Open this artist on iHeart' : null, true)
      : '') +
    '</span>';
}

function liveMeta(d) {
  const L = heroLines(d);
  const link = (t) => lineLink(stationUrl(d), t);
  /* Track and artist share ONE line, separated by a bullet, where they used to
     be two. Frame 2613:76846 draws them stacked, track on the SemiBold line and
     artist under it; this collapses that pair so the playing card is two lines
     like the idle one rather than three.

     Each half keeps its own link, so the song and the artist still go to
     different places. The bullet is not inside either anchor and is hidden from
     assistive tech, since it separates rather than says anything. */
  if (L.on === 'show') {
    /* The show carries its own destination, its page on the station's site, so
       this line does not reuse the station link the way the idle lines do. */
    return `<p class="h-station mq">${link(L.station)}</p>
            <p class="h-name mq"><span class="mqi">${
              maybeLink(d.showHref, L.name, d.showHref ? 'Open this show on iHeart' : null, true)
            }</span></p>`;
  }
  return L.station
    ? `<p class="h-station mq">${link(L.station)}</p>
       <p class="h-name mq">${trackArtistLine(L.name, L.sub, trackUrl(d), artistUrl(d))}</p>`
    : `<p class="h-name mq">${link(L.name)}</p>
       <p class="h-sub mq">${link(L.sub)}</p>`;
}

/* ---------------------------------------------------------------------------
   What each content type's card carries, from the Design D frames.

   This replaces an isLive boolean that was branched on at a dozen points inside
   one template. Five kinds cannot be expressed as one flag, and adding a second
   flag per kind is how a template starts disagreeing with itself.

   Read off the frames rather than assumed:
     podcast  1x back15 fwd30, a scrubber, an Episodes list, list button
     episode  the same transport, NO list, an info button where the list was
     live     play alone, no scrubber
     artist   stop and skip next, NO scrubber, a Featured Artists list
     playlist the same as artist, with two idle lines instead of one
   --------------------------------------------------------------------------*/
/* iHeart gives a free listener six skips an hour on a station. The number is
   the product's, not a guess: it is what the shipping player counts down from,
   and apps/listen's Next control shows it beside the button the same way. */
const SKIP_LIMIT_N = 6;

/* `info` replaces a `topAction` that read as an enum but was only ever a
   boolean: the list button has always been gated by `list` on its own, so
   topAction's 'list' value selected nothing and only 'info' did any work. A card
   can want both, which is what the playlist does, and an enum cannot say that. */
const CAPS = {
  podcast:  { seek: true,  speed: true,  scrub: true,  list: true,  rowsLive: true },
  episode:  { seek: true,  speed: true,  scrub: true,  list: false, info: true },
  /* Live radio carries the info button in the same corner the episode card
     does, which frame 2666:125218 draws. It had none at all. */
  live:     { seek: false, speed: false, scrub: false, list: false, info: true },
  /* `list` on both, which the frames do not draw. Without it the Featured
     Artists list is reachable only by making the slot tall enough, so at any
     ordinary height the card holds a list nobody can open. A list with no way to
     open it is worse than a button the frame is missing. */
  artist:   { seek: false, speed: false, scrub: false, list: true,  rowsLive: true, stopNext: true, roundThumb: true },
  /* Info AND list. The playlist carries a name and a description of its own,
     which is exactly what the episode card's info drawer shows, and it had no
     way to reach them: the drawer was being rendered on every card already, so
     only the button was missing. */
  playlist: { seek: false, speed: false, scrub: false, list: true,  info: true, rowsLive: true, stopNext: true }
};
const caps = (d) => CAPS[d && d.kind] || CAPS.podcast;

/* What the info button says it is about, so a screen reader hears the thing
   rather than "This Episode" on a playlist. */
const INFO_LABEL = { episode: 'This Episode', live: 'This Station', playlist: 'This Playlist' };

/* Share drawer headings, from the Design D frames: 2666:130642 live,
   2670:137239 podcast show, 2670:137412 podcast episode, 2666:131704 artist
   radio and 2666:132112 playlist. */
/* The height iHeart itself publishes for each content type, read off its oEmbed
   endpoint rather than chosen here:

     GET /oembed/?url=...&format=json
     show 300, episode 200, live 200, artist 300, playlist 300, all width 100%

   fixedWidth comes back as 450 on every one, but that is metadata for consumers
   that need a number; the markup says width="100%", so in practice the host's
   container decides the width outright and this table is only about height.

   Used in three places that used to disagree: the embed snippet the share
   drawer hands out, the shipping frames on the prototype page, and design C's
   own default height. The snippet said 200 for everything, which was right for
   two of the five and 100px short for the other three. */
const EMBED_H = { podcast: 300, episode: 200, live: 200, artist: 300, playlist: 300 };
const embedHeight = (d) => EMBED_H[d && d.kind] || 200;

const SHARE_TITLE = {
  podcast: 'Share Podcast',
  /* Was 'Share Podcast', taken from the Design D share drawers, which titled
     both podcast kinds that way because their BODY named the item. Frame
     2709:580630 has no body to name anything, and the drawer is now reached
     through a menu, so the heading is the only thing that says what you are
     about to share and it follows the pick. This is the episode card's first
     menu item and so its resting value. */
  episode: 'Share Episode',
  live: 'Share Station',
  artist: 'Share Artist Radio',
  playlist: 'Share Playlist'
};

/* The current track of a simulated station. Artist radio and playlist hold a
   real track list and step through it; nothing is heard. */
const curTrack = (d) => (d.tracks || [])[d.trackIndex || 0] || null;

/* Artist radio and playlist share live radio's three line block, context line,
   then the TRACK on the bold line, then the artist under it, so they share its
   classes too and the now playing writer can patch all three the same way.
   Idle they collapse: artist radio to its one line, playlist to its name and
   description, which is exactly what the frames draw. */
/* A simulated station's track, shaped the way trackUrl and artistUrl expect.
   Its tracks come from the catalog, so they carry the ids those builders need,
   exactly as the Featured Artists rows do. The slug is cosmetic: iHeart resolves
   on the trailing id and 301s to the canonical name, checked against a collab
   credit whose display name is not its artist's. */
function streamRef(t) {
  return t ? { artist: t.artist, artistId: t.artistId, track: t.title, trackId: t.id } : null;
}

function streamMeta(d) {
  const t = curTrack(d);
  const ctx = d.title;
  if (d.startedSim && t) {
    /* Two lines, the same as live radio: the station or playlist name on top
       and the track and artist together under it. These carried three.

       Linked, like live radio's. They used to be plain text on the belief that a
       simulated station had no page to open, which was wrong: the tracks come
       from the catalog with their ids, so the song and the artist both resolve.
       Being plain text was also visible, since these were the only metadata
       lines on the page that did not underline on hover. */
    const r = streamRef(t);
    return `<p class="h-station mq">${lineLink(contentUrl(d), ctx)}</p>
            <p class="h-name mq">${trackArtistLine(t.title, t.artist, trackUrl(r), artistUrl(r))}</p>`;
  }
  /* Artist radio's idle frame is ONE line, "<artist> Radio", and playlist's is
     two, its name and its description. The artist name is carried on the data
     for links and labels but is deliberately not a second line here: repeating
     "Taylor Swift" under "Taylor Swift Radio" says nothing. */
  /* The idle lines link too, to the artist or the playlist, which is what live
     radio's idle lines already do with the station. */
  return `<p class="h-name mq">${lineLink(contentUrl(d), ctx)}</p>` +
         (d.kind === 'playlist' && d.subtitle
           ? `<p class="h-sub mq">${lineLink(contentUrl(d), d.subtitle)}</p>` : '');
}

/* Three states for a live station, not two.
   A track on air reads station then track and artist. With no track but a show
   on air it reads station then the show, the same shape, because "Shelley Rome"
   answers what you are listening to and the station's own description does not.
   With neither it falls back to the station name and description, which is
   where it always was. */
function heroLines(d) {
  if (d.kind !== 'live') return { name: d.subtitle, sub: d.title, station: null };
  if (d.track && d.artist) return { name: d.track, sub: d.artist, station: d.subtitle, on: 'track' };
  if (d.show) return { name: d.show, sub: null, station: d.subtitle, on: 'show' };
  return { name: d.title, sub: d.desc || d.subtitle, station: null, on: 'idle' };
}

/* Measured, never assumed. A line gets the marquee only when its text really
   is wider than its box, which depends on the widget's current width, so this
   runs again on every render and on every resize. The shift carries 4px past
   the end so the last glyph does not sit flush against the edge, and the
   duration scales with the distance to keep the speed even across short and
   long strings. */
function markOverflow(root) {
  root.querySelectorAll('.mq').forEach((el) => {
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      el.classList.add('over');
      el.style.setProperty('--mq-shift', -(over + 4) + 'px');
      el.style.setProperty('--mq-dur', Math.max(3, 1.6 + (over * 2) / 60).toFixed(1) + 's');
    } else {
      el.classList.remove('over');
      el.style.removeProperty('--mq-shift');
      el.style.removeProperty('--mq-dur');
    }
  });
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------------------------
   Dominant colour. Straight "most common pixel" is wrong for logo art: a
   station tile can be 78% white padding, so the background would win over the
   brand. Near-white and near-black are dropped first.
   ------------------------------------------------------------------------ */
/* The hero card lays its text over the ARTWORK under a scrim, not over a flat
   swatch, so the honest figure to report there is the picture's mean colour
   under that scrim. It is an average: a light patch behind a word can still be
   worse than the number says, which is what the readout says on the page. */
function meanColour(img) {
  const N = 48, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  try { g.drawImage(img, 0, 0, N, N); } catch (e) { return null; }
  let data;
  try { data = g.getImageData(0, 0, N, N).data; } catch (e) { return null; }
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++;
  }
  return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null;
}

function dominantColour(img) {
  const N = 48, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  try { g.drawImage(img, 0, 0, N, N); } catch (e) { return null; }
  let data;
  try { data = g.getImageData(0, 0, N, N).data; } catch (e) { return null; }
  const bins = new Map(), all = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], gg = data[i + 1], b = data[i + 2];
    if (data[i + 3] < 128) continue;
    const key = (r >> 4) * 256 + (gg >> 4) * 16 + (b >> 4);
    const add = (m) => { const e = m.get(key) || [0,0,0,0]; e[0]+=r; e[1]+=gg; e[2]+=b; e[3]++; m.set(key, e); };
    add(all);
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const lum = .2126*r + .7152*gg + .0722*b;
    if (sat < .15 && lum > 200) continue;
    if (lum < 12) continue;
    add(bins);
  }
  const pick = (m) => { let best = null, n = -1;
    m.forEach((e) => { if (e[3] > n) { n = e[3]; best = e; } });
    return best && [Math.round(best[0]/best[3]), Math.round(best[1]/best[3]), Math.round(best[2]/best[3])]; };
  return pick(bins) || pick(all);
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

const OVERLAY = 0.60;                 /* keep in step with --overlay-pct */
/* The hero frames draw rgba(0,0,0,0.7). Both artwork designs now run 10 points
   darker by choice. The value is still held per design rather than collapsed
   into one constant, since the two have differed before and may again, and the
   contrast readout under each card reports the one that card actually paints. */
const SCRIM = { hero: 0.80, c: 0.80 };
const overlaid = (c) => c.map((v) => Math.round(v * (1 - OVERLAY)));

/* WCAG 2.x relative luminance and contrast ratio. Both text styles in the
   header are "normal" text for WCAG purposes: 14px semibold is under the 18.66px
   bold threshold and 12px regular is well under it, so the bar is 4.5 for AA and
   7 for AAA, not the large-text 3 and 4.5. */
const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminance = (c) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const TEXT_RGB = [0xf6, 0xf8, 0xf9];  /* --ihr-grey-100, the header text colour */

/* The scrim sets a FLOOR, and the floor is the honest number for a card whose
   background is a photograph.
   An average tells you almost nothing about legibility: it is one figure for a
   surface that varies pixel by pixel, and measured here it overstated the true
   worst case behind the text by as much as 7.6. What can be said with
   certainty is the other end. The worst any artwork can possibly be is pure
   white, so white under the scrim is the worst background any picture can
   produce, and that is a computation rather than a sample.
   At 70% black that floor is 8.00 to 1 against the grey-100 text, at 80% it is
   11.86, both clear of the 7 that AAA asks for normal text. The scrim would have
   to fall to 66.7% before AAA could fail on some artwork, and to 55.2% before
   AA could. */
const scrimFloor = (pct) => contrast([255 * (1 - pct), 255 * (1 - pct), 255 * (1 - pct)], TEXT_RGB);

/* The smallest overlay that would clear a target ratio for this artwork.
   Useful for judging how much headroom a given colour actually has. */
function overlayNeededFor(rgb, target) {
  for (let pct = 30; pct <= 95; pct++) {
    if (contrast(rgb.map((v) => Math.round(v * (1 - pct / 100))), TEXT_RGB) >= target) return pct;
  }
  return null;
}

/* ============================================================================
   One widget instance. Everything is scoped to its own root so two can share
   a page without touching each other's state.
   ==========================================================================*/
const INSTANCES = [];

function makeWidget(rootId, statusId, colourId, variant) {
  variant = variant || 'bar';
  const wave = WAVE[variant];
  /* The hero button is brand red, so its glyphs are the white cuts, and all
     three are Figma exports from these frames: the playing states carry a real
     Web Internal / Pause and Web Internal / Stop at 56, which replaced the
     hand drawn pair the first pass had to use. */
  const GLYPH = variant !== 'bar'
    ? { play: 'assets/play-white.svg', pause: 'assets/h-pause.svg', stop: 'assets/h-stop.svg' }
    : { play: 'assets/play.svg', pause: 'assets/pause.svg', stop: 'assets/stop.svg' };
  const root = document.getElementById(rootId);
  const statusEl = document.getElementById(statusId);
  const colourEl = document.getElementById(colourId);
  const w = {
    data: null, audio: null, ctx: null, analyser: null, src: null, freq: null,
    hls: null, raf: 0, bars: [], smooth: [], barW: 0, ro: null, npTimer: 0,
    playing: false, speed: 1, saved: false
  };
  INSTANCES.push(w);
  const q = (sel) => root.querySelector(sel);

  const status = (m, err) => { statusEl.textContent = m || ''; statusEl.className = 'status' + (err ? ' err' : ''); };

  /* What the text is actually sitting on, rather than what the picture averages.
     Each metadata line's box is mapped back through the object-fit: cover
     transform into artwork pixels, the scrim is applied to every sample, and
     the worst ratio and the share below AA are reported. Sampled at 64px per
     line, which is enough to catch a bright patch behind a word and cheap
     enough to run on every render. */
  function worstBehindText(pct) {
    const stage = q('.stage'), img = q('.art');
    if (!stage || !img || !img.naturalWidth) return null;
    const lines = [...root.querySelectorAll('.meta p')];
    if (!lines.length) return null;
    const sr = stage.getBoundingClientRect();
    const scale = Math.max(sr.width / img.naturalWidth, sr.height / img.naturalHeight);
    const ox = (sr.width - img.naturalWidth * scale) / 2;
    const oy = (sr.height - img.naturalHeight * scale) / 2;
    let worst = Infinity, below = 0, total = 0;
    for (const p of lines) {
      const b = p.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const sx = (b.left - sr.left - ox) / scale, sy = (b.top - sr.top - oy) / scale;
      const sw = Math.max(1, b.width / scale), sh = Math.max(1, b.height / scale);
      const N = 64, c = document.createElement('canvas');
      c.width = N; c.height = Math.max(4, Math.round(N * sh / sw));
      const g = c.getContext('2d', { willReadFrequently: true });
      let data;
      try { g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
            data = g.getImageData(0, 0, c.width, c.height).data; }
      catch (e) { return null; }                     /* tainted or off screen */
      const text = getComputedStyle(p).color.match(/[0-9]+/g).map(Number);
      for (let i = 0; i < data.length; i += 4) {
        const r = contrast([data[i] * (1 - pct), data[i + 1] * (1 - pct), data[i + 2] * (1 - pct)], text);
        if (r < worst) worst = r;
        if (r < 4.5) below++;
        total++;
      }
    }
    return total ? { worst, belowAA: below / total } : null;
  }

  /* Buffering is a property of the widget, not of the markup, because render()
     rewrites the markup and would otherwise drop the ring mid-load. */
  const setBuffering = (on) => {
    w.buffering = !!on;
    const el = root.querySelector('.widget');
    if (el) el.classList.toggle('buffering', w.buffering);
  };

  /* The hero card shows its secondary controls only while playing, which is
     the only difference between the resting frames and the playing ones. Like
     buffering, it lives on the widget object so a re-render cannot lose it. */
  const setPlayingClass = () => {
    const el = root.querySelector('.widget');
    if (!el) return;
    el.classList.toggle('playing', !!w.playing);
    /* `started` latches on the first play and never clears while this content
       is loaded. The artwork cards use it instead of `playing` to decide
       whether the controls are on screen, so pausing keeps them: only the
       pristine card, the one nobody has pressed play on yet, hides them.
       It lives on the widget object rather than the element, because render()
       rebuilds the element and a class set on the old one would be lost. */
    if (w.playing) w.started = true;
    el.classList.toggle('started', !!w.started);
    syncCurrentRow();
  };

  /* The current row is decided at render time, and `started` latches later, on
     the first play. Re-rendering to pick that up would rebuild the card under
     the person using it, so the class is synced in place instead, the same way
     the playing class is. */
  function syncCurrentRow() {
    const d = w.data;
    if (!d || !d.rows) return;
    root.querySelectorAll('.row[data-ep]').forEach((row) => {
      row.classList.toggle('on', !!w.started &&
        String(row.dataset.ep) === String(d.currentEpisodeId));
    });
  }

  /* The ring is DERIVED from the element's state, never latched by an event.
     Driving it from `waiting` and `stalled` alone put it up when nothing was
     buffering: live radio fires `stalled` while playing perfectly well, and
     stopping a live stream resets currentTime, whose `seeking` raised the ring
     with no later event left to clear it. The only honest question is whether
     the listener asked for audio and is not getting it, which is exactly
     `w.want` against `paused` and a readyState below HAVE_FUTURE_DATA.
     The 350ms delay is the other half. Audio that starts promptly should never
     flash a spinner, and most presses here resolve well inside that window. */
  const BUFFER_DELAY = 350;
  const stuck = () => {
    const a = w.audio;
    return !!w.want && (!a || a.paused || a.readyState < 3);
  };
  function refreshBuffering() {
    if (!stuck()) { clearTimeout(w.bufTimer); w.bufTimer = null; setBuffering(false); return; }
    if (w.buffering || w.bufTimer) return;
    w.bufTimer = setTimeout(() => { w.bufTimer = null; if (stuck()) setBuffering(true); }, BUFFER_DELAY);
  }

  /* One row, used by design A's inline list and by design C's drawer. It was
     written out twice and the two copies had already drifted apart once, which
     is exactly the kind of thing that bit the design B and C control rows.

     The overflow button sits OUTSIDE the row rather than inside it. The row is
     a div carrying role="button", and a real button nested inside an element
     with that role is interactive content inside a control, which no screen
     reader exposes reliably. A wrapper costs one element and keeps both as
     siblings, each reachable on its own.

     Frame 2609:36099: the button is 32 square, vertically centred in the 72px
     row, its right edge 12 in from the row's, which is where the explicit
     badge used to sit. */
  /* An inert row is not a button. Featured artists have nothing to SELECT, and
     leaving role="button" on something that does not change the card is worse
     than leaving it plain. They are links, though: each one opens that artist on
     iHeart, so the row is an anchor when it has somewhere to go and stays a
     plain div when the catalog gave it no slug. */
  function rowMarkup(d, r) {
    if (d.rowsInert) {
      const inner = `
          <img class="row-art" src="${esc(r.art || '')}" alt="">
          <div class="row-text"><p class="row-title">${esc(r.title)}</p></div>`;
      return `
      <div class="row-wrap">
        ${r.href
          ? `<a class="row inert" href="${esc(r.href)}" target="_blank" rel="noopener"
               aria-label="Open ${esc(r.title)} on iHeart">${inner}</a>`
          : `<div class="row inert">${inner}</div>`}
      </div>`;
    }
    return `
              <div class="row-wrap">
                <div class="row${isCurrentRow(d, r) ? ' on' : ''}"
                     data-act="row" data-ep="${esc(r.id)}" role="button" tabindex="0"
                     aria-label="Play ${esc(r.title)}">
                  <span class="row-art">
                    <img class="tile" src="${esc(r.art || d.art)}" alt="">
                    <span class="row-scrim"></span>
                    <span class="row-play">
                      <img class="pi-play" src="assets/play.svg" alt="">
                      <img class="pi-pause" src="assets/pause.svg" alt="">
                    </span>
                  </span>
                  <div class="row-meta"><b class="mq">${mqs(r.title)}</b><span class="mq">${mqs(r.sub)}</span></div>
                  ${r.badge ? `<span class="badge">${esc(r.badge)}</span>` : ''}
                </div>
                <button class="row-more" type="button" data-act="more" data-ep="${esc(r.id)}"
                        aria-haspopup="menu" aria-expanded="false"
                        aria-label="More options for ${esc(r.title)}">
                  <img src="assets/overflow.svg" alt="">
                </button>
              </div>`;
  }

  /* The episode list is the same component in both designs, 220 tall with the
     rows clipped at the frame bound, so it is written once. */
  /* The tail of every list, from the Design D Episodes Drawer 2666:126249.

     Two things, in this order. A row with no artwork carrying the link out to
     the full thing with an open_new icon, drawn as a Row rather than as a
     button so it sits in the same rhythm as the episodes above it. Then the
     legal line, centred, Terms and Privacy as links in #0055b7 with a plain
     pipe between them.

     The frame's copy reads "List to more episodes". That is a typo for "Listen
     to more episodes", which is what the shipping embed renders and what the
     sentence needs to parse, so the shipping copy is used. Say the word and it
     becomes the frame's string.

     The Featured Artists drawer has NOT been drawn with either of these; its
     frame is still the short 263 one showing three rows. Both are applied there
     by parity with Episodes, on instruction, so the artists copy is a
     placeholder until a frame says otherwise. */
  const MORE_LABEL = { artist: 'View all artists', playlist: 'View all artists' };
  function listTail(d) {
    const label = MORE_LABEL[d.kind] || 'Listen to more episodes';
    return `
            <div class="row-wrap">
              <a class="row row-more-link" href="${esc(listenUrl(d))}" target="_blank" rel="noopener">
                <div class="row-text"><p class="row-title">${esc(label)}</p></div>
                <img class="row-out" src="assets/open-new.svg" alt="">
              </a>
            </div>
            <!-- INSIDE the scroll area, after the link out, not a sibling of it.
                 As a sibling it was pinned to the bottom of the list while the
                 rows moved behind it, which is not what the frame draws: the
                 Drawer Body scrolls as one and the legal line is the last thing
                 in it, so you reach it by scrolling to the end. -->
            <p class="list-legal">
              <a href="https://www.iheart.com/terms/" target="_blank" rel="noopener">Terms</a>
              <span aria-hidden="true">|</span>
              <a href="https://www.iheart.com/privacy/" target="_blank" rel="noopener">Privacy</a>
            </p>
          </div>`;
  }

  function listMarkup(d) {
    return `
        <div class="list">
          <h3>${esc(d.listTitle)}</h3>
          <div class="rows">
            ${d.rows.map((r) => `
${rowMarkup(d, r)}`).join('')}
${listTail(d)}
          <div class="rows-bar" hidden><div class="rows-thumb"></div></div>
        </div>`;
  }

  /* The hero card, frames 2512:113087 (podcast) and 2512:111965 (live radio).
     A different design, not a rearrangement of the first one: the artwork is
     the full bleed background under a 70% black scrim rather than a dominant
     colour swatch, the only control is one 64px brand red play button centred
     on the card, and the metadata is two lines at the top beside a 40px thumb.
     Note the two lines swap roles between the frames. Podcast leads with the
     episode at 12/16 Regular and puts the show under it at 14/18 SemiBold;
     live radio leads with the station at 14/18 SemiBold and puts its line
     under it at 12/16 Regular. */
  function heroMarkup(d, isLive) {
    return `
      <div class="widget hero${isLive ? ' live' : ''}">
        <div class="stage">
          <img class="art" src="${esc(d.art)}" alt="" crossorigin="anonymous">
          <div class="scrim"></div>
          <div class="topbar">
            <a class="thumb-link" href="${esc(contentUrl(d))}" target="_blank" rel="noopener"
               aria-label="Open ${esc(d.subtitle)} on iHeart"><img class="h-thumb" src="${esc(d.art)}" alt=""></a>
            <div class="meta">
              ${isLive
                ? liveMeta(d)
                : `<p class="h-ep mq">${lineLink(episodeUrl(d), d.title, 'Open this episode on iHeart')}</p>
                   <p class="h-show mq">${lineLink(showUrl(d), d.subtitle, 'Open this show on iHeart')}</p>`}
            </div>
            <a class="ihr-link" href="${esc(listenUrl(d))}" target="_blank" rel="noopener"
               aria-label="Open ${esc(listenName(d))} on iHeart"><img class="ihr" src="assets/ihr-logo.svg" alt="iHeart"></a>
          </div>
          <div class="hero-controls">
            ${isLive ? `
              <span class="h-btn spacer" aria-hidden="true"><span class="h-speed">1x</span></span>
            ` : `
              <button class="h-btn" data-act="speed" aria-haspopup="menu" aria-expanded="false" aria-label="Change Playback Speed"><span class="h-speed">1x</span></button>
              <button class="h-btn" data-act="back" aria-label="Back 15 Seconds"><img src="assets/back15.svg" alt=""></button>
            `}
            <button class="hero-play" data-act="play" aria-label="Play">
              <img class="pi" src="${GLYPH.play}" alt="">
              <svg class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"></circle></svg>
            </button>
            ${isLive ? '' : `
              <button class="h-btn" data-act="fwd" aria-label="Forward 30 Seconds"><img src="assets/fwd30.svg" alt=""></button>`}
            <button class="h-btn" data-act="share" aria-label="Share"><img src="assets/h-share.svg" alt=""></button>
          </div>
          <div class="hero-bottom">
            ${isLive ? '' : `
              <div class="slider">
                <span class="t el">00:00</span>
                <div class="track">
                  <div class="elapsed" style="width:0"></div><div class="preview" style="left:0;width:0"></div><div class="thumb" style="left:0"></div>
                </div>
                <span class="t dur">--:--</span>
              </div>`}
            <div class="wave"></div>
          </div>
        </div>
        ${isLive ? '' : listMarkup(d)}
        ${infoMarkup(d)}
        ${shareMarkup(d)}
        ${veilMarkup()}
      </div>`;
  }

  /* Design C, frames 2533:85625 (podcast) and 2533:91574 (live radio).
     The same artwork card as design B, with two differences that matter.
     The controls are there at rest rather than appearing on play, which the
     live frame settles: it is drawn idle, with its play button untouched and
     its three icons already on screen. And the podcast card carries a list
     button above the scrubber, which is the only place in any of these frames
     where the episode list is something you ask for rather than something that
     is simply there.
     The two halves are less alike than in design B. Podcast keeps the 40px
     thumbnail, two lines of text and the seven control row; live radio has a
     48px thumbnail, ONE line joining the station and its description, three
     icons parked at the bottom right, and no waveform at all. */
  /* Design C's backdrop follows what is ACTUALLY PLAYING rather than the show
     or the station. On live radio that is the track's own artwork, which the
     now-playing poll brings in and changes every few minutes. On podcast it is
     the chosen episode's artwork, which the list already carries per row and
     which differs from the show's: every Las Culturistas episode ships its own.

     Both fall back to the show or station image, so a station with no metadata
     service and a podcast whose episodes reuse the show art both look exactly
     as they did. */
  /* Fixed means the thing the CARD is for: the station's logo, the show's cover,
     the playlist's art. Live, the default, means what is playing right now.
     Read here rather than cached, so the switch takes effect on the next render
     and the pollers below cannot reinstate the other one behind it. */
  function fixedArt() {
    const m = document.querySelector('main');
    return !!m && m.dataset.bg === 'fixed';
  }

  function stageArt(d) {
    if (!d) return '';
    if (fixedArt()) return d.art || '';
    if (d.kind === 'live') return d.trackArt || d.art || '';
    /* Artist radio and playlist paint the track they are on, the same rule live
       radio follows, falling back to the artist image or the playlist's first
       track before anything is playing. */
    if (caps(d).stopNext) { const t = curTrack(d); return (t && t.art) || d.art || ''; }
    /* The episode card has no rows to look the current episode up in, so its
       own art is carried on the record instead. */
    if (d.kind === 'episode') return d.episodeArt || d.art || '';
    const row = (d.rows || []).find((r) => String(r.id) === String(d.currentEpisodeId));
    return (row && row.art) || d.art || '';
  }

  function cMarkup(d, isLive) {
    const c = caps(d);
    const stream = c.stopNext;                    /* artist radio and playlist */
    return `
      <div class="widget hero c${isLive ? ' live' : ''}${stream ? ' stream' : ''}" data-kind="${esc(d.kind)}">
        <div class="stage">
          <img class="art" src="${esc(stageArt(d))}" alt="" crossorigin="anonymous">
          <div class="scrim"></div>
          <div class="topbar">
            <a class="thumb-link" href="${esc(contentUrl(d))}" target="_blank" rel="noopener"
               aria-label="Open ${esc(d.subtitle || d.title)} on iHeart"><img class="h-thumb${c.roundThumb ? ' round' : ''}" src="${esc(d.art)}" alt=""></a>
            <div class="meta">
              ${isLive ? liveMeta(d)
                : stream ? streamMeta(d)
                : `<p class="h-ep mq">${lineLink(episodeUrl(d), d.title, 'Open this episode on iHeart')}</p>
                   <p class="h-show mq">${lineLink(showUrl(d), d.subtitle, 'Open this show on iHeart')}</p>`}
            </div>
            ${c.info ? `
              <button class="h-btn tb-info" data-act="info" aria-haspopup="dialog" aria-expanded="false"
                      aria-label="About ${esc(INFO_LABEL[d.kind] || 'This Episode')}">
                <img src="assets/h-info.svg" alt=""></button>` : ''}
            ${c.list ? `
              <button class="h-btn tb-list" data-act="list" aria-pressed="false"
                      aria-label="Show ${esc(d.listTitle || 'Episodes')}">
                <img src="assets/h-list.svg" alt=""></button>` : ''}
            <button class="h-btn tb-share" data-act="share" aria-label="Share">
              <img src="assets/h-share.svg" alt=""></button>
          </div>
          <div class="hero-controls">
            <span class="cc-side">
              ${c.speed ? `
                <button class="h-btn" data-act="speed" aria-haspopup="menu" aria-expanded="false" aria-label="Change Playback Speed"><span class="h-speed">1x</span></button>` : ''}
              ${c.seek ? `
                <button class="h-btn" data-act="back" aria-label="Back 15 Seconds"><img src="assets/back15.svg" alt=""></button>` : ''}
            </span>
            <button class="hero-play" data-act="play" aria-label="Play">
              <img class="pi" src="${GLYPH.play}" alt="">
              <svg class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"></circle></svg>
            </button>
            <span class="cc-side">
              ${c.seek ? `
                <button class="h-btn" data-act="fwd" aria-label="Forward 30 Seconds"><img src="assets/fwd30.svg" alt=""></button>` : ''}
              ${c.stopNext ? `
                <button class="h-btn skip" data-act="next"
                        aria-label="Next Track${skipsLeft(d) !== null ? ', ' + skipsLeft(d) + ' skips left' : ''}">
                  <img src="assets/h-next.svg" alt="">
                  ${skipsLeft(d) === null ? ''
                    : `<span class="skip-n" aria-hidden="true">${skipsLeft(d)}</span>`}</button>` : ''}
            </span>
          </div>
          <div class="hero-bottom">
            ${c.scrub ? `
              <div class="c-rows">
                <div class="slider">
                  <span class="t el">00:00</span>
                  <div class="track">
                    <div class="elapsed" style="width:0"></div><div class="preview" style="left:0;width:0"></div><div class="thumb" style="left:0"></div>
                  </div>
                  <span class="t dur">--:--</span>
                </div>
                <div class="list-row">${cActions()}</div>
              </div>` : `
              <div class="list-row">${cActions()}</div>`}
            <div class="wave"></div>
          </div>
          ${c.list && c.rowsLive ? sheetMarkup(d) : ''}
        </div>
        <!-- Design C carries BOTH list forms and CSS shows one. A JS switch
             would mean re-rendering the card while the height changes, and
             re-render is what broke the drawer animation and the live track
             order earlier here; it would also discard drawer state and focus on
             every crossing. The rows are duplicated in the DOM as a result,
             which is safe because render() writes both together and the current
             row highlight is applied with querySelectorAll over every
             .row[data-ep], so the two cannot drift.
             Only the podcast show gets the drawer half. Artist radio and
             playlist have no list button anywhere in their frames, so their
             Featured Artists list is inline ONLY and appears with height, which
             is also why it carries no dismiss X: the height rule owns whether
             it is showing, and an X would fight it. -->
        ${c.list ? listMarkup(d) : ''}
        ${infoMarkup(d)}
        ${shareMarkup(d)}
        ${veilMarkup()}
      </div>`;
  }

  /* The info drawer, frame 2562:285883. The same Drawer component as the
     episode one and mounted differently: this one is a child of the CARD rather
     than of the stage, since the frame draws it over all 400px, the player and
     the episode list together.
     Two differences inside. The header is 80 tall rather than 64 because its
     title wraps to two lines rather than ellipsising, and the body is a
     paragraph at 16/24 with -0.5 tracking in black, not a list of rows. */
  function infoMarkup(d) {
    return `
      <div class="sheet info-sheet" aria-hidden="true">
       <div class="sheet-panel">
        <div class="sheet-head">
          <h3>${esc(d.infoTitle || d.subtitle)}</h3>
          <button class="sheet-close" data-act="info" aria-label="Close Information"><img src="assets/sheet-close.svg" alt=""></button>
        </div>
        <div class="sheet-body">
          <p class="info-body">${esc(d.infoBody || 'No description available.')}</p>
          <!-- Both info drawer frames carry it, 2666:125789 on the podcast and
               2670:197903 on live radio, under the description rather than
               pinned to the bottom of the panel, so it scrolls with the text. -->
          <p class="list-legal">
            <a href="https://www.iheart.com/terms/" target="_blank" rel="noopener">Terms</a>
            <span aria-hidden="true">|</span>
            <a href="https://www.iheart.com/privacy/" target="_blank" rel="noopener">Privacy</a>
          </p>
        </div>
       </div>
      </div>`;
  }

  /* The drawer, frame 2533:85717. It is not a panel under the card, it is the
     card: the Drawer instance is 358 by 263 at 0,0, the same box as the player,
     so it slides up over it and covers it rather than pushing anything down.
     Header is 64 tall on ihr grey-200 with the title at 18/24 Bold and a close
     button; the body is white with 16 of padding and the same 72px rows. */
  function sheetMarkup(d) {
    return `
      <div class="sheet" aria-hidden="true">
       <div class="sheet-panel">
        <div class="sheet-head">
          <h3>${esc(d.listTitle)}</h3>
          <button class="sheet-close" data-act="list" aria-label="Close Episodes"><img src="assets/sheet-close.svg" alt=""></button>
        </div>
        <div class="sheet-body rows-body">
          <div class="rows">
            ${d.rows.map((r) => `
${rowMarkup(d, r)}`).join('')}
${listTail(d)}
          <div class="rows-bar" hidden><div class="rows-thumb"></div></div>
        </div>
       </div>
      </div>`;
  }

  /* Where each list was scrolled to, so a render can put it back.
     render() rebuilds the card with innerHTML, and a rebuilt list starts at the
     top, so choosing an episode threw away your place in it. On a show with
     hundreds of episodes that means scrolling back from the top every time you
     play something.

     Keyed by WHICH list rather than by index, because a card can hold two copies
     of the same rows, the inline one and the drawer's, and they scroll
     independently. */
  const scrollKey = (el) => (el.closest('.sheet') ? 'sheet' : 'list');
  function captureScroll() {
    const at = new Map();
    root.querySelectorAll('.rows').forEach((el) => {
      if (el.scrollTop > 0) at.set(scrollKey(el), el.scrollTop);
    });
    return at;
  }
  function restoreScroll(at) {
    if (!at || !at.size) return;
    const put = () => root.querySelectorAll('.rows').forEach((el) => {
      const y = at.get(scrollKey(el));
      /* Assigning scrollTop fires a scroll event, which is what moves the drawn
         scrollbar's thumb with it, so the bar needs no separate nudge. */
      if (y) el.scrollTop = y;
    });
    put();
    /* And again next frame. scrollTop is clamped to the scroll height AT THE
       MOMENT it is assigned, and immediately after innerHTML the list has not
       finished laying out, so a restore of 240 landed at 144, the maximum that
       existed right then. The second pass runs once the rows have their real
       height and gets the rest of the way back. */
    requestAnimationFrame(put);
  }

  function render() {
    const d = w.data; if (!d) return;
    w.scrollAt = captureScroll();
    const isLive = d.kind === 'live';
    if (variant === 'c') { root.innerHTML = cMarkup(d, isLive); return afterRender(); }
    if (variant === 'hero') { root.innerHTML = heroMarkup(d, isLive); return afterRender(); }
    root.innerHTML = `
      <div class="widget${isLive ? ' live' : ''}${isLive && !(d.track && d.artist) ? ' notrack' : ''}">
        <div class="player">
          <div class="body">
            <a class="art-link" href="${esc(contentUrl(d))}" target="_blank" rel="noopener"
               aria-label="Open ${esc(d.subtitle)} on iHeart"><img class="art" src="${esc(d.art)}" alt="" crossorigin="anonymous"></a>
            <div class="col">
            <div class="meta">
              ${isLive ? (d.track && d.artist ? `
                <p class="subtitle mq">${lineLink(stationUrl(d), d.subtitle)}</p>
                <p class="title np-artist mq">${maybeLink(artistUrl(d), d.artist, 'Open this artist on iHeart')}</p>
                <p class="title np-track mq">${maybeLink(trackUrl(d), d.track, 'Open this song on iHeart')}</p>` : `
                <p class="title mq">${lineLink(stationUrl(d), d.title)}</p>
                <p class="subtitle mq">${mqs(d.desc || '')}</p>`) : `
                <p class="title mq">${lineLink(episodeUrl(d), d.title, 'Open this episode on iHeart')}</p>
                <p class="subtitle mq">${lineLink(showUrl(d), d.subtitle, 'Open this show on iHeart')}</p>`}
            </div>
            <a class="ihr-link" href="${esc(listenUrl(d))}" target="_blank" rel="noopener"
               aria-label="Open ${esc(listenName(d))} on iHeart"><img class="ihr" src="assets/ihr-logo.svg" alt="iHeart"></a>
            <div class="controls-row">
              <button class="play-btn" data-act="play" aria-label="Play"><img class="pi" src="${GLYPH.play}" alt="">
                <svg class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"></circle></svg>
              </button>
              <div class="stack">
                ${isLive ? '' : `
                  <div class="slider">
                    <span class="t el">00:00</span>
                    <div class="track">
                      <div class="elapsed" style="width:0"></div><div class="preview" style="left:0;width:0"></div><div class="thumb" style="left:0"></div>
                    </div>
                    <span class="t dur">--:--</span>
                  </div>`}
                <div class="btn-row">
                  ${isLive ? '' : `
                  <div class="btn-group">
                    <button class="icon-btn speed-btn" data-act="speed" aria-haspopup="menu" aria-expanded="false" aria-label="Change Playback Speed"><span>1x</span></button>
                    <button class="icon-btn" data-act="back" aria-label="Back 15 Seconds">${icon('back15')}</button>
                    <button class="icon-btn" data-act="fwd" aria-label="Forward 30 Seconds">${icon('fwd30')}</button>
                  </div>`}
                  <div class="btn-group">
                    ${isLive ? `
                    <button class="icon-btn" data-act="info" aria-label="Info">${icon('info')}</button>` : ''}
                    <button class="icon-btn" data-act="share" aria-label="Share">${icon('share')}</button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
          <div class="wave"></div>
        </div>
        ${isLive ? '' : listMarkup(d)}
        ${infoMarkup(d)}
        ${shareMarkup(d)}
        ${veilMarkup()}
      </div>`;
    afterRender();
  }

  /* Everything that has to happen after either template is written. */
  function afterRender() {
    buildBars();
    markOverflow(root);
    wireRowsBar(root);
    /* After wireRowsBar, so the bar it just drew reflects the restored position
       rather than the top of the list. */
    restoreScroll(w.scrollAt);
    setBuffering(w.buffering);
    setPlayingClass();
    if (w.ro) w.ro.disconnect();
    w.ro = new ResizeObserver(() => { buildBars(); markOverflow(root); wireRowsBar(root); });
    w.ro.observe(root);

    const art = q('.art');
    /* The contrast readout is optional and the prototype page no longer carries
       it. The MEASUREMENT is not optional: --dominant is what design A's bar
       card paints behind its text, so the colour is still read and only the
       reporting is skipped. */
    const say = (html) => { if (colourEl) colourEl.innerHTML = html; };
    const paint = () => {
      /* The hero reads the whole picture, since the whole picture is the
         backdrop. The bar widget reads a dominant swatch, since that swatch is
         what it paints behind the text. */
      const rgb = variant !== 'bar' ? meanColour(art) : dominantColour(art);
      if (!rgb) { say('<span>artwork colour could not be read</span>'); return; }
      root.style.setProperty('--dominant', hex(rgb));
      if (!colourEl) return;
      const pct = variant !== 'bar' ? SCRIM[variant] : OVERLAY;
      const bg = variant !== 'bar'
        ? rgb.map((v) => Math.round(v * (1 - pct)))
        : overlaid(rgb);
      /* The bar card's background really is one flat colour, so one ratio
         describes it exactly. The artwork cards are graded on the two figures
         that mean something over a photograph: the worst the text actually
         sits on, and the worst any artwork could ever produce at this scrim. */
      if (variant === 'bar') {
        const r = contrast(bg, TEXT_RGB);
        const aa = r >= 4.5, aaa = r >= 7;
        const need = overlayNeededFor(rgb, 4.5);
        say(
          `<span class="chip" style="background:${hex(rgb)}"></span>` +
          `<span class="chip" style="background:${hex(bg)}"></span>` +
          `<span>${hex(rgb)} with ${Math.round(pct * 100)}% black → ${hex(bg)}</span>` +
          `<span class="ratio">${r.toFixed(2)} to 1</span>` +
          `<span class="wcag ${aa ? 'pass' : 'fail'}">AA ${aa ? 'pass' : 'fail'}</span>` +
          `<span class="wcag ${aaa ? 'pass' : 'warn'}">AAA ${aaa ? 'pass' : 'no'}</span>` +
          (need ? `<span class="meta-note">AA floor for this artwork is ${need}% overlay</span>` : ''));
        return;
      }
      const floor = scrimFloor(pct);
      const m = worstBehindText(pct);
      const judged = m ? m.worst : floor;
      const aa = judged >= 4.5, aaa = judged >= 7;
      say(
        `<span class="chip" style="background:${hex(bg)}"></span>` +
        (m
          ? `<span>worst pixel behind the text</span><span class="ratio">${m.worst.toFixed(2)} to 1</span>`
          : `<span>artwork could not be sampled, judged on the floor alone</span>`) +
        `<span class="wcag ${aa ? 'pass' : 'fail'}">AA ${aa ? 'pass' : 'fail'}</span>` +
        `<span class="wcag ${aaa ? 'pass' : 'warn'}">AAA ${aaa ? 'pass' : 'no'}</span>` +
        `<span class="meta-note">${Math.round(pct * 100)}% black guarantees ${floor.toFixed(2)} to 1 on ANY artwork, ` +
        `since the worst a picture can be is pure white` +
        (m && m.belowAA ? `. ${(m.belowAA * 100).toFixed(1)}% of this one is below AA` : '') + `</span>`);
    };
    /* Assigned either way, not only when the image has yet to arrive. Design C
       swaps this src as the track or the episode changes, and a handler bound
       only on the slow path would leave the colour read stuck on whatever was
       showing at first render. */
    art.onload = paint;
    art.onerror = () => say('');
    if (art.complete && art.naturalWidth) paint();

    root.onclick = (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      act(b.dataset.act, b);
    };

    /* Click the card itself to play or pause, the way a video player does.
       Only the artwork designs: the bar card has no surface that is not either
       a control or the episode list.
       Four things are deliberately excluded. Anything carrying data-act, so the
       real buttons fire once rather than twice. The scrubber, since a seek is a
       click. The drawer, which covers the card and has its own rows. And a drag,
       measured as more than 6px of travel or a live text selection, so pulling
       across a title to read or copy it does not stop the audio.
       No role and no tabindex: the play button is still the accessible control,
       and adding a second one would just duplicate it in the tab order. */
    if (variant !== 'bar') {
      const stage = q('.stage');
      if (stage) {
        let dx = 0, dy = 0;
        stage.addEventListener('pointerdown', (e) => { dx = e.clientX; dy = e.clientY; });
        stage.addEventListener('click', (e) => {
          if (e.target.closest('[data-act], .sheet, .slider, button, a, input')) return;
          if (Math.abs(e.clientX - dx) > 6 || Math.abs(e.clientY - dy) > 6) return;
          const sel = window.getSelection && window.getSelection().toString();
          if (sel) return;
          toggle();
        });
      }
    }
    /* A sheet that covers the player needs a keyboard way out, which the frame
       has no opinion about and a person on a keyboard certainly does. */
    root.onkeydown = (e) => {
      /* A row is a button in all but tag name, so it answers to the keys one. */
      const row = e.target.closest && e.target.closest('.row[data-act="row"]');
      if (row && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        act('row', row);
        return;
      }
      const card = root.querySelector('.widget');
      if (!card) return;

      /* Which drawer, if any, is covering the card. Each is aria-modal, and a
         modal that lets Tab walk out into the content it is covering is only
         pretending: focus lands on controls nobody can see, behind a scrim.
         Measured before this: Tab escaped every one of the three. */
      const openDrawer =
        /* The veil sits above all three, so it answers first when it is up. */
        card.classList.contains('veil-open')  ? root.querySelector('.pause-veil') :
        card.classList.contains('share-open') ? root.querySelector('.share-sheet') :
        card.classList.contains('info-open')  ? root.querySelector('.info-sheet') :
        card.classList.contains('sheet-open') ? root.querySelector('.sheet:not(.info-sheet)') :
        null;

      if (e.key === 'Tab' && openDrawer) {
        const items = [...openDrawer.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        /* Wrap at whichever end the next Tab would leave by. */
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!openDrawer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        return;
      }

      if (e.key !== 'Escape') return;
      if (card.classList.contains('veil-open')) {
        e.stopPropagation();
        dismissVeil();
      } else if (card.classList.contains('share-open')) {
        e.stopPropagation();
        shareDialog();
      } else if (card.classList.contains('sheet-open')) {
        e.stopPropagation();
        act('list', root.querySelector('[data-act="list"]'));
      } else if (card.classList.contains('info-open')) {
        e.stopPropagation();
        act('info', root.querySelector('[data-act="info"]:not(.sheet-close)'));
      }
    };
    /* The two copy controls live in the rendered sheet, so they are wired on
       every render rather than when the sheet is built. Both revert after five
       seconds, which is what EmbedWidget and CopyLink do. */
    const sheetEl = q('.share-sheet');
    if (sheetEl) {
      const flash = (labelEl) => {
        if (!labelEl) return;
        const was = labelEl.textContent;
        labelEl.textContent = 'Copied!';
        setTimeout(() => { labelEl.textContent = was; }, 5000);
      };
      sheetEl.addEventListener('click', (e) => {
        const code = e.target.closest('[data-share="code"]');
        if (code) {
          if (navigator.clipboard) navigator.clipboard.writeText(code.dataset.code || '');
          flash(code.querySelector('.lbl'));
          return;
        }
        const link = e.target.closest('[data-share="copy"]');
        if (link) {
          if (navigator.clipboard) navigator.clipboard.writeText(sheetEl.dataset.url || '');
          flash(link.querySelector('.lbl'));
          return;
        }
      });
    }

    const track = q('.track');
    if (track) {
      const elapsed = q('.elapsed'), thumbEl = q('.thumb'), preview = q('.preview');
      /* The component drives itself off data attributes rather than classes,
         and the stylesheet here reads the same ones, so the states line up with
         the original: data-hovered on the track, data-dragging on the fill and
         the thumb. */
      const setDragging = (on) => {
        [elapsed, thumbEl].forEach((el) => {
          if (!el) return;
          if (on) el.setAttribute('data-dragging', ''); else el.removeAttribute('data-dragging');
        });
      };
      const pct = (ev) => {
        const r = track.getBoundingClientRect();
        return r.width ? Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) : 0;
      };
      const seek = (ev) => {
        if (!w.audio || !isFinite(w.audio.duration)) return;
        w.audio.currentTime = pct(ev) * w.audio.duration;
        tick();
      };
      /* The preview is the segment between where playback is and where a click
         would land, drawn only while hovering AHEAD of the thumb and not
         dragging, which is the condition the component uses.
         What is stored is the hovered VALUE, not the pixels: the component
         derives left and width from slider state on every render, so the span
         shrinks as playback advances and closes when playback reaches it.
         Storing the drawn span instead was wrong, and blanked the preview on
         the first timeupdate after the mouse stopped moving. */
      const clearPreview = () => { w.previewAt = null; drawPreview(); };
      const showPreview = (ev) => {
        if (!w.audio || !isFinite(w.audio.duration) || !w.audio.duration) return clearPreview();
        if (elapsed && elapsed.hasAttribute('data-dragging')) return clearPreview();
        w.previewAt = pct(ev) * 100;
        drawPreview();
      };
      track.addEventListener('pointerenter', () => track.setAttribute('data-hovered', ''));
      track.addEventListener('pointerleave', () => {
        track.removeAttribute('data-hovered'); clearPreview();
      });
      track.addEventListener('pointermove', showPreview);
      track.addEventListener('pointerdown', (ev) => {
        track.setPointerCapture(ev.pointerId);
        setDragging(true); clearPreview(); seek(ev);
        const mv = (e2) => seek(e2);
        const up = () => {
          setDragging(false);
          /* A touch drag never fired an enter, and leaves no pointer behind to
             fire a leave, so the hovered state is cleared by hand on release
             for any pointer that is not a mouse. */
          track.removeEventListener('pointermove', mv);
          track.removeEventListener('pointerup', up);
          track.removeEventListener('pointercancel', up);
        };
        track.addEventListener('pointermove', mv);
        track.addEventListener('pointerup', up);
        track.addEventListener('pointercancel', up);
      });
    }
    if (w.playing) {
      const pi = q('.pi');
      if (pi) pi.src = w.data.kind === 'live' ? GLYPH.stop : GLYPH.pause;
      loop();
    }
    tick();
  }

  /* The design keeps bars at 3px (350 frame) and 4px (1280 frame) and grows the
     COUNT with width, so the strip is rebuilt whenever the widget resizes and
     the 70 design heights are resampled across however many bars now fit. */
  function buildBars() {
    const el = q('.wave'); if (!el) return;
    const width = el.getBoundingClientRect().width;
    if (!width) return;
    const barW = wave.barW(width);
    const pitch = barW + wave.gap;
    const n = Math.max(12, Math.floor((width + 2) / pitch));
    /* Compare against the LIVE DOM, not cached state. Loading new content
       replaces the widget's markup, which leaves an empty .wave while w.bars
       still points at the old detached bars. Testing the cache meant that at an
       unchanged width the counts matched, the rebuild was skipped, and the
       waveform vanished on every content switch. */
    if (n === el.children.length && barW === w.barW) return;
    w.barW = barW;
    el.style.setProperty('--bar-w', barW + 'px');
    el.style.setProperty('--bar-gap', wave.gap + 'px');
    el.innerHTML = Array.from({ length: n }, (_, i) =>
      `<i style="height:${wave.idle[Math.min(wave.idle.length - 1, Math.floor(i * wave.idle.length / n))]}px"></i>`).join('');
    w.bars = [...el.querySelectorAll('i')];
    w.smooth = new Array(n).fill(0);
    w.bands = null;                      /* bar count changed, so the bands must be rebuilt */
  }
  const idleAt = (i) => wave.idle[Math.min(wave.idle.length - 1, Math.floor(i * wave.idle.length / w.bars.length))];

  /* The drawer's scrollbar, drawn rather than the platform's.

     ::-webkit-scrollbar was styled first and did nothing: on macOS the
     scrollbar is an overlay, it reserves no width, and measured here it painted
     no pixels at all until touched. Setting scrollbar-width to bring Firefox
     along made it worse, because specifying it makes Chrome ignore every
     ::-webkit-scrollbar rule. So the bar is drawn, which is also what the
     Design D drawers show: they carry a Scroll Bar instance rather than leaving
     it to the platform.

     This replaced a forced 24px peek and a fade over it. Both existed to hint
     that the list scrolled, by cutting a row part way and softening the cut.
     A scrollbar says the same thing without lying about where the list ends,
     and it says it at a glance rather than only once you notice a half row. */
  /* The artwork is square and as tall as the text beside it.

     Measured off .meta rather than off the row, and that distinction is what
     keeps it from looping: the row's height is the tallest of the text, the
     tile and the buttons, so reading the row would feed the tile's own size
     back in. The text block's height is its own content, so it is a fixed point
     the tile can be derived from.

     Written only when it changes, because this runs from a ResizeObserver and
     setting a custom property that affects layout would otherwise re-enter. */
  /* fitThumb() is gone. It measured the text block and wrote --thumb inline, to
     keep the tile square without the circular sizing that defeated three CSS
     attempts. Sizing the tile from the CARD has no circularity, so it is a plain
     clamp in the stylesheet now and the inline write that was overriding it, and
     pinning every card to 36, went with it. */

  function wireRowsBar(root) {
    root.querySelectorAll('.rows').forEach((rows) => {
      const bar = rows.parentElement.querySelector('.rows-bar');
      const thumb = bar && bar.querySelector('.rows-thumb');
      if (!bar || !thumb) return;
      const mark = () => {
        const over = rows.scrollHeight - rows.clientHeight;
        /* Absent, not empty, when everything already fits. A track with a full
           height thumb in it is just a line down the side saying nothing. */
        if (over <= 1) { bar.hidden = true; return; }
        bar.hidden = false;
        bar.style.top = rows.offsetTop + 'px';
        bar.style.height = rows.clientHeight + 'px';
        const h = Math.max(24, rows.clientHeight * rows.clientHeight / rows.scrollHeight);
        thumb.style.height = h + 'px';
        thumb.style.top = (rows.scrollTop / over) * (rows.clientHeight - h) + 'px';
      };
      /* Bound once per element. render() rewrites the markup so a fresh set
         arrives each time, but the ResizeObserver calls this on the SAME
         elements repeatedly and would otherwise stack a listener per resize. */
      if (!rows.dataset.barWired) {
        rows.addEventListener('scroll', mark, { passive: true });
        rows.dataset.barWired = '1';
      }
      mark();
    });
  }

  function act(kind, btn) {
    const a = w.audio;
    if (kind === 'play') return toggle();
    /* A list, not a cycle. iheart.com opens an accomplice Menu from this button
       rather than stepping through rates blind, which is what PlaybackSpeed in
       apps/listen/app/playback/actions does. A cycle makes you press four times
       to go back one, and never shows you what the options are. */
    if (kind === 'speed') speedMenu(btn);
    if (kind === 'back' && a) a.currentTime = Math.max(0, a.currentTime - 15);
    if (kind === 'fwd' && a) a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 30);
    /* Saving needs an account, and an embed is never signed in, so the honest
       answer is the one iheart.com gives: the auth CTA toast. The button no
       longer pretends to latch a saved state it cannot have. The copy is
       LIBRARY_AUTHENTICATION_MESSAGE verbatim from
       apps/listen/app/utilities/constants.ts. */
    /* Nothing raises this any more: the plus is gone from live radio and
       Follow Podcast is gone from the row overflow, so no card has a save
       control. The action and authToast() below are left wired rather than
       deleted, so putting either button back is a markup change and nothing
       else. */
    /* Skip next, artist radio and playlist. Real product rule, simulated here:
       the card steps to the next track in a list it genuinely holds, and the
       badge counts down the free user skip allowance the frames draw. */
    if (kind === 'next') return skipTrack();
    if (kind === 'save') authToast();
    if (kind === 'veil') dismissVeil();
    if (kind === 'row') {
      /* Chosen from inside design C's drawer, the drawer has done its job and
         gets out of the way so the card it just changed can be seen. */
      const card = root.querySelector('.widget');
      if (card && card.classList.contains('sheet-open') && btn.closest('.sheet')) {
        act('list', root.querySelector('[data-act="list"].h-btn'));
      }
      selectEpisode(btn.dataset.ep);
      return;
    }
    /* The list button only exists in design C, where the frame shows it above
       the scrubber with no list under the card. What it opens is an inference,
       the episode list being the only list this card has, and it is written as
       a toggle so the closed state stays the frame's own. */
    if (kind === 'list') {
      /* Design C is the only card with both drawers. They cover the same space,
         so opening one closes the other rather than stacking. */
      const info = root.querySelector('.widget');
      if (info && info.classList.contains('info-open')) {
        info.classList.remove('info-open');
        const isheet = root.querySelector('.info-sheet');
        if (isheet) isheet.setAttribute('aria-hidden', 'true');
      }
      const card = root.querySelector('.widget'), sheet = root.querySelector('.sheet:not(.info-sheet)');
      if (card && sheet) {
        const opening = !card.classList.contains('sheet-open');
        sheet.setAttribute('aria-hidden', String(!opening));
        const opener = root.querySelector('[data-act="list"].h-btn');
        if (opener) {
          opener.setAttribute('aria-pressed', String(opening));
          opener.setAttribute('aria-label', opening ? 'Hide Episodes' : 'Show Episodes');
        }
        const run = () => {
          card.classList.toggle('sheet-open', opening);
          /* Focus follows the sheet, since it covers the controls underneath
             and a keyboard would otherwise be tabbing through a hidden
             player. */
          const target = opening ? sheet.querySelector('.sheet-close') : opener;
          if (target) target.focus({ preventScroll: true });
        };
        if (opening) openStaged(run); else run();
      }
    }
    /* Info opens the drawer on designs A and B. Design C has no info frame of
       its own and already uses a drawer for its episodes, so it keeps the
       status line rather than stacking one drawer on another. */
    if (kind === 'info') toggleInfo();
    if (kind === 'more') rowMenu(btn);
    /* Retarget on the way in. A row share mutates the sheet in place, so the
       player's own button has to put it back on the loaded content. The scrim
       and the close button carry this same action to CLOSE the sheet, which is
       why it only retargets when it is about to open. */
    if (kind === 'share') {
      const card = root.querySelector('.widget');
      const open = card && card.classList.contains('share-open');
      /* The two podcast kinds ask what to share first. Only on the way in: this
         same action is carried by the scrim and the drawer's own close button,
         and putting a menu up as the drawer leaves would be absurd. */
      if (!open && hasShareMenu(w.data)) { shareMenu(btn); return; }
      if (!open) retargetShare(null);
      shareDialog();
    }
  }

  /* The info drawer, opened either from the live card's own info button or,
     on podcast, from an episode row's overflow. `force` is what the row menu
     needs: a row asking for episode info means show it, not toggle it. */
  function toggleInfo(force) {
    const card = root.querySelector('.widget'), sheet = root.querySelector('.info-sheet');
    if (!card || !sheet) { if (w.data) status(w.data.subtitle); return; }
    if (card.classList.contains('sheet-open')) {
      card.classList.remove('sheet-open');
      const esheet = root.querySelector('.sheet:not(.info-sheet)');
      if (esheet) esheet.setAttribute('aria-hidden', 'true');
    }
    const opening = force === undefined ? !card.classList.contains('info-open') : !!force;
    sheet.setAttribute('aria-hidden', String(!opening));
    const opener = root.querySelector('[data-act="info"]:not(.sheet-close)');
    if (opener) opener.setAttribute('aria-pressed', String(opening));
    const run = () => {
      card.classList.toggle('info-open', opening);
      const target = opening ? sheet.querySelector('.sheet-close') : opener;
      if (target) target.focus({ preventScroll: true });
    };
    if (opening) openStaged(run); else run();
  }

  /* The episode row overflow, frames 2609:36099 and 2609:37074. Two items, and
     they are where the player's plus and info went rather than new behaviour:
     It carried Follow Podcast and View Episode Info; Follow Podcast has since
     been removed, so one item is left. View Episode Info opens the same drawer
     the info button did, describing the row you asked from rather than whatever
     is loaded, which is the whole reason the action reads better here. */
  function rowMenu(btn) {
    const d = w.data;
    const r = d && (d.rows || []).find((x) => String(x.id) === String(btn.dataset.ep));
    openMenu(btn, {
      label: 'Episode options',
      className: 'row-menu',
      alignRight: true,
      /* Follow Podcast was the first item and has been removed. */
      items: [
        { value: 'epinfo', label: 'View Episode Info' },
        { value: 'share',  label: 'Share Episode' }
      ],
      onPick: (value) => {
        if (value === 'share') { retargetShare(r); shareDialog(true); return; }
        const sheet = root.querySelector('.info-sheet');
        if (sheet && r) {
          const h = sheet.querySelector('h3'), body = sheet.querySelector('.info-body');
          if (h) h.textContent = r.title || d.infoTitle || d.subtitle || '';
          if (body) body.textContent = r.info || 'No description available.';
        }
        toggleInfo(true);
      }
    });
  }

  /* What the share sheet should be describing. A row when the action came from
     a row's overflow, and whatever is loaded otherwise. */
  /* The share drawer's metadata row, read off the five Design D share drawers.
     They do not agree, which is why this is a table rather than two lines of
     markup:
       2670:137239  show      square  Podcast Name   / Podcast Description
       2670:137412  episode   square  Episode Title  / Podcast Name
       2666:130642  live      square  Station Name   / Station Description
       2666:131704  artist    ROUND   Artist Name    / nothing, one line
       2666:132112  playlist  square  Playlist Name  / Playlist Description

     I had removed this row entirely on an earlier reading of these frames,
     where the Content instance was hidden. The frames have since been redrawn
     and it is visible on all five. */
  function shareMeta(d) {
    switch (d.kind) {
      case 'episode':  return { title: d.title, sub: d.subtitle };
      case 'live':     return { title: d.title, sub: d.desc || '' };
      case 'artist':   return { title: d.subtitle, sub: '', round: true };
      case 'playlist': return { title: d.title, sub: d.subtitle };
      default:         return { title: d.subtitle, sub: d.showDesc || '' };
    }
  }

  function shareFields(d, r) {
    /* A row is always an episode of the loaded show, which is the one case that
       is not the card's own content. */
    if (r) return { title: r.title, sub: d.subtitle, art: r.art || d.art,
                    url: showUrl(d) + 'episode/episode-' + r.id + '/' };
    /* Everything else shares the card's own content, through the same builder
       the Listen on iHeart link uses. It used to fall through to episodeUrl(),
       which was right while podcast and live were the only two kinds and became
       wrong the moment there were five: on artist radio and playlist it built
       podcast/undefined-undefined/episode/episode-undefined, and shared it. */
    const m = shareMeta(d);
    return { title: m.title, sub: m.sub, round: m.round, art: d.art, url: listenUrl(d) };
  }

  /* mm:ss, or h:mm:ss past the hour, with the leading unit unpadded. That is
     packages/utilities formatTimeValue, which is what the menu label uses in
     production, and it is NOT the scrubber's fmt(): that pads minutes to two
     digits, so the same moment reads 01:30 there and 1:30 here. Both are right
     for where they are. */
  function shareClock(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.trunc(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  }

  /* What each menu pick shares, and what the drawer is then titled.

     From apps/listen. "Share from {time}" hands over the EPISODE url with
     ?position= on it and its drawer still says "Share Episode", because
     production spreads the episode's own share props and replaces only the url
     (podcast-hero.tsx shareFromPositionOnClick, episode-row.tsx likewise). */
  function sharePick(d, pick, at) {
    if (pick === 'podcast') return { url: showUrl(d), title: 'Share Podcast' };
    /* `at` is the second the MENU was opened at, carried through the pick
       rather than read again here. Reading it again is what production does,
       and in production the label and the link recompute together on every
       tick so they cannot disagree. Here the label is frozen the moment the
       menu is drawn, so reading the clock at the click made the two differ by
       however long the menu stood open: a menu saying 0:12 handed over
       ?position=13. */
    if (pick === 'position') {
      return { url: episodeUrl(d) + '?position=' + Math.trunc(at || 0),
               title: 'Share Episode' };
    }
    return { url: episodeUrl(d), title: 'Share Episode' };
  }

  /* The share menu, which is what the share button opens on the two podcast
     kinds now rather than the drawer itself.

     The item sets are production's, from the two heroes:

       podcast   Share Podcast        always        podcast-hero.tsx
                 Share Episode        while playing
                 Share from {time}    while playing
       episode   Share Episode        always        episode-hero.tsx, which
                 Share from {time}    while playing   renders SocialShareEpisode
                 Share Podcast        always          and then Share Podcast

     Both gate the episode-level items on playing, which is the only honest
     place to put "Share from {time}" since there is no position to name until
     something is playing. Live radio, artist radio and playlist have no second
     thing to share, so their button still opens the drawer directly. */
  const hasShareMenu = (d) => !!d && (d.kind === 'podcast' || d.kind === 'episode');

  function shareItems(d, at) {
    const playing = !!w.playing;
    const from = { value: 'position', label: 'Share from ' + shareClock(at) };
    if (d.kind === 'podcast') {
      return [{ value: 'podcast', label: 'Share Podcast' }].concat(
        playing ? [{ value: 'episode', label: 'Share Episode' }, from] : []);
    }
    return [{ value: 'episode', label: 'Share Episode' }]
      .concat(playing ? [from] : [])
      .concat([{ value: 'podcast', label: 'Share Podcast' }]);
  }

  function shareMenu(btn) {
    const d = w.data;
    /* Read once, used by both the label and the link. See sharePick. */
    const at = Math.trunc((w.audio && w.audio.currentTime) || 0);
    openMenu(btn, {
      label: 'Share options',
      className: 'share-menu',
      alignRight: true,
      items: shareItems(d, at),
      onPick: (value) => { retargetShare(null, value, at); shareDialog(true); }
    });
  }

  /* Point the share sheet at something.

     The sheet is rendered once from whatever is loaded, so asking from a row
     has to retarget it or every row would share episode one. SIX things carry
     the episode: the title, the artwork, the link the copy button reads, the
     two social hrefs and the embed snippet. Miss one and the sheet says a
     different episode from the one it copies, which is worse than not offering
     the action at all.

     It runs on the way IN every time, including from the player's own share
     button with no row, because retargeting mutates the sheet in place. Without
     that, sharing a row and then pressing share on the player would hand you
     the row's episode while the card played another.

     The subtitle is deliberately left alone. It is the SHOW, the same for every
     row in the list, and the station line on live radio. */
  function retargetShare(r, pick, at) {
    const d = w.data;
    const sheet = root.querySelector('.share-sheet');
    if (!d || !sheet) return;
    const f = pick ? sharePick(d, pick, at) : { url: shareFields(d, r).url, title: null };
    /* The heading names what was picked. A row share is an episode whatever the
       card is, and everything else falls back to the kind's own title. */
    const head = sheet.querySelector('.share-head h2');
    const title = f.title || (r ? 'Share Episode' : (SHARE_TITLE[d.kind] || 'Share'));
    if (head) head.textContent = title;
    sheet.setAttribute('aria-label', title);
    const embedCode = '<iframe allow="autoplay" width="100%" height="' + embedHeight(d) + '" src="' +
      (f.url.includes('?') ? f.url + '&embed=true' : f.url + '?embed=true') +
      '" frameborder="0"></iframe>';
    const set = (sel, fn) => { const el = sheet.querySelector(sel); if (el) fn(el); };
    sheet.dataset.url = f.url;
    /* The artwork, title and description this used to retarget are gone with
       the frame's body, which is four buttons and nothing else. What is left to
       retarget is everything that carries the URL. */
    set('[data-share="facebook"]', (el) => {
      el.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(f.url); });
    set('[data-share="x"]', (el) => {
      el.href = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(f.url) +
                '&text=' + encodeURIComponent(f.title || ''); });
    set('[data-share="code"]', (el) => { el.dataset.code = embedCode; });
  }

  /* Choosing an episode from the list.
     The list endpoint does not carry mediaUrl, only the single episode one
     does, which is the same trap the search path hit: a row knows enough to be
     drawn and not enough to be played, so the audio is fetched on the way.
     The media element is kept rather than replaced. createMediaElementSource
     can only be called once per element, so a fresh element would need a fresh
     analyser and the waveform would stop reading the audio. */
  async function selectEpisode(id) {
    const d = w.data;
    if (!id || !d || d.kind !== 'podcast') return;
    /* The row for the episode already loaded is a transport control, not a
       selection: it toggles. Two reasons beyond matching what Spotify, Apple
       Music and Pocket Casts all do. A row that answers a click with nothing
       reads as broken rather than as already-playing, and people click it
       again. And the guard this replaces only covered the PLAYING case, so
       clicking the current episode while paused fell through to a full refetch
       that reset currentTime to 0 and threw away your place. Resuming is the
       only correct answer there whichever way the toggle question had gone. */
    if (String(id) === String(d.currentEpisodeId)) { toggle(); return; }
    status('Loading episode');
    try {
      const ep = await jget(`${API}/v3/podcast/episodes/${id}`).then((x) => x.episode);
      if (!ep || !ep.mediaUrl) throw new Error('that episode has no audio');
      if (w.playing) setPlaying(false);
      d.title = ep.title;
      d.episodeId = ep.id;
      d.currentEpisodeId = ep.id;
      /* The info drawer follows the episode, so it must move when one is
         chosen. The single episode endpoint carries a description too. */
      d.infoTitle = ep.title;
      d.infoBody = stripHtml(ep.description);
      d.audio = ep.mediaUrl;
      d.hls = false;
      /* Designs A and B keep the SHOW's artwork, which is what their frames
         draw. Design C's backdrop follows the episode, and it needs nothing
         here: render() runs below and stageArt() reads currentEpisodeId, which
         has just moved. The thumbnail stays the show either way. */
      ensureAudio();
      w.audio.src = ep.mediaUrl;
      w.audio.load();
      /* A different episode starts at its own beginning. */
      w.audio.currentTime = 0;
      render();
      status('');
      setPlaying(true);
    } catch (e) {
      status('Could not load that episode. ' + e.message, true);
    }
  }

  function ensureAudio() {
    if (w.audio) return;
    const a = new Audio();
    a.crossOrigin = 'anonymous';     /* required before the analyser can read samples */
    /* metadata, not none. The duration lives in the file's header, and with
       'none' the browser fetches nothing until playback, so the scrubber read
       --:-- until you pressed play. A header fetch is a few KB and lands in
       about a second. Not 'auto': this is still an embed and should not pull
       the audio itself before anyone asks. */
    a.preload = 'metadata';
    a.addEventListener('timeupdate', tick);
    a.addEventListener('loadedmetadata', tick);
    a.addEventListener('ended', () => setPlaying(false));
    a.addEventListener('error', () => status('That audio would not load. It may be geo-restricted or offline.', true));
    /* Every one of these is a moment the answer can change, and each simply
       re-asks it rather than asserting a state of its own. */
    ['waiting', 'stalled', 'playing', 'canplay', 'canplaythrough', 'progress',
     'timeupdate', 'seeking', 'seeked', 'pause', 'play', 'error', 'ended',
     'loadstart', 'emptied'].forEach((ev) => a.addEventListener(ev, refreshBuffering));
    w.audio = a;
  }

  /* Loading the header needs a src, and a src is only set when play is pressed,
     so the element has to exist and be pointed at the audio up front.
     On demand only. A live stream has no duration to learn and attaching one
     would start pulling the broadcast before anyone asked for it, which is the
     opposite of what preload is for here.
     This never raises the buffering ring: stuck() gates on w.want, the play
     intent, and a prefetch does not set it. */
  function prefetchDuration() {
    const d = w.data;
    if (!d || d.kind === 'live' || d.hls || !d.audio) return;
    ensureAudio();
    if (!w.audio.src) w.audio.src = d.audio;
  }

  function attachSource() {
    const d = w.data;
    ensureAudio();
    if (d.hls) {
      if (w.audio.canPlayType('application/vnd.apple.mpegurl')) { w.audio.src = d.audio; }
      else if (window.Hls && window.Hls.isSupported()) {
        w.hls = new window.Hls({ enableWorker: true });
        w.hls.loadSource(d.audio); w.hls.attachMedia(w.audio);
        w.hls.on(window.Hls.Events.ERROR, (_, x) => { if (x.fatal) status('Live stream error. ' + x.details, true); });
      } else { status('This browser cannot play HLS.', true); return false; }
    } else { w.audio.src = d.audio; }
    return true;
  }

  /* ---------------------------------------------------------------------
     The pause veil, frame 2581:363615.

     After listening stops, the card covers itself with the iHeart prompt.

     How long after is per design, because the two are asking different
     questions. Design B waits five seconds, on the argument that pausing is
     usually a two second interruption, someone taking a call or talking to
     the person next to them, and a prompt landing on the same frame as the
     pause punishes a listener who is coming straight back. Design C raises
     it immediately, so the prompt reads as the answer to the pause rather
     than as something that arrives later on its own. Keeping one of each is
     deliberate, it is the comparison.

     Only a pause the listener asked for arms it. setPlaying(false) is also
     how a card is stopped when another one starts, and how the episode
     switcher clears the old track, and a prompt raised by either of those
     would be covering a card the listener never touched.

     And it shows ONCE. Closing it is an answer, so playing again does not
     make the card eligible again, and neither does loading different content
     into it. Asking a second time after someone has already said no is the
     same nagging the five second delay exists to avoid.
     --------------------------------------------------------------------- */
  /* The badge on skip next. The frames draw a 6 there and the RFD has a
     "Free User - Skip Limit" section, so it is a real product rule rather than
     decoration. Nothing enforces it here; the card is not signed in. */
  const SKIP_LIMIT = SKIP_LIMIT_N;

  const VEIL_DELAY = variant === 'c' ? 0 : 5000;

  function clearVeil() { clearTimeout(w.veilTimer); w.veilTimer = null; }

  function showVeil(on) {
    const card = root.querySelector('.widget');
    const veil = root.querySelector('.pause-veil');
    if (!card || !veil) return;
    card.classList.toggle('veil-open', on);
    veil.setAttribute('aria-hidden', on ? 'false' : 'true');
    /* Focus is deliberately not moved here, on either delay. It opens off a
       pause rather than off a request to open it, and taking focus away from
       wherever the listener had moved on to is wrong whether that is five
       seconds later or the same moment. The close button is reachable as
       soon as they Tab, because the trap pulls focus in on the first Tab
       while the veil is up. */
  }

  /* The page can switch the prompt off entirely, and does by default. It covers
     the card the moment you pause, and on a page whose whole purpose is looking
     at cards that is usually in the way. Read at arm time rather than cached,
     so flipping the switch takes effect on the next pause without a reload.
     The single card page has no <main data-veil>, so it keeps the prompt. */
  const veilAllowed = () => {
    const m = document.querySelector('main');
    return !m || m.dataset.veil !== 'off';
  };

  function armVeil() {
    if (!veilAllowed()) return;
    if (w.veilSeen) return;          /* once per card, and never again after a close */
    clearVeil();
    w.veilTimer = setTimeout(() => { w.veilTimer = null; showVeil(true); }, VEIL_DELAY);
  }

  function dismissVeil() {
    w.veilSeen = true;
    clearVeil();
    showVeil(false);
  }

  async function toggle() { setPlaying(!w.playing, true); }

  /* ---------------------------------------------------------------------
     Artist radio and playlist run a simulated transport.

     Their audio needs an x-ihr-profile-id and x-ihr-session-id, and the only
     unauthenticated way to get them is loginOrCreateOauthUser, which mints an
     account on iHeart production per visit. That works from this origin but
     this page is public, so it is not done. Everything else on these two cards
     is real: the artist, the playlist, the track list and the artists on it all
     come from public catalog endpoints.

     What is simulated is the clock. The card steps through its real tracks at
     their real durations, so the metadata changes when a track would actually
     end, and stop and skip behave. Nothing is heard.
     --------------------------------------------------------------------- */
  const simTick = () => {
    const d = w.data; if (!d) return;
    const t = curTrack(d); if (!t) return;
    w.simPos = (w.simPos || 0) + 1;
    if (w.simPos >= (t.duration || 180)) nextTrack();
  };
  function nextTrack() {
    const d = w.data; if (!d || !(d.tracks || []).length) return;
    d.trackIndex = ((d.trackIndex || 0) + 1) % d.tracks.length;
    w.simPos = 0;
    paintStream();
  }
  function skipTrack() {
    const d = w.data;
    if (!d || !caps(d).stopNext) return;
    if (d.skipsLeft === undefined) d.skipsLeft = SKIP_LIMIT;
    /* Spent. The button stays live rather than going disabled, because pressing
       it is how you find out why nothing happened, which is what production
       does: it shows the toast and does not advance. */
    if (d.skipsLeft <= 0) { skipToast(); return; }
    d.skipsLeft -= 1;
    paintSkips();
    nextTrack();
  }

  /* The count is its own layer over the glyph, so it can be written in place
     rather than re-rendering the card under the listener. */
  function paintSkips() {
    const d = w.data; if (!d) return;
    const n = skipsLeft(d);
    if (n === null) return;
    const el = q('.skip-n'); if (el) el.textContent = String(n);
    const btn = q('.h-btn.skip');
    if (btn) btn.setAttribute('aria-label', 'Next Track, ' + n + ' skips left');
  }
  /* Writes the three metadata lines and the backdrop in place. A re-render
     would rebuild the card under the listener every time a track changed, which
     is the thing that broke the drawer and the live track order before. */
  function paintStream() {
    const d = w.data; if (!d) return;
    const t = curTrack(d);
    /* .mqi first: the line is an anchor wrapping that span now, and writing to
       the <p> itself would replace the anchor with bare text and silently drop
       the link on the first track change. */
    const set = (sel, text) => { const e = q(sel + ' .mqi') || q(sel); if (e) e.textContent = text; };
    if (d.startedSim && t) {
      if (!q('.h-station')) { render(); return; }    /* idle block has fewer lines */
      set('.h-station', d.title);
      /* Rebuilt, not patched: the line is a track, a separator and an artist
         now, which a textContent cannot express. Same builder the renderer
         uses, so the two cannot drift. */
      const nm = q('.h-name');
      if (nm) {
        const r = streamRef(t);
        nm.innerHTML = trackArtistLine(t.title, t.artist, trackUrl(r), artistUrl(r));
      }
    } else { render(); return; }
    const artEl = q('.art'), want = (t && t.art) || d.art || '';
    if (artEl && want && artEl.getAttribute('src') !== want) artEl.setAttribute('src', want);
    markOverflow(root);
  }

  async function setPlaying(on, byUser) {
    /* The simulated branch. It shares everything below the audio element, so
       the veil, the playing class, the glyph and the one card at a time rule
       all behave exactly as they do for real audio. */
    if (w.data && caps(w.data).stopNext) {
      clearInterval(w.simTimer); w.simTimer = null;
      if (on) {
        INSTANCES.forEach((o) => { if (o !== w && o.playing) o.pause(); });
        w.data.playingSim = true;
        /* Set on the first play and never cleared. It decides whether the
           metadata block shows a track, and a PAUSED card is still on a track,
           so it has to outlive playingSim. */
        w.data.startedSim = true;
        if (w.data.skipsLeft === undefined) w.data.skipsLeft = SKIP_LIMIT;
        w.simTimer = setInterval(simTick, 1000);
      } else {
        /* Pause, not stop. These drew a stop square and reset to zero, on the
           reading that a station cannot be resumed. Asked for as a pause, so
           the position is kept and the glyph says so. The two had to change
           together: a pause glyph over a transport that silently returns to
           zero is worse than either on its own. */
        w.data.playingSim = false;
      }
      w.playing = on;
      setPlayingClass();
      paintStream();
      const pi2 = q('.pi');
      if (pi2) pi2.src = on ? GLYPH.pause : GLYPH.play;
      const pb2 = q('[data-act="play"]');
      if (pb2) pb2.setAttribute('aria-label', on ? 'Pause' : 'Play');
      if (on) { clearVeil(); showVeil(false); }
      else if (byUser) armVeil();
      else clearVeil();
      return;
    }
    if (on) {
      INSTANCES.forEach((o) => { if (o !== w && o.playing) o.pause(); });   /* one at a time */
      if (!w.data || !w.data.audio) { status('Nothing loaded to play.', true); return; }
      if (!w.audio || (!w.audio.src && !w.hls)) { if (!attachSource()) return; }
      /* Intent is recorded before the first await, so the ring can be asked
         about at any point during the load rather than only after it. */
      w.want = true;
      refreshBuffering();
      try {
        if (!w.analyser) {
          w.ctx = w.ctx || new (window.AudioContext || window.webkitAudioContext)();
          w.src = w.ctx.createMediaElementSource(w.audio);
          w.analyser = w.ctx.createAnalyser();
          /* 2048, not 512. At the 512 the bins are 23Hz wide on a 48k context
             and 12Hz on a 24k one, which is what a log mapping needs at the
             bass end; at 512 the lowest bands all landed in the same bin. */
          w.analyser.fftSize = 2048; w.analyser.smoothingTimeConstant = .6;
          w.freq = new Uint8Array(w.analyser.frequencyBinCount);
          w.bands = null;
          w.src.connect(w.analyser); w.analyser.connect(w.ctx.destination);
        }
        if (w.ctx.state === 'suspended') await w.ctx.resume();
        await w.audio.play();
        /* Design C says nothing here. The card already answers "is it playing"
           with the button glyph, the scrubber and, on live, the track line, so
           a line of prose under the card repeats what is on it. It is cleared
           rather than left alone, so an error from a previous attempt does not
           sit there while the audio plays. The other designs keep the line;
           only C was asked to drop it. Errors still report on every design,
           being the one thing the card cannot show by itself. */
        if (variant === 'c') status('');
        else status(w.data.kind === 'live' ? 'Live now.' : 'Playing.');
      } catch (e) { w.want = false; refreshBuffering(); status('Playback blocked. ' + e.message, true); return; }
    } else if (w.audio) {
      w.want = false;
      refreshBuffering();
      w.audio.pause();
      if (w.data && w.data.kind === 'live') w.audio.currentTime = 0;   /* stop, not pause */
    }
    if (!on) w.want = false;
    refreshBuffering();
    w.playing = on;
    setPlayingClass();
    /* A live stream cannot be resumed from where it left off, so live radio
       stops rather than pauses. */
    const stopper = !!(w.data && w.data.kind === 'live');
    const pi = q('.pi');
    if (pi) pi.src = on ? (stopper ? GLYPH.stop : GLYPH.pause) : GLYPH.play;
    const pb = q('[data-act="play"]');
    if (pb) pb.setAttribute('aria-label', on ? (stopper ? 'Stop' : 'Pause') : 'Play');
    if (on) loop(); else { cancelAnimationFrame(w.raf); settle(); }

    /* Playing clears a pending prompt, but it does NOT make the card eligible
       again. Closing the veil is an answer, and asking a second time after
       someone has already said no is the behaviour the delay exists to avoid. */
    if (on) { clearVeil(); showVeil(false); }
    else if (byUser) armVeil();
    else clearVeil();
  }
  w.pause = () => setPlaying(false);

  /* Now playing follows the station, not the transport.
     This used to start only when the listener pressed play and stop the moment
     they stopped, which meant a station loaded during a commercial break kept
     showing no track for as long as it sat there, however long the song that
     came next ran. The production player installs its poller on load and keeps
     it while the tab is visible, whatever the transport is doing, so this does
     the same. Five seconds is production's interval too. */
  const NP_INTERVAL = 5000;
  async function refreshNowPlaying() {
    if (!w.data || w.data.kind !== 'live' || !w.data.stationId) return;
    const id = w.data.stationId;
    const np = await nowPlaying(id);
    /* The station can be swapped out while this request is in flight, and
       writing A's track onto B is how a widget ends up lying quietly. */
    if (!w.data || w.data.stationId !== id) return;
    /* The on-air show only changes when its slot ends, so this asks again at
       that boundary rather than on the 5 second track cadence. Off schedule
       stopMs is 0 and the first poll settles it. */
    if (!w.data.showStopMs || Date.now() >= w.data.showStopMs) {
      const show = await onAirNow(id);
      if (!w.data || w.data.stationId !== id) return;
      const was = w.data.show;
      w.data.show = (show && show.name) || null;
      w.data.showHref = (show && show.href) || null;
      /* Back off for a minute when the answer is empty, so an off-schedule
         station is not asked every five seconds. */
      w.data.showStopMs = (show && show.stopMs) || (Date.now() + 60000);
      /* Only visible while there is no track, so nothing to redraw otherwise. */
      if (was !== w.data.show && !(w.data.track && w.data.artist)) { render(); return; }
    }
    /* No answer means keep the answer already on screen, which is what the
       production player does: setCurrentTrackMeta spreads the response over the
       existing meta and preserves a Track type that is already set, so a 204
       leaves the line alone rather than clearing it.
       This matters more than it sounds. Stations are between songs a large part
       of the time, through spot breaks, live reads and talk. Sampled across 20
       stations at one instant, 13 answered 204. Clearing on every 204 meant the
       track line spent most of its life empty, which is the complaint. The line
       now holds the last track the station actually reported and is reset only
       by loading a different station, so it can still never resurrect a song
       from before the widget was opened. */
    if (!np) return;
    const had = !!(w.data.track && w.data.artist);
    w.data.track = np.track || null;
    w.data.artist = np.artist || null;
    w.data.artistId = np.artistId || null;
    w.data.trackId = np.trackId || null;
    w.data.trackArt = np.art || null;
    const has = !!(w.data.track && w.data.artist);
    /* Design C paints the track's artwork behind itself, so a new track is a
       new backdrop. This sits ABOVE the two early returns below, because a
       station dropping out of a song still changes the backdrop: trackArt goes
       null and stageArt() falls back to the station logo. Guarded on a real
       change, since assigning the same src restarts the decode and re-runs the
       colour read for nothing. */
    if (variant === 'c') {
      const artEl = q('.art'), want = stageArt(w.data);
      if (artEl && want && artEl.getAttribute('src') !== want) artEl.setAttribute('src', want);
    }
    /* Gaining or losing track data changes how many lines the block has, and
       now also its type size, so that edge needs a re-render. */
    /* The artwork cards keep the same number of lines whether a track is on or
       not, so they are written in place. Only the bar card changes shape at that
       edge, gaining or losing a two line block and a type size with it. */
    /* Every design gains or loses a line at this edge now, the artwork cards
       gaining the station line under the track, so all of them re-render rather
       than only the bar card. */
    if (had !== has) { render(); return; }
    if (!has) return;
    /* A new track is a new destination, so the anchors move with the text. */
    const retarget = (sel, href) => {
      const a = q(sel + ' a.line-link');
      if (a && href) a.setAttribute('href', href);
    };
    if (variant === 'bar') {
      const tr = q('.np-track .mqi'), ar = q('.np-artist .mqi');
      if (tr) tr.textContent = w.data.track;
      if (ar) ar.textContent = w.data.artist;
      retarget('.np-artist', artistUrl(w.data));
      retarget('.np-track', trackUrl(w.data));
    } else {
      /* The station line, then the TRACK on the bold line, then the artist
         under it, matching liveMeta() exactly.

         These lines have two writers: liveMeta() builds them on render and this
         patches them in place when the station changes song. Swapping the order
         in one and not the other is invisible on first paint and wrong from the
         first poll onward, which is what happened: the render was right, then
         five seconds later this put the artist back on the bold line and left
         the track line untouched, because it was still looking for .h-track. */
      const L = heroLines(w.data);
      const st = q('.h-station .mqi');
      if (st) st.textContent = L.station;
      /* The playing line is now track and artist together, so it is rebuilt
         rather than patched: two anchors and a separator cannot be set with a
         textContent. This is the writer that silently disagreed with the
         renderer once before, which is why it is the same call rather than a
         second copy of the layout. */
      const name = q('.h-name');
      if (name) name.innerHTML =
        trackArtistLine(L.name, L.sub, trackUrl(w.data), artistUrl(w.data));
    }
    /* The new track is a different length, so the marquee has to be
       re-measured rather than left on the previous track's distance. */
    markOverflow(root);
  }
  function startNowPlaying() {
    clearInterval(w.npTimer);
    if (!w.data || w.data.kind !== 'live' || !w.data.stationId) return;
    if (document.hidden) return;              /* nothing to update, nobody looking */
    refreshNowPlaying();
    w.npTimer = setInterval(refreshNowPlaying, NP_INTERVAL);
  }
  w.startNowPlaying = startNowPlaying;
  /* Redraw in place, keeping the data and the playback state. The prototype's
     background switch needs this: the backdrop is chosen at render time, so
     without a redraw the cards sit on whatever the previous setting picked
     until something else happens to re-render them. */
  w.repaint = () => { if (w.data) render(); };

  const fmt = (s) => !isFinite(s) ? '--:--' :
    (Math.floor(s / 60) < 10 ? '0' : '') + Math.floor(s / 60) + ':' + (Math.floor(s % 60) < 10 ? '0' : '') + Math.floor(s % 60);

  /* Design C keeps its actions in the bottom right row rather than beside the
     play button, which is what frames 2533:85717 and 2512:111876 draw. The
     Frame 2533:85625 splits that row: speed and the list button to the LEFT,
     the actions to the RIGHT. Two groups either end of a space-between row.
     Live radio has neither a speed control nor an episode list, so its left
     group is empty; it is still emitted, because space-between with a single
     child would push that child to the start instead of the end.
     What sits in the right group now depends on the content. Frame 2600:96063
     leaves podcast with share alone: plus and info moved into the episode row
     overflow, where they read as Follow Podcast and View Episode Info. Live
     radio has no episode list to move them into, so it keeps all three.
     Moving speed out of the transport also leaves that row symmetrical, back 15
     and forward 30 either side of the play button.
     They are not part of the transport, so they do not hide with it: both
     frames show all of them on a card nobody has pressed play on yet. */
  /* Frame 2613:77793 turns this row around. The controls go LEFT, and the right
     is the Listen on iHeart lockup, which is where the badge from the top bar
     ended up. Share left the row entirely and is in the top bar now, in the
     corner the badge used to hold.

     Live radio has no frame of its own for this, so it follows the same rule
     rather than inventing a second one: whatever controls the card has sit on
     the left, the lockup on the right. Live has none left. Speed and the
     episode list never applied to it, and the info button has now gone too, so
     its left group is emitted empty. It still has to be emitted: space-between
     with a single child pushes that child to the START, which would put the
     lockup on the wrong side of the card. */
  /* Speed used to sit here beside the list button. It moved up into the control
     row, to the left of the back 15 button, which is where it is asked for.

     Two things follow from that move and neither is a side effect to fix. It is
     now hidden until the first play, because the whole control row is
     (.widget.hero:not(.started) .hero-controls .h-btn), and being left of a
     button that does not exist yet is not a position. And the play button does
     not shift, because design C's control row is a 1fr auto 1fr grid rather
     than a centred flex row, so the two sides hold the same width whatever they
     hold; that grid was put in for exactly this failure and it is the reason
     the left side can now carry two buttons against the right side's one.

     The empty span is still emitted when the left group has nothing in it.
     space-between with a single child pushes that child to the START, which
     would put the lockup on the wrong side of the card. */
  /* A function, not an object literal. The list button's label names what it
     opens, which is Episodes on a podcast and Featured Artists on the other two,
     and an object built once at definition time would have captured w.data
     while it was still null. */
  /* Every card action now lives in the TOP bar, left of share, which frame
     2666:125692 draws for the list button and which info follows. The bottom
     row holds nothing but the lockup, which is what buys the height: it goes
     from 32 to the lockup's own 24 and the gap above it from 8 to 4.

     The empty span below is still emitted rather than dropped. space-between
     with a single child pushes that child to the START, which would put the
     lockup on the wrong side of the card. */
  const cActions = () =>
    '<span class="lr-side"></span>' +
    '<span class="lr-side">' + ihrLockup(listenUrl(w.data), listenName(w.data)) + '</span>';

  /* Redrawn from the stored hover value and wherever playback now is, so the
     span always runs from the thumb to the hovered point and closes itself
     when playback catches up. */
  /* accomplice Dialog carrying the social share sheet, the same one iheart.com
     opens from this icon. Title, sections and the embed snippet all come from
     apps/listen/app/components/social-share.

     Facebook and X are drawn with a neutral glyph rather than the platforms'
     own marks, which is the one place this drawer departs from frame
     2709:580630. Those marks are trademarks and this is a public repo; the
     row's structure, sizes and labels are what the prototype is testing, and a
     circle with the platform's name under it carries both.

     The "More" target and its glyph are gone. The frame draws five button
     groups and hides the fifth, so four is what it specifies: Copy link,
     Facebook, X, Copy code. */
  const GLYPH_COPY =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const GLYPH_OUT =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M14 4h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M20 4 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  /* The frame's fourth target is accomplice's `embed` icon, 2709:580731, a pair
     of angle brackets. A code symbol rather than a mark, so unlike the two
     platform logos there is nothing here to reproduce a trademark of. */
  const GLYPH_EMBED =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="m8 7-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="m16 7 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const GLYPH_X =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M6 6 18 18M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  /* Where an overlay anchored to the card should actually attach. The .widget
     is NOT reliable: on design C its content runs to 468 inside a 234 box, so
     an inset:0 child resolves against a padding box that is not what you see
     and lands 162px off. The .stage is the card's own visible box and is what
     the episodes drawer already anchors to. Bar cards have no stage, so they
     fall back to .player, then to the widget. */
  const overlayHost = () =>
    root.querySelector('.stage') || root.querySelector('.player') || root.querySelector('.widget');

  /* The rates production offers, in its order. Speed.Slow through
     Speed.Fastest in packages/playback/src/player/schemas.ts. Note 0.5 rather
     than the 0.75 this prototype cycled through: the enum has no 0.75. */
  const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

  /* One opener for both menus, the playback speed list and the episode row
     overflow. Placement, dismissal and focus are the same problem in both
     cases and the speed menu had already solved it; two copies of that would
     be the row markup mistake again. */
  function closeMenu() {
    const open = root.querySelector('.ihr-menu');
    if (open) open.remove();
    root.querySelectorAll('[aria-haspopup="menu"]').forEach(
      (b) => b.setAttribute('aria-expanded', 'false'));
    w.menuBtn = null;
    document.removeEventListener('keydown', onMenuKey, true);
    document.removeEventListener('pointerdown', onMenuAway, true);
  }
  function onMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }
  function onMenuAway(e) {
    const m = root.querySelector('.ihr-menu');
    if (m && !m.contains(e.target) &&
        !e.target.closest('[data-act="speed"], [data-act="more"]')) closeMenu();
  }

  function openMenu(btn, opts) {
    /* The WIDGET, not the visible card. On designs A and B the card is only the
       player: the episode list sits under it, inside the same widget, and the
       menu was being confined to the card and made to scroll while 246 and 316
       px of room sat unused just below. A menu may overlay a list; that is what
       menus do. Design C is the one case where the widget IS the card, so it
       has nowhere else to go and still trims. */
    const card = root.querySelector('.widget') || overlayHost();
    if (!card) return;
    /* Pressing the same trigger again closes it, the way a menu behaves.
       Pressing a different one moves the menu there rather than stacking. */
    const reopening = w.menuBtn === btn && root.querySelector('.ihr-menu');
    closeMenu();
    if (reopening) return;

    const menu = document.createElement('div');
    menu.className = 'ihr-menu' + (opts.className ? ' ' + opts.className : '');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', opts.label);
    menu.innerHTML = opts.items.map((it) =>
      '<button type="button" role="' + (it.checked === undefined ? 'menuitem' : 'menuitemradio') + '"' +
      ' data-value="' + esc(String(it.value)) + '"' +
      (it.checked === undefined ? '' : ' aria-checked="' + (it.checked ? 'true' : 'false') + '"') +
      '>' + esc(it.label) + '</button>'
    ).join('');

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-value]');
      if (!item) return;
      const value = item.dataset.value;
      closeMenu();
      if (btn.isConnected) btn.focus();
      opts.onPick(value);
    });
    /* The artwork cards play on any click, so the menu keeps its own. */
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => e.stopPropagation());

    card.appendChild(menu);

    /* Above the button by preference, below it when there is no room, and
       never ON it. Clamping a too-tall menu to the top of the card was the bug:
       on design B the button sits mid card, so a menu pinned to the top ran
       straight over the control it belongs to. The rule now is to measure both
       gaps, take the side that fits, and if neither does, take the larger gap
       and cap the menu to it so it still stops short of the button. */
    const cb = card.getBoundingClientRect();
    const bb = btn.getBoundingClientRect();
    const mb = menu.getBoundingClientRect();
    const GAP = 4, EDGE = 8;

    /* Row overflows sit hard against the right edge, so the menu is hung from
       the button's right rather than its left; anything else would immediately
       clamp and look detached from what opened it. */
    let left = opts.alignRight
      ? (bb.right - cb.left) - mb.width
      : bb.left - cb.left;
    left = Math.max(EDGE, Math.min(left, cb.width - mb.width - EDGE));

    const above = (bb.top - cb.top) - GAP - EDGE;        /* room over the button */
    const below = (cb.bottom - bb.bottom) - GAP - EDGE;  /* room under it */
    let top;
    if (mb.height <= above) {
      top = (bb.top - cb.top) - mb.height - GAP;
    } else if (mb.height <= below) {
      top = (bb.bottom - cb.top) + GAP;
    } else if (above >= below) {
      menu.style.maxHeight = Math.max(0, above) + 'px';
      top = EDGE;
    } else {
      menu.style.maxHeight = Math.max(0, below) + 'px';
      top = (bb.bottom - cb.top) + GAP;
    }
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    /* A capped menu opens on its current value rather than at the top. Design
       C's speed button sits in the middle of a 234px card, which leaves about
       90px over it against the 170 the five speeds want, so the menu scrolls
       more often than not and 2x would otherwise be off screen the moment it
       is the one selected.
       scrollTop is set directly rather than through scrollIntoView, which is
       free to scroll every ancestor as well and would move the page under the
       card the menu was opened from. */
    const current = menu.querySelector('[aria-checked="true"]');
    if (current && menu.scrollHeight > menu.clientHeight + 1) {
      menu.scrollTop = Math.max(0,
        current.offsetTop - (menu.clientHeight - current.offsetHeight) / 2);
    }

    w.menuBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onMenuKey, true);
    document.addEventListener('pointerdown', onMenuAway, true);
    const checked = menu.querySelector('[aria-checked="true"]') || menu.firstElementChild;
    if (checked) checked.focus();
  }

  function speedMenu(btn) {
    openMenu(btn, {
      label: 'Playback speed',
      className: 'speed-menu',
      items: SPEEDS.map((v) => ({ value: v, label: v + 'x', checked: v === w.speed })),
      onPick: (value) => {
        w.speed = Number(value);
        if (w.audio) w.audio.playbackRate = w.speed;
        /* The label lives in the button on every design that has one. */
        const lbl = btn.querySelector('span');
        if (lbl) lbl.textContent = w.speed + 'x';
        else status('Playback speed ' + w.speed + 'x');
      }
    });
  }

  /* The share sheet is part of the rendered card, like the episodes and info
     drawers, and opens by a class on the widget. It used to be built at click
     time and appended, and that fought the card: an inset:0 overlay resolved
     against a box that is not the one you see, and the sheet escaped the card
     entirely. The drawers that already worked here were all template-rendered,
     so this one is too. */
  /* Which row counts as the one loaded. `currentEpisodeId` is seeded with the
     newest episode so the card has something to show, which means row one would
     otherwise read as current on a card nobody has pressed play on: red title,
     scrim and a play control sitting over its artwork before anything is
     loaded. iheart.com marks the current episode the same way, and guards it
     the same way for the same reason. Their episode row is
     `active={playing || isCurrent}`, where

         const isCurrent = isCurrentEpisode && isNonNullish(station);

     and the comment above it says an ungated version "renders every episode
     title in the active (red) styling on a fresh podcast page"
     (IHRWEB-24410, IHRWEB-23812). `w.started` is this card's version of
     "a station is actually loaded": it latches on the first play. */
  const isCurrentRow = (d, r) =>
    !!w.started && String(r.id) === String(d.currentEpisodeId);

  /* The pause veil, frame 2581:363615.

     The frame draws it over a podcast card, but it is emitted for live radio
     too: live stops rather than pauses, and a stop is the same moment the
     prompt is there for. One markup for both, since the frame's content says
     nothing about the episode, only about iHeart. */
  function veilMarkup() {
    return `
      <div class="pause-veil" role="dialog" aria-label="Listen on iHeart" aria-hidden="true">
        <div class="pv-body">
          <button class="pv-close" type="button" data-act="veil" aria-label="Close">
            <img src="assets/close-white.svg" alt=""></button>
          <div class="pv-group">
            <img class="pv-logo" src="assets/ihr-logotype-white.svg" alt="iHeart"
                 width="107" height="24">
            <p class="pv-copy">Listen to live radio, podcasts, and music for free.</p>
            <a class="pv-cta" href="https://www.iheart.com/" target="_blank"
               rel="noopener">Go to iHeart.com</a>
          </div>
        </div>
      </div>`;
  }

  /* Frame 2709:580630, 350 by 166. A 64 header over a 16-padded body holding one
     row of four targets, and nothing else.

     What it replaced carried the item's artwork, its name and description, a
     "Share on" section over three targets, and an "Embed widget" section with a
     read-only input beside a filled Copy button. None of that is in this frame.
     The embed code survives as the fourth target. */
  function shareMarkup(d) {
    if (!d) return '';
    /* Read off the Design D share drawer frames rather than derived. Both
       podcast kinds say "Share Podcast", which is the frames' answer and not a
       slip: 2670:137239 on the show and 2670:137412 on the episode both say it.
       The heading names the KIND, and the drawer body names the item, which is
       why picking Share Episode from a row overflow retargets the URL every
       target carries and leaves this alone.

       .share-live is gone with the artwork it existed for. It did one thing,
       fitting a station logo inside a 56px tile with `object-fit: contain`, and
       there is no tile in this drawer any more. */
    const title = SHARE_TITLE[d.kind] || 'Share';
    const pageUrl = shareFields(d, null).url;
    const embedCode = '<iframe allow="autoplay" width="100%" height="' + embedHeight(d) + '" src="' +
      (pageUrl.includes('?') ? pageUrl + '&embed=true' : pageUrl + '?embed=true') +
      '" frameborder="0"></iframe>';
    return `
      <div class="share-scrim" data-act="share" aria-hidden="true"></div>
      <div class="share-sheet" role="dialog"
           aria-label="${esc(title)}" aria-hidden="true" data-url="${esc(pageUrl)}">
       <div class="share-panel">
        <div class="share-head">
          <h2>${esc(title)}</h2>
          <button class="share-close" data-act="share" type="button" aria-label="Close">
            <img src="assets/sheet-close.svg" alt=""></button>
        </div>
        <div class="share-body">
          <div class="share-targets">
            <button class="share-target" type="button" data-share="copy">
              <span class="ring">${GLYPH_COPY}</span><span class="lbl">Copy link</span></button>
            <a class="share-target" data-share="facebook" target="_blank" rel="noopener"
               href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}">
              <span class="ring">${GLYPH_OUT}</span><span class="lbl">Facebook</span></a>
            <a class="share-target" data-share="x" target="_blank" rel="noopener"
               href="https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(d.title || '')}">
              <span class="ring">${GLYPH_OUT}</span><span class="lbl">X</span></a>
            <!-- The embed snippet is this button now rather than a labelled
                 section with a read-only input beside a filled Copy button. The
                 frame makes it the fourth target in the same row as the other
                 three, so the code is carried on the button and goes straight to
                 the clipboard. Nothing is lost: the input was disabled and
                 readonly, so copying was always the only thing it was for. -->
            <button class="share-target" type="button" data-share="code"
                    data-code="${esc(embedCode)}">
              <span class="ring">${GLYPH_EMBED}</span><span class="lbl">Copy code</span></button>
          </div>
        </div>
       </div>
      </div>`;
  }

  /* Opening closes the other drawers, which cover the same space. */
  /* Open in two stages, a frame apart.

     A panel lives in a visibility:hidden container at rest, so it has no
     compositor layer and none of it is rasterised: not the artwork, not the
     text, not the input, not the buttons. Flipping visibility and starting the
     transform in the same frame makes the browser do all that painting on the
     animation's FIRST frame, and the slide visibly jumps before it settles into
     the curve.

     The computed style is perfect throughout, which is why none of the frame
     timing ever showed this: sampled from the click, the transform reads
     1.000, 0.985, 0.962, 0.929 exactly on the curve. The main thread was always
     right; the pixels were late.

     So visibility goes first, the panel paints while it is still translated out
     of sight, and the transform starts on the next frame against a layer that
     already exists. Two rAFs, because one only guarantees the style is applied,
     not that anything has been painted with it. */
  function openStaged(apply) {
    const card = root.querySelector('.widget');
    if (!card) { apply(); return; }
    /* A class, not an inline style. Setting `visibility` inline looked like the
       obvious way to do this and silently did nothing: the resting rule carries
       `transition: visibility 0s linear .6s`, so the inline change was DELAYED
       600ms and the prep frame never painted anything. The drawer then appeared
       fully open at the end of its own slide. The prep class turns the
       transition off along with turning visibility on. */
    card.classList.add('drawer-prep');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.remove('drawer-prep');
      apply();
    }));
  }

  function shareDialog(force) {
    const card = root.querySelector('.widget');
    if (!card) return;
    const opening = force === undefined ? !card.classList.contains('share-open') : !!force;
    card.classList.remove('sheet-open');
    const sheet = root.querySelector('.share-sheet');
    if (sheet) sheet.setAttribute('aria-hidden', String(!opening));
    const run = () => {
      card.classList.toggle('share-open', opening);
      if (opening) {
        const c = root.querySelector('.share-close');
        if (c) c.focus();
      }
    };
    if (opening) openStaged(run); else run();
  }

  function drawPreview() {
    const pv = q('.preview'); if (!pv) return;
    const a = w.audio;
    if (w.previewAt == null || !a || !isFinite(a.duration) || !a.duration) {
      pv.style.width = '0%'; return;
    }
    const now = Math.min(1, a.currentTime / a.duration) * 100;
    pv.style.left = now + '%';
    pv.style.width = Math.max(0, w.previewAt - now) + '%';
  }

  /* accomplice's AuthenticateCTANotification: kind info, the library message,
     and two tertiary gray actions carrying gray600 text. The two links are the
     real ones, checked rather than assumed: account.iheart.com/login answers
     200 and is what iheart.com's own signup page links to, while
     iheart.com/login is a 404. They open in a new tab because this is an embed
     and navigating the frame would take the player with it. */
  const AUTH_COPY = 'Log in to save your favorites and access Your Library';
  const LOGIN_URL = 'https://account.iheart.com/login';
  const SIGNUP_URL = 'https://www.iheart.com/signup/';

  /* Production's own copy, from apps/listen/app/playback/controls/next.tsx in
     iheartradio/web: the US variant, title "You've reached your skip limit" over
     "Want to listen on demand with unlimited skips?" and an upgrade CTA. The
     international variant says "for now" and offers no upsell, since those
     markets cannot buy the US plan; this prototype shows the US one. */
  const SKIP_TITLE = "You've reached your skip limit";
  const SKIP_COPY = 'Want to listen on demand with unlimited skips?';
  /* The action's words are the component's, not ours: accomplice's
     UpgradeCTANotification builds it as "Listen with {iheart} All Access" with
     iheart interpolated as "iHeartRadio". It said "Upgrade" here, which is not a
     label iHeart uses anywhere.

     account.iheart.com/subscribe is what production actually opens, from
     makeSubscribeUrl in apps/listen; it serves "Manage Your Subscription".
     www.iheart.com/upgrade/ was a guess and a wrong one: it answers 200 but
     resolves to a radio station page, 107.5 The River in Nashville, so the CTA
     was sending people to a station. */
  const SKIP_CTA = 'Listen with iHeartRadio All Access';
  const SUBSCRIBE_URL = 'https://account.iheart.com/subscribe';

  function skipToast() {
    showToast({ title: SKIP_TITLE, copy: SKIP_COPY,
                actions: [{ label: SKIP_CTA, href: SUBSCRIBE_URL }] });
  }

  function authToast() {
    showToast({ copy: AUTH_COPY,
                actions: [{ label: 'Log in', href: LOGIN_URL },
                          { label: 'Sign up', href: SIGNUP_URL }] });
  }

  function showToast(opt) {
    /* The WIDGET, not overlayHost(). overlayHost() hands back .stage on the
       artwork cards, which is the picture and nothing else, so the toast was
       being centred inside the player while the episode list sat untouched
       below it. It reads as belonging to the artwork rather than to the card.
       Hung off .widget it lands along the bottom edge of the whole thing,
       which is where a toast belongs and where the component puts it. */
    const card = root.querySelector('.widget') || overlayHost();
    if (!card) return;
    /* One at a time. Pressing the button again re-raises it rather than
       stacking a second copy behind the first. */
    const existing = card.querySelector('.toast-region');
    if (existing) existing.remove();

    const region = document.createElement('div');
    region.className = 'toast-region';
    region.innerHTML =
      '<div class="toast" role="status" aria-live="polite" data-kind="info">' +
        '<img class="toast-icon" src="assets/info-filled.svg" alt="">' +
        '<div class="toast-body">' +
          '<div class="toast-head">' +
            '<div class="toast-text">' +
              (opt.title ? '<p class="toast-title">' + esc(opt.title) + '</p>' : '') +
              '<p class="toast-copy">' + esc(opt.copy) + '</p>' +
            '</div>' +
            '<button class="toast-close" type="button" aria-label="Close">' +
              '<img src="assets/sheet-close.svg" alt=""></button>' +
          '</div>' +
          '<div class="toast-actions">' +
            opt.actions.map((a) =>
              '<a class="toast-action" href="' + esc(a.href) + '" target="_blank" rel="noopener">' +
              esc(a.label) + '</a>').join('') +
          '</div>' +
        '</div>' +
      '</div>';
    /* No timeout. A toast whose whole purpose is two links to click should not
       time out from under the person reading it; the stories use timeout null
       for exactly this shape. */
    region.querySelector('.toast-close').addEventListener('click', () => region.remove());
    /* The artwork cards treat a click anywhere as play/pause. The toast sits on
       top of that, so it stops its own clicks from reaching the card. */
    region.addEventListener('click', (e) => e.stopPropagation());
    card.appendChild(region);
  }

  function tick() {
    const a = w.audio, el = q('.el'); if (!el) return;
    el.textContent = fmt(a ? a.currentTime : 0);
    const du = q('.dur'); if (du && a) du.textContent = fmt(a.duration);
    const e = q('.elapsed'), th = q('.thumb');
    if (e && th && a && isFinite(a.duration) && a.duration > 0) {
      const p = Math.min(1, a.currentTime / a.duration) * 100;
      e.style.width = p + '%'; th.style.left = p + '%';
    }
    drawPreview();
  }

  /* Low frequencies carry nearly all the energy in speech and music, so a
     linear map would leave the right half of the strip dead. */
  /* Bars are frequency BANDS, not single bins.
     The old mapping read one bin per bar, spread over a fixed fraction of the
     spectrum with a power curve. Two things went wrong with that. The fraction
     is a fraction of the Nyquist rate, so the strip showed a different range of
     frequencies depending on the device's sample rate, and the mapping put the
     whole right half of the strip above 5kHz, where recorded music and speech
     carry almost no energy. Measured on an episode, the left third averaged
     15.5px of a 16px cap, pinned at the ceiling and therefore not moving, while
     the right third sat at 9.8px.
     Log spacing over a range in HERTZ fixes both: every bar gets a band of real
     content, the same bands on every device. Each band takes the loudest bin it
     covers rather than an average, which keeps a bar lively when its band is
     wide, and a tilt lifts the higher bands, which are genuinely quieter in
     almost all material. */
  const F_MIN = 40, F_MAX = 11000;
  function bands(n) {
    if (w.bands && w.bands.length === n) return w.bands;
    const bins = w.freq.length;
    const binHz = (w.ctx.sampleRate / 2) / bins;
    const top = Math.min(F_MAX, (w.ctx.sampleRate / 2) * .95);
    const out = [];
    for (let i = 0; i < n; i++) {
      const f0 = F_MIN * Math.pow(top / F_MIN, i / n);
      const f1 = F_MIN * Math.pow(top / F_MIN, (i + 1) / n);
      const lo = Math.min(bins - 1, Math.floor(f0 / binHz));
      const hi = Math.max(lo + 1, Math.min(bins, Math.ceil(f1 / binHz)));
      /* Rising gain. The spectrum of most material falls with frequency, so a
         flat gain draws a ramp sloping down to the right however loud the
         track. Tuned against the measured profile rather than picked. */
      out.push([lo, hi, .62 + 1.05 * Math.pow(i / (n - 1), .85)]);
    }
    w.bands = out;
    return out;
  }
  function loop() {
    w.raf = requestAnimationFrame(loop);
    if (!w.analyser) return;
    w.analyser.getByteFrequencyData(w.freq);
    const n = w.bars.length, bs = bands(n);
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      let peak = 0;
      for (let k = b[0]; k < b[1]; k++) if (w.freq[k] > peak) peak = w.freq[k];
      w.smooth[i] = w.smooth[i] * .55 + (peak / 255) * b[2] * .45;
      const h = wave.floor + w.smooth[i] * (wave.max - wave.floor) * .80;
      w.bars[i].style.height = Math.max(wave.floor, Math.min(wave.max, h)).toFixed(1) + 'px';
    }
  }
  function settle() {
    let k = 0;
    const step = () => {
      k += .12;
      w.bars.forEach((b, i) => {
        const cur = parseFloat(b.style.height) || 3;
        b.style.height = (cur + (idleAt(i) - cur) * Math.min(1, k)).toFixed(1) + 'px';
      });
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  /* Loading new content means a fresh media element: createMediaElementSource
     can only ever be called once per element, so reuse would silently mute it. */
  w.load = (data) => {
    cancelAnimationFrame(w.raf);
    clearInterval(w.npTimer);
    if (w.ro) { w.ro.disconnect(); w.ro = null; }
    if (w.hls) { w.hls.destroy(); w.hls = null; }
    if (w.audio) { w.audio.pause(); w.audio.removeAttribute('src'); w.audio.load(); }
    w.audio = null; w.analyser = null; w.src = null; w.playing = false; w.speed = 1;
    /* New content is a new pristine card, so the controls hide again. */
    w.started = false;
    /* New content means nobody has asked for audio yet, and a pending ring
       timer from the previous item must not land on the new one. */
    w.want = false; clearTimeout(w.bufTimer); w.bufTimer = null; w.buffering = false;
    /* A pending timer must not land on the new content, but a dismissal is
       not undone by loading something else either. */
    clearVeil();
    w.data = data; status(''); render(); startNowPlaying(); prefetchDuration();
  };
  return w;
}

/* ---------------------------------------------------------------------------
   Search
   ------------------------------------------------------------------------ */
/* What each search box searches, how it labels a result and what it loads.

   This was an isPodcast boolean, which was honest while there were two kinds
   and became a lie at five. The strip() on the podcast description is why the
   table carries a `sub` per kind rather than one branch: the API returns HTML
   there and plain text everywhere else.

   `episode` searches PODCASTS, because you pick a show and the card plays its
   most recent episode; there is no useful search for a single episode across
   the catalogue and the show is the thing a person has a name for.

   `playlist` is the one addressed by two ids, so its picker carries the owner
   through on the button as well. */
const SEARCH = {
  podcast: {
    find: searchPodcasts,
    sub: (r) => (r.description || '').replace(/<[^>]*>/g, ''),
    load: (b) => loadPodcast(b.dataset.id)
  },
  episode: {
    find: searchPodcasts,
    sub: (r) => (r.description || '').replace(/<[^>]*>/g, ''),
    load: (b) => loadEpisode(b.dataset.id)
  },
  live: {
    find: searchStations,
    sub: (r) => [r.callLetters, r.description].filter(Boolean).join(' \u2022 '),
    art: (r) => `https://i.iheart.com/v3/re/assets/images/${r.id}.png`,
    load: (b) => loadStation(b.dataset.id)
  },
  artist: {
    find: searchArtists,
    sub: () => 'Artist radio',
    art: (r) => r.image || '',
    load: (b) => loadArtist(b.dataset.id)
  },
  playlist: {
    find: searchPlaylists,
    sub: (r) => r.description || r.author || '',
    extra: (r) => ` data-owner="${esc(r.userId)}"`,
    load: (b) => loadPlaylist(b.dataset.owner, b.dataset.id)
  }
};

function wireSearch(box, widget) {
  const input = box.querySelector('input'), list = box.querySelector('.results');
  /* The box names the card it belongs to, like "podcast-c"; the kind is the
     part before the design suffix. */
  const kind = box.dataset.for.split('-')[0];
  const cfg = SEARCH[kind];
  if (!cfg) return;
  let timer, seq = 0;

  const close = () => { list.hidden = true; list.innerHTML = ''; };
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      list.hidden = false;
      list.innerHTML = '<div class="empty">Searching</div>';
      try {
        const rows = await cfg.find(q);
        if (mine !== seq) return;                       /* a newer query won */
        if (!rows.length) { list.innerHTML = '<div class="empty">Nothing found.</div>'; return; }
        list.innerHTML = rows.map((r) => {
          const title = r.title || r.name;
          const sub = (cfg.sub(r) || '').slice(0, 70);
          const art = cfg.art ? cfg.art(r) : '';
          return `<button data-id="${esc(r.id)}"${cfg.extra ? cfg.extra(r) : ''}>` +
                 `<img src="${esc(art)}" alt="" onerror="this.style.visibility='hidden'">` +
                 `<span style="min-width:0"><b>${esc(title)}</b><span>${esc(sub)}</span></span></button>`;
        }).join('');
        list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
          close(); input.blur();
          /* A choice belongs to the CONTENT TYPE, not to the box it was made
             in. Comparing two designs on two different podcasts compares
             nothing, so picking a show in either column loads it into every
             card of that kind, and the boxes are all set to what was chosen so
             it is obvious that they moved together. */
          const peers = (WIDGETS[kind] && WIDGETS[kind].length) ? WIDGETS[kind]
            : (widget ? [{ widget, statusId: 's-' + box.dataset.for }] : []);
          const says = (msg, err) => peers.forEach((t) => {
            const el = document.getElementById(t.statusId);
            if (el) { el.textContent = msg; el.className = err ? 'status err' : 'status'; }
          });
          says('Loading');
          try {
            const data = await cfg.load(b);
            /* Artist radio and playlist have no audio here on purpose, so only
               the kinds that are supposed to play are checked for it. */
            if (!data.audio && !caps(data).stopNext) throw new Error('no playable stream for this one');
            /* A copy each, because a widget writes its own playback state onto
               the object it is handed. The same reason the initial load does. */
            peers.forEach((t) => t.widget.load(Object.assign({}, data)));
            const chosen = data.title || input.value;
            document.querySelectorAll('.search').forEach((other) => {
              if (other.dataset.for.split('-')[0] === kind) other.querySelector('input').value = chosen;
            });
            /* The shipping player follows the last thing chosen of its kind, so
               the comparison stays like for like after a search. */
            showEmbed(kind, data);
          } catch (err) {
            says('Could not load that. ' + err.message, true);
          }
        }));
      } catch (e) {
        if (mine === seq) list.innerHTML = '<div class="empty">Search failed. ' + esc(e.message) + '</div>';
      }
    }, 280);
  });
}

/* ---------------------------------------------------------------------------
   Boot with the two shows from the Figma frames
   ------------------------------------------------------------------------ */
/* Two pages share this file. The prototype page carries all six cards, the
   single card page that goes inside an embed slot carries exactly one, so the
   roster is declared here and only the roots that are actually on the page get
   built. Everything downstream reads the built list rather than six names. */
const WIDGET_ROSTER = [
  { key: 'a-podcast', root: 'w-podcast',      variant: undefined, kind: 'podcast' },
  { key: 'a-live',    root: 'w-live',         variant: undefined, kind: 'live' },
  { key: 'b-podcast', root: 'w-podcast-hero', variant: 'hero',    kind: 'podcast' },
  { key: 'b-live',    root: 'w-live-hero',    variant: 'hero',    kind: 'live' },
  { key: 'c-podcast', root: 'w-podcast-c',    variant: 'c',       kind: 'podcast' },
  { key: 'c-live',    root: 'w-live-c',       variant: 'c',       kind: 'live' },
  /* The three Design D content types. Same design C card, different transport
     and different metadata, so they take the same variant and differ only in
     what is loaded into them. */
  { key: 'c-episode',  root: 'w-episode-c',  variant: 'c', kind: 'episode' },
  { key: 'c-artist',   root: 'w-artist-c',   variant: 'c', kind: 'artist' },
  { key: 'c-playlist', root: 'w-playlist-c', variant: 'c', kind: 'playlist' }
];
const WIDGETS = { podcast: [], live: [], episode: [], artist: [], playlist: [] };
/* Keyed by the root id with its w- prefix dropped, which is also what a search
   box names in data-for, so the search wiring reads straight off this. */
const BY_SEARCH = {};
WIDGET_ROSTER.forEach((w) => {
  if (!document.getElementById(w.root)) return;
  const id = w.root.replace(/^w-/, '');
  const widget = makeWidget(w.root, 's-' + id, 'c-' + id, w.variant);
  BY_SEARCH[id] = widget;
  WIDGETS[w.kind].push({ widget, statusId: 's-' + id });
});
document.querySelectorAll('.search').forEach((b) => wireSearch(b, BY_SEARCH[b.dataset.for]));

/* ---------------------------------------------------------------------------
   Width readout. ResizeObserver on the shell rather than a window resize
   listener, because the shell is the container query's container and it also
   changes when the page gutters or the 1320 max-width kick in, which a window
   listener alone would report a frame late.
   ------------------------------------------------------------------------ */
const WIDE_AT = 560;
function gauge(shell, out) {
  const w = Math.round(shell.getBoundingClientRect().width);
  /* The hero card has one layout at every width, so its readout reports the
     width and stops there rather than naming a breakpoint it does not have. */
  if (shell.hasAttribute('data-nobreak')) {
    out.classList.remove('wide');
    out.innerHTML = 'widget <b>' + w + '</b> px &middot; one layout at every width';
    return;
  }
  const wide = w >= WIDE_AT;
  out.classList.toggle('wide', wide);
  out.innerHTML = 'widget <b>' + w + '</b> px &middot; <span class="mode">' +
    (wide ? 'wide' : 'compact') + '</span> &middot; ' +
    (wide ? 'compact below ' : 'wide at ') + WIDE_AT;
}
/* The prototype page no longer carries a .gauge, so this wires nothing and
   observes nothing: the guard below exits before the ResizeObserver is made.
   Left in place rather than deleted, the same as authToast(), so putting the
   readout back is a markup change and nothing else. */
document.querySelectorAll('section').forEach((sec) => {
  const shell = sec.querySelector('.shell'), out = sec.querySelector('.gauge');
  if (!shell || !out) return;
  new ResizeObserver(() => gauge(shell, out)).observe(shell);
  gauge(shell, out);
});
/* Production ties the now-playing poll to page visibility, and so does this:
   a backgrounded tab has nobody to show a track change to, and resuming asks
   once immediately so the line is current the moment the tab is looked at. */
document.addEventListener('visibilitychange', () =>
  INSTANCES.forEach((w) => { if (document.hidden) clearInterval(w.npTimer); else if (w.startNowPlaying) w.startNowPlaying(); }));

/* The width slider.
   It caps every player through one custom property rather than resizing the
   window, so the four prototypes and the shipping embeds all answer the same
   width and the comparison stays honest. The maximum is whatever the page can
   actually give, re-read on resize, and the slider sitting at its maximum means
   no cap at all rather than a cap that happens to match. */
const widthRange = document.getElementById('widthRange');
const widthNum = document.getElementById('widthNum');
const widthOut = document.getElementById('widthOut');
const widthFill = document.getElementById('widthFill');
/* Absent on the single card page, where the slot sets the width. */
if (widthRange) {
/* 0, not a comfortable minimum. Watching a card collapse is a legitimate thing
   to want to see, and an embed slot really can be handed nothing. */
/* 50, not 0. Below about 50 there is no player left to look at: the bar card's
   play button is down to 30 and everything else on every design is running past
   the edges, so the slider was offering a range where the answer to every
   question is "it breaks". The floor is enforced here as well as on the inputs,
   because the number field can be typed into. */
const MIN_W = 50;

/* The room a CARD has, not the room the page has. Those were the same number
   while the designs were stacked one per row, and stopped being the same the
   moment they could sit two across: a shell in a two column grid has roughly
   half the page to work with, and measuring <main> would have told the slider
   it could go twice as wide as it can, and called it "fills" while the cards
   were clearly not filling anything.
   The shell's own parent is the grid item, so it is the honest thing to ask. */
function availableWidth() {
  const shell = document.querySelector('main .shell');
  const box = (shell && shell.parentElement) || document.querySelector('main');
  if (!box) return MIN_W;
  const cs = getComputedStyle(box);
  return Math.max(MIN_W, Math.round(
    box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
}

function applyWidth(px, atMax) {
  if (atMax) document.documentElement.style.removeProperty('--player-w');
  else document.documentElement.style.setProperty('--player-w', px + 'px');
  widthRange.value = String(px);
  /* Leave a field alone while it is being typed in, or the caret jumps. */
  if (document.activeElement !== widthNum) widthNum.value = String(px);
  /* The readout is optional; the page dropped it. */
  if (widthOut) widthOut.textContent = atMax ? 'fills' : '';
}

function syncWidthControl(keepAtMax) {
  const max = availableWidth();
  const wasMax = keepAtMax === undefined ? Number(widthRange.value) >= Number(widthRange.max) : keepAtMax;
  widthRange.max = String(max);
  widthNum.max = String(max);
  if (wasMax || !widthRange.value) widthRange.value = String(max);
  const v = Math.min(Number(widthRange.value), max);
  applyWidth(v, v >= max);
}

widthRange.addEventListener('input', () => {
  const v = Number(widthRange.value);
  applyWidth(v, v >= Number(widthRange.max));
});

/* Typing a width. Applied as it is typed when the value is already sensible,
   and clamped to what the page can give on blur or Enter, so a half typed "3"
   does not slam every player to the minimum mid-keystroke. */
const clampWidth = () => {
  const max = Number(widthRange.max);
  const raw = Number(widthNum.value);
  /* `raw || max` would be wrong here, and was: 0 is falsy, so typing the very
     value the minimum now allows snapped the players back to full width. An
     empty field is the only case that should fall back. */
  const wanted = widthNum.value.trim() === '' || !Number.isFinite(raw) ? max : raw;
  const v = Math.min(max, Math.max(MIN_W, Math.round(wanted)));
  widthNum.value = String(v);
  applyWidth(v, v >= max);
};
widthNum.addEventListener('input', () => {
  if (widthNum.value.trim() === '') return;        /* mid-edit, leave it alone */
  const max = Number(widthRange.max), raw = Number(widthNum.value);
  if (Number.isFinite(raw) && raw >= MIN_W && raw <= max) applyWidth(raw, raw >= max);
});
widthNum.addEventListener('change', clampWidth);
widthNum.addEventListener('blur', clampWidth);
widthNum.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clampWidth(); widthNum.blur(); } });
widthFill.addEventListener('click', () => syncWidthControl(true));
addEventListener('resize', () => syncWidthControl());
syncWidthControl(true);
}

const vw = document.getElementById('vw');
if (vw) {
  const showVw = () => { vw.textContent = Math.round(window.innerWidth); };
  addEventListener('resize', showVw); showVw();
}

/* The shipping player, pointed at whatever the prototypes are showing.
   The slug in an iHeart embed URL is cosmetic and the trailing numeric id is
   what resolves the content, checked rather than assumed: a URL with the slug
   replaced by a single x returns the right episode and the right station. The
   real show slug is used where the API gives one anyway. */
/* Where each piece of the metadata points, built from the same ids the embeds
   use so a link lands on the content rather than on a search result. The slug
   is cosmetic here as it is everywhere else on iheart.com.
   Each line goes to the page it names: the episode line to the episode, the
   show line to the show. The artwork is the show's, so it goes to the show,
   which is where a podcast tile leads on iheart.com itself. Live radio has one
   destination, so every part of it points at the station. */
/* The same slug rules as packages/utilities slugify in iheartradio/web: fold
   accents, drop apostrophes, lowercase, strip anything that is not a word
   character, space or hyphen, then kebab-case. iHeart canonicalises the slug on
   arrival anyway, checked with a single x in its place, but a link that reads
   correctly before the redirect is worth the twelve lines. */
const slugify = (v) => String(v || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/'/g, '').toLowerCase()
  .replace(/[^\s\w-]/g, '').trim()
  .replace(/[\s_]+/g, '-').replace(/-+/g, '-');
/* Null rather than a broken link when the feed carries no id, which is what
   the production slug builder does for the same reason. */
const artistUrl = (d) => d.artistId ? `https://www.iheart.com/artist/${slugify(d.artist)}-${d.artistId}/` : null;
const trackUrl = (d) => (d.artistId && d.trackId) ? `${artistUrl(d)}songs/${slugify(d.track)}-${d.trackId}/` : null;

const showUrl = (d) => `https://www.iheart.com/podcast/${d.showSlug}-${d.showId}/`;
const episodeUrl = (d) => `${showUrl(d)}episode/episode-${d.episodeId}/`;
const stationUrl = (d) => `https://www.iheart.com/live/station-${d.stationId}/`;
/* The artwork's destination, and the fallback for anything unlabelled. */
/* The page this CARD is for, used by the tile and by the idle metadata lines.
   Not the same as listenUrl for an episode: the tile there wears the show's
   cover, so it opens the show, while "Listen on iHeart" opens the episode.

   Artist and playlist had no branch and fell through to showUrl, which builds
   from showSlug and showId. Neither exists on those records, so the tile and the
   idle lines pointed at /podcast/undefined-undefined/. They take listenUrl,
   which already knows both: the artist's own slug, and the playlist's canonical
   url straight from the API. */
function contentUrl(d) {
  if (!d) return null;
  switch (d.kind) {
    case 'live': return stationUrl(d);
    case 'artist': case 'playlist': return listenUrl(d);
    default: return showUrl(d);
  }
}
/* A metadata line that is also a link. The anchor sits inside the paragraph so
   the clickable area is the text rather than the whole line box, and so the
   paragraph keeps the clipping and the marquee. */
/* `raw` skips the marquee wrapper. A line normally carries exactly one .mqi,
   which is what markOverflow measures and animates, but live radio's playing
   line holds two links with a bullet between them, so the wrapper belongs
   around the whole line and not around each half. Nesting one inside another
   gave markOverflow two candidates per line and it measured the wrong one. */
const maybeLink = (href, text, aria, raw) =>
  href ? lineLink(href, text, aria, raw) : (raw ? esc(text) : mqs(text));
const lineLink = (href, text, aria, raw) =>
  `<a class="line-link" href="${esc(href)}" target="_blank" rel="noopener"` +
  (aria ? ` aria-label="${esc(aria)}"` : '') + `>${raw ? esc(text) : mqs(text)}</a>`;

/* The SHOW, not the episode. Both are valid embeds and they render differently:
   the episode URL is a player and nothing else, while the show URL is a player
   with the episode list underneath it, which is the thing the prototypes have
   and the thing worth comparing them against. Checked by loading both directly:
   the show embed draws the transport, then "The Show Must Go OFF", "Yumming My
   Yuck", "Class FTM License" and on down. */
/* The six routes the shipping widget serves are declared in the monorepo at
   apps-legacy/www/src/widget/routes.ts: playlist, live, podcast, podcast
   episode, artist and favorites. Five of them are embeddable without a signed
   in user; favorites is the one that is not, so it is not here.

   Slugs are cosmetic. The trailing numeric id resolves the content and a wrong
   slug silently returns something else, so every one of these is built from an
   id and given a throwaway slug rather than a real one that could drift.
   Confirmed against the public oEmbed endpoint, which answered for all five. */
const embedUrl = {
  podcast: (d) => `https://www.iheart.com/podcast/${d.showSlug}-${d.showId}/?embed=true`,
  /* Follows the podcast search rather than being pinned to one episode, because
     the show data is already loaded here and carries the episode ids. Searching
     a different podcast moves the show frame and this one together. */
  episode: (d) => `https://www.iheart.com/podcast/podcast-${d.showId}/episode/episode-${d.currentEpisodeId}/?embed=true`,
  live: (d) => `https://www.iheart.com/live/station-${d.stationId}/?embed=true`,
  artist: (d) => `https://www.iheart.com/artist/${d.slug}/?embed=true`,
  playlist: (d) => (d.webUrl || '').replace(/\/?$/, '/') + '?embed=true'
};

/* Artist radio and playlist have no search box on this page and nothing loads
   them, so they are fixed reference examples. Both ids were resolved from
   us.api.iheart.com rather than read off a URL. */
const FIXED_EMBEDS = {
  'e-artist': 'https://www.iheart.com/artist/artist-33221/?embed=true',
  'e-playlist': 'https://www.iheart.com/playlist/clean-top-hits-312064750-E63iPqfbGw4EzKMSgzoWF4?embed=true'
};

/* Nothing is fetched for a source the page is not showing, so the single card
   page makes one API call rather than two. */
const setIfPresent = (id, apply) => { const el = document.getElementById(id); if (el) apply(el); };

/* Applied here rather than beside FIXED_EMBEDS itself, because setIfPresent is
   a const declared below that point and reaching it early is a dead zone throw
   rather than a hoisted function call. */
Object.entries(FIXED_EMBEDS).forEach(([id, src]) =>
  setIfPresent(id, (el) => { el.src = src; }));

/* Point a shipping embed at some content, and SAY what it is pointing at.
   It has always followed the search; there was simply no way to tell from
   looking, because the frame is a cross origin iframe that redraws to a similar
   looking player and the section had no label beyond "Podcast". */
function showEmbed(kind, d) {
  setIfPresent('e-' + kind, (el) => { el.src = embedUrl[kind](d); });
  /* The episode frame rides on the podcast fetch. It is a separate section with
     its own heading, not a second view of the show frame, so it is set here
     rather than given a kind of its own in WIDGETS. */
  if (kind === 'podcast') {
    setIfPresent('e-episode', (el) => { el.src = embedUrl.episode(d); });
    setIfPresent('n-episode', (el) => { el.textContent = d.title || ''; });
  }
  setIfPresent('n-' + kind, (el) => {
    el.textContent = kind === 'live'
      ? (d.title || '')
      : [d.subtitle, d.title].filter(Boolean).join(' \u2022 ');
  });
}
/* Every card on the page, redrawn. Exposed for the prototype's switches. */
function repaintAll() {
  Object.keys(WIDGETS).forEach((k) =>
    WIDGETS[k].forEach((w) => { if (w.widget.repaint) w.widget.repaint(); }));
}

const failAll = (kind, e) => WIDGETS[kind].forEach((w) =>
  setIfPresent(w.statusId, (el) => { el.textContent = 'Could not reach the iHeart API. ' + e.message; }));

(async () => {
  /* One fetch per source, shared by every card showing it, so the designs are
     compared on the same content rather than on whatever each happened to get. */
  if (WIDGETS.podcast.length || document.getElementById('e-podcast')) {
    try {
      const pod = await loadPodcast(31090140);           /* Las Culturistas */
      /* A copy each, because a widget writes its own playback state onto the
         object it is handed. */
      WIDGETS.podcast.forEach((w) => w.widget.load(Object.assign({}, pod)));
      showEmbed('podcast', pod);
    } catch (e) { failAll('podcast', e); }
  }
  if (WIDGETS.live.length || document.getElementById('e-live')) {
    try {
      const live = await loadStation(1469);              /* Z100 New York */
      WIDGETS.live.forEach((w) => w.widget.load(Object.assign({}, live)));
      showEmbed('live', live);
    } catch (e) { failAll('live', e); }
  }
  /* The three added content types. Each is independent, so one failing leaves
     the others alone rather than taking the page's remaining cards with it. */
  const extra = [
    ['episode',  () => loadEpisode(31090140)],                            /* Las Culturistas */
    ['artist',   () => loadArtist(33221)],                                /* Taylor Swift Radio */
    ['playlist', () => loadPlaylist('312064750', 'E63iPqfbGw4EzKMSgzoWF4')]  /* Clean Top Hits */
  ];
  await Promise.all(extra.map(async ([kind, get]) => {
    if (!WIDGETS[kind].length) return;
    try {
      const d = await get();
      WIDGETS[kind].forEach((w) => w.widget.load(Object.assign({}, d)));
    } catch (e) { failAll(kind, e); }
  }));
})();
