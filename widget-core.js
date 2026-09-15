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

/* The episode LIST omits mediaUrl; the single-episode endpoint includes it.
   That one detail is the difference between a searchable widget and a
   decorative one. */
async function loadPodcast(id) {
  const [show, eps] = await Promise.all([
    jget(`${API}/v3/podcast/podcasts/${id}`),
    jget(`${API}/v3/podcast/podcasts/${id}/episodes?limit=8`).then((d) => d.data || [])
  ]);
  if (!eps.length) throw new Error('no episodes');
  const first = await jget(`${API}/v3/podcast/episodes/${eps[0].id}`).then((d) => d.episode);
  return {
    kind: 'podcast',
    /* Carried so the production embed above the prototypes can be pointed at
       the same episode rather than a hard coded one that goes stale. */
    showId: id, episodeId: eps[0].id, showSlug: show.slug || 'podcast',
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
          artistId: d.artistId || null, trackId: d.trackId || null }
      : null;
  } catch (e) { return null; }
}
const NO_META = new Set();

async function loadStation(id) {
  const [d, np] = await Promise.all([
    jget(`${API}/v2/content/liveStations/${id}`),
    nowPlaying(id)
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
    artistId: (np && np.artistId) || null,
    trackId: (np && np.trackId) || null,
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
function liveMeta(d) {
  const L = heroLines(d);
  const link = (t) => lineLink(stationUrl(d), t);
  return L.station
    ? `<p class="h-station mq">${link(L.station)}</p>
       <p class="h-name mq">${maybeLink(artistUrl(d), L.sub, 'Open this artist on iHeart')}</p>
       <p class="h-track mq">${maybeLink(trackUrl(d), L.name, 'Open this song on iHeart')}</p>`
    : `<p class="h-name mq">${link(L.name)}</p>
       <p class="h-sub mq">${link(L.sub)}</p>`;
}

function heroLines(d) {
  if (d.kind !== 'live') return { name: d.subtitle, sub: d.title, station: null };
  if (d.track && d.artist) return { name: d.track, sub: d.artist, station: d.subtitle };
  return { name: d.title, sub: d.desc || d.subtitle, station: null };
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
  function rowMarkup(d, r) {
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
  function listMarkup(d) {
    return `
        <div class="list">
          <h3>${esc(d.listTitle)}</h3>
          <div class="rows">
            ${d.rows.map((r) => `
${rowMarkup(d, r)}`).join('')}
          </div>
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
            <a class="ihr-link" href="https://www.iheart.com/" target="_blank" rel="noopener"
               aria-label="Open iHeart"><img class="ihr" src="assets/ihr-logo.svg" alt="iHeart"></a>
          </div>
          <div class="hero-controls">
            ${isLive ? `
              <span class="h-btn spacer" aria-hidden="true"><span class="h-speed">1x</span></span>
              <button class="h-btn" data-act="save" aria-pressed="false" aria-label="Save"><img src="assets/h-plus.svg" alt=""></button>
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
            ${isLive ? `
              <button class="h-btn" data-act="info" aria-label="Info"><img src="assets/h-info.svg" alt=""></button>` : ''}
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
  function cMarkup(d, isLive) {
    return `
      <div class="widget hero c${isLive ? ' live' : ''}">
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
            <a class="ihr-link" href="https://www.iheart.com/" target="_blank" rel="noopener"
               aria-label="Open iHeart"><img class="ihr" src="assets/ihr-logo.svg" alt="iHeart"></a>
          </div>
          <div class="hero-controls">
            <span class="cc-side">
              ${isLive ? '' : `
                <button class="h-btn" data-act="back" aria-label="Back 15 Seconds"><img src="assets/back15.svg" alt=""></button>
              `}
            </span>
            <button class="hero-play" data-act="play" aria-label="Play">
              <img class="pi" src="${GLYPH.play}" alt="">
              <svg class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"></circle></svg>
            </button>
            <span class="cc-side">
              ${isLive ? '' : `
                <button class="h-btn" data-act="fwd" aria-label="Forward 30 Seconds"><img src="assets/fwd30.svg" alt=""></button>`}
            </span>
          </div>
          ${isLive ? `
            <div class="hero-bottom">
              <div class="list-row">
                ${cActions(false)}
              </div>
              <div class="wave"></div>
            </div>` : `
            <div class="hero-bottom">
              <div class="c-rows">
                <div class="list-row">
                  ${cActions(true)}
                </div>
                <div class="slider">
                  <span class="t el">00:00</span>
                  <div class="track">
                    <div class="elapsed" style="width:0"></div><div class="preview" style="left:0;width:0"></div><div class="thumb" style="left:0"></div>
                  </div>
                  <span class="t dur">--:--</span>
                </div>
              </div>
              <div class="wave"></div>
            </div>`}
          ${isLive ? '' : sheetMarkup(d)}
        </div>
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
        <div class="sheet-body">
          <div class="rows">
            ${d.rows.map((r) => `
${rowMarkup(d, r)}`).join('')}
          </div>
        </div>
       </div>
      </div>`;
  }

  function render() {
    const d = w.data; if (!d) return;
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
            <a class="ihr-link" href="https://www.iheart.com/" target="_blank" rel="noopener"
               aria-label="Open iHeart"><img class="ihr" src="assets/ihr-logo.svg" alt="iHeart"></a>
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
                    <button class="icon-btn" data-act="save" aria-pressed="false" aria-label="Save">${icon('plus')}</button>
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
    setBuffering(w.buffering);
    setPlayingClass();
    if (w.ro) w.ro.disconnect();
    w.ro = new ResizeObserver(() => { buildBars(); markOverflow(root); });
    w.ro.observe(root);

    const art = q('.art');
    const paint = () => {
      /* The hero reads the whole picture, since the whole picture is the
         backdrop. The bar widget reads a dominant swatch, since that swatch is
         what it paints behind the text. */
      const rgb = variant !== 'bar' ? meanColour(art) : dominantColour(art);
      if (!rgb) { colourEl.innerHTML = '<span>artwork colour could not be read</span>'; return; }
      root.style.setProperty('--dominant', hex(rgb));
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
        colourEl.innerHTML =
          `<span class="chip" style="background:${hex(rgb)}"></span>` +
          `<span class="chip" style="background:${hex(bg)}"></span>` +
          `<span>${hex(rgb)} with ${Math.round(pct * 100)}% black → ${hex(bg)}</span>` +
          `<span class="ratio">${r.toFixed(2)} to 1</span>` +
          `<span class="wcag ${aa ? 'pass' : 'fail'}">AA ${aa ? 'pass' : 'fail'}</span>` +
          `<span class="wcag ${aaa ? 'pass' : 'warn'}">AAA ${aaa ? 'pass' : 'no'}</span>` +
          (need ? `<span class="meta-note">AA floor for this artwork is ${need}% overlay</span>` : '');
        return;
      }
      const floor = scrimFloor(pct);
      const m = worstBehindText(pct);
      const judged = m ? m.worst : floor;
      const aa = judged >= 4.5, aaa = judged >= 7;
      colourEl.innerHTML =
        `<span class="chip" style="background:${hex(bg)}"></span>` +
        (m
          ? `<span>worst pixel behind the text</span><span class="ratio">${m.worst.toFixed(2)} to 1</span>`
          : `<span>artwork could not be sampled, judged on the floor alone</span>`) +
        `<span class="wcag ${aa ? 'pass' : 'fail'}">AA ${aa ? 'pass' : 'fail'}</span>` +
        `<span class="wcag ${aaa ? 'pass' : 'warn'}">AAA ${aaa ? 'pass' : 'no'}</span>` +
        `<span class="meta-note">${Math.round(pct * 100)}% black guarantees ${floor.toFixed(2)} to 1 on ANY artwork, ` +
        `since the worst a picture can be is pure white` +
        (m && m.belowAA ? `. ${(m.belowAA * 100).toFixed(1)}% of this one is below AA` : '') + `</span>`;
    };
    if (art.complete && art.naturalWidth) paint(); else { art.onload = paint; art.onerror = () => colourEl.textContent = ''; }

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
        const code = e.target.closest('.share-copy');
        if (code) {
          if (navigator.clipboard) navigator.clipboard.writeText(code.dataset.code || '');
          flash(code.querySelector('.lbl'));
          return;
        }
        const link = e.target.closest('[data-share="copy"]');
        if (link) {
          if (navigator.clipboard) navigator.clipboard.writeText(sheetEl.dataset.url || '');
          flash(link.querySelector('.lbl'));
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
        card.classList.toggle('sheet-open', opening);
        sheet.setAttribute('aria-hidden', String(!opening));
        const opener = root.querySelector('[data-act="list"].h-btn');
        if (opener) {
          opener.setAttribute('aria-pressed', String(opening));
          opener.setAttribute('aria-label', opening ? 'Hide Episodes' : 'Show Episodes');
        }
        /* Focus follows the sheet, since it covers the controls underneath and
           a keyboard would otherwise be tabbing through a hidden player. */
        const target = opening ? sheet.querySelector('.sheet-close') : opener;
        if (target) target.focus({ preventScroll: true });
      }
    }
    /* Info opens the drawer on designs A and B. Design C has no info frame of
       its own and already uses a drawer for its episodes, so it keeps the
       status line rather than stacking one drawer on another. */
    if (kind === 'info') toggleInfo();
    if (kind === 'more') rowMenu(btn);
    if (kind === 'share') shareDialog();
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
    card.classList.toggle('info-open', opening);
    sheet.setAttribute('aria-hidden', String(!opening));
    const opener = root.querySelector('[data-act="info"]:not(.sheet-close)');
    if (opener) opener.setAttribute('aria-pressed', String(opening));
    const target = opening ? sheet.querySelector('.sheet-close') : opener;
    if (target) target.focus({ preventScroll: true });
  }

  /* The episode row overflow, frames 2609:36099 and 2609:37074. Two items, and
     they are where the player's plus and info went rather than new behaviour:
     Follow Podcast raises the same auth CTA the plus button did, and View
     Episode Info opens the same drawer the info button did. The difference is
     that the drawer now describes the row you asked from, not whatever is
     loaded, which is the whole reason the action reads better here. */
  function rowMenu(btn) {
    const d = w.data;
    const r = d && (d.rows || []).find((x) => String(x.id) === String(btn.dataset.ep));
    openMenu(btn, {
      label: 'Episode options',
      className: 'row-menu',
      alignRight: true,
      items: [
        { value: 'follow', label: 'Follow Podcast' },
        { value: 'epinfo', label: 'View Episode Info' }
      ],
      onPick: (value) => {
        if (value === 'follow') { authToast(); return; }
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
      /* The card keeps the SHOW's artwork, which is what the frames draw. Only
         the rows carry per episode images. */
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

     Five seconds after listening stops, the card covers itself with the
     iHeart prompt. The delay is the whole point of the thing: pausing is
     usually a two second interruption, someone taking a call or talking to
     the person next to them, and a prompt that lands on the same frame as
     the pause punishes a listener who is coming straight back. Waiting five
     seconds means the prompt only meets people who actually stopped.

     Only a pause the listener asked for arms it. setPlaying(false) is also
     how a card is stopped when another one starts, and how the episode
     switcher clears the old track, and a prompt raised by either of those
     would be covering a card the listener never touched.

     And it shows ONCE. Closing it is an answer, so playing again does not
     make the card eligible again, and neither does loading different content
     into it. Asking a second time after someone has already said no is the
     same nagging the five second delay exists to avoid.
     --------------------------------------------------------------------- */
  const VEIL_DELAY = 5000;

  function clearVeil() { clearTimeout(w.veilTimer); w.veilTimer = null; }

  function showVeil(on) {
    const card = root.querySelector('.widget');
    const veil = root.querySelector('.pause-veil');
    if (!card || !veil) return;
    card.classList.toggle('veil-open', on);
    veil.setAttribute('aria-hidden', on ? 'false' : 'true');
    /* Focus is deliberately not moved here. This opens on a timer rather than
       on a keypress, and pulling focus five seconds after someone pressed
       pause would take it from wherever they had moved on to. The close
       button is reachable the moment they Tab, because the trap pulls focus
       in on the first Tab while the veil is up. */
  }

  function armVeil() {
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

  async function setPlaying(on, byUser) {
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
        status(w.data.kind === 'live' ? 'Live now.' : 'Playing.');
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
    const has = !!(w.data.track && w.data.artist);
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
      /* With a track the three lines are track, artist, station; the classes
         carry the weights, so the writer only has to keep the order. */
      const L = heroLines(w.data);
      const st = q('.h-station .mqi'), n = q('.h-name .mqi'), tr = q('.h-track .mqi');
      if (st) st.textContent = L.station;
      if (n) n.textContent = L.sub;
      if (tr) tr.textContent = L.name;
      retarget('.h-name', artistUrl(w.data));
      retarget('.h-track', trackUrl(w.data));
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
  const cActions = (isPodcast) =>
    /* The left group is empty on both now and still emitted, because
       space-between with a single child pushes that child to the start. */
    '<span class="lr-side"></span>' +
    '<span class="lr-side">' +
      (isPodcast ?
        '<button class="h-btn" data-act="speed" aria-haspopup="menu" aria-expanded="false" aria-label="Change Playback Speed">' +
          '<span class="h-speed">1x</span></button>' +
        '<button class="h-btn" data-act="list" aria-pressed="false" aria-label="Show Episodes">' +
          '<img src="assets/h-list.svg" alt=""></button>' :
        '<button class="h-btn" data-act="save" aria-pressed="false" aria-label="Save">' +
          '<img src="assets/h-plus.svg" alt=""></button>' +
        '<button class="h-btn" data-act="info" aria-label="Info">' +
          '<img src="assets/h-info.svg" alt=""></button>') +
      '<button class="h-btn" data-act="share" aria-label="Share">' +
        '<img src="assets/h-share.svg" alt=""></button>' +
    '</span>';

  /* Redrawn from the stored hover value and wherever playback now is, so the
     span always runs from the thumb to the hovered point and closes itself
     when playback catches up. */
  /* accomplice Dialog carrying the social share sheet, the same one iheart.com
     opens from this icon. Title, sections and the embed snippet all come from
     apps/listen/app/components/social-share.

     The three targets are drawn with neutral glyphs rather than the platforms'
     own marks. Those are trademarks and this is a public repo; the row's
     structure, sizes and labels are what the prototype is testing, and a
     circle with the platform's name under it carries both. */
  const GLYPH_COPY =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const GLYPH_OUT =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M14 4h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M20 4 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
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

  function shareMarkup(d) {
    if (!d) return '';
    const isLive = d.kind === 'live';
    const title = isLive ? 'Share Station' : 'Share Episode';
    const pageUrl = isLive ? stationUrl(d) : episodeUrl(d);
    const embedCode = '<iframe allow="autoplay" width="100%" height="200" src="' +
      (pageUrl.includes('?') ? pageUrl + '&embed=true' : pageUrl + '?embed=true') +
      '" frameborder="0"></iframe>';
    return `
      <div class="share-scrim" data-act="share" aria-hidden="true"></div>
      <div class="share-sheet${isLive ? ' share-live' : ''}" role="dialog"
           aria-label="${esc(title)}" aria-hidden="true" data-url="${esc(pageUrl)}">
       <div class="share-panel">
        <div class="share-head">
          <h2>${esc(title)}</h2>
          <button class="share-close" data-act="share" type="button" aria-label="Close">
            <img src="assets/sheet-close.svg" alt=""></button>
        </div>
        <div class="share-body">
          <div class="share-head-row">
            <img class="share-art" src="${esc(d.art || '')}" alt="">
            <div class="share-names">
              <p class="share-name">${esc(d.title || '')}</p>
              <p class="share-desc">${esc((isLive ? d.desc : d.subtitle) || '')}</p>
            </div>
          </div>
          <div class="share-section"><p>Share on</p><div class="share-targets">
            <button class="share-target" type="button" data-share="copy">
              <span class="ring">${GLYPH_COPY}</span><span class="lbl">Copy Link</span></button>
            <a class="share-target" data-share="facebook" target="_blank" rel="noopener"
               href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}">
              <span class="ring">${GLYPH_OUT}</span><span class="lbl">Facebook</span></a>
            <a class="share-target" data-share="x" target="_blank" rel="noopener"
               href="https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(d.title || '')}">
              <span class="ring">${GLYPH_OUT}</span><span class="lbl">X</span></a>
          </div></div>
          <div class="share-section" style="width:100%"><p>Embed widget</p>
            <div class="share-embed">
              <input name="embed-code" readonly disabled value="${esc(embedCode)}">
              <button class="share-copy" type="button" data-code="${esc(embedCode)}">
                ${GLYPH_COPY}<span class="lbl">Copy Code</span></button>
            </div>
          </div>
        </div>
       </div>
      </div>`;
  }

  /* Opening closes the other drawers, which cover the same space. */
  function shareDialog() {
    const card = root.querySelector('.widget');
    if (!card) return;
    const opening = !card.classList.contains('share-open');
    card.classList.remove('sheet-open');
    card.classList.toggle('share-open', opening);
    const sheet = root.querySelector('.share-sheet');
    if (sheet) sheet.setAttribute('aria-hidden', String(!opening));
    if (opening) {
      const c = root.querySelector('.share-close');
      if (c) c.focus();
    }
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

  function authToast() {
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
            '<p class="toast-copy">' + esc(AUTH_COPY) + '</p>' +
            '<button class="toast-close" type="button" aria-label="Close">' +
              '<img src="assets/sheet-close.svg" alt=""></button>' +
          '</div>' +
          '<div class="toast-actions">' +
            '<a class="toast-action" href="' + LOGIN_URL + '" target="_blank" rel="noopener">Log in</a>' +
            '<a class="toast-action" href="' + SIGNUP_URL + '" target="_blank" rel="noopener">Sign up</a>' +
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
function wireSearch(box, widget) {
  const input = box.querySelector('input'), list = box.querySelector('.results');
  const isPodcast = box.dataset.for.startsWith('podcast');
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
        const rows = isPodcast ? await searchPodcasts(q) : await searchStations(q);
        if (mine !== seq) return;                       /* a newer query won */
        if (!rows.length) { list.innerHTML = '<div class="empty">Nothing found.</div>'; return; }
        list.innerHTML = rows.map((r) => {
          const id = r.id, title = r.title || r.name;
          const sub = isPodcast ? (r.description || '').replace(/<[^>]*>/g, '').slice(0, 70)
                                : [r.callLetters, r.description].filter(Boolean).join(' • ').slice(0, 70);
          const art = isPodcast ? '' : `https://i.iheart.com/v3/re/assets/images/${id}.png`;
          return `<button data-id="${id}"><img src="${art}" alt="" onerror="this.style.visibility='hidden'">` +
                 `<span style="min-width:0"><b>${esc(title)}</b><span>${esc(sub)}</span></span></button>`;
        }).join('');
        list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
          close(); input.blur();
          /* A choice belongs to the CONTENT TYPE, not to the box it was made
             in. Comparing two designs on two different podcasts compares
             nothing, so picking a show in either column loads it into every
             card of that kind, and the boxes are all set to what was chosen so
             it is obvious that they moved together. */
          const kind = isPodcast ? 'podcast' : 'live';
          const peers = (WIDGETS[kind] && WIDGETS[kind].length)
            ? WIDGETS[kind] : [{ widget, statusId: 's-' + box.dataset.for }];
          const says = (msg, err) => peers.forEach((t) => {
            const el = document.getElementById(t.statusId);
            if (el) { el.textContent = msg; el.className = err ? 'status err' : 'status'; }
          });
          says('Loading');
          try {
            const data = isPodcast ? await loadPodcast(b.dataset.id) : await loadStation(b.dataset.id);
            if (!data.audio) throw new Error('no playable stream for this one');
            /* A copy each, because a widget writes its own playback state onto
               the object it is handed. The same reason the initial load does. */
            peers.forEach((t) => t.widget.load(Object.assign({}, data)));
            const chosen = data.title || input.value;
            document.querySelectorAll('.search').forEach((other) => {
              const sameKind = other.dataset.for.startsWith(isPodcast ? 'podcast' : 'live');
              if (sameKind) other.querySelector('input').value = chosen;
            });
            /* The shipping player at the top follows the last thing chosen of
               its kind, so the comparison stays like for like after a search. */
            const frame = document.getElementById(isPodcast ? 'e-podcast' : 'e-live');
            if (frame) frame.src = embedUrl[isPodcast ? 'podcast' : 'live'](data);
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
  { key: 'c-live',    root: 'w-live-c',       variant: 'c',       kind: 'live' }
];
const WIDGETS = { podcast: [], live: [] };
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
const MIN_W = 0;

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
function contentUrl(d) {
  if (!d) return null;
  return d.kind === 'live' ? stationUrl(d) : showUrl(d);
}
/* A metadata line that is also a link. The anchor sits inside the paragraph so
   the clickable area is the text rather than the whole line box, and so the
   paragraph keeps the clipping and the marquee. */
const maybeLink = (href, text, aria) => href ? lineLink(href, text, aria) : mqs(text);
const lineLink = (href, text, aria) =>
  `<a class="line-link" href="${esc(href)}" target="_blank" rel="noopener"` +
  (aria ? ` aria-label="${esc(aria)}"` : '') + `>${mqs(text)}</a>`;

const embedUrl = {
  podcast: (d) => `https://www.iheart.com/podcast/${d.showSlug}-${d.showId}` +
                  `/episode/episode-${d.episodeId}/?embed=true`,
  live: (d) => `https://www.iheart.com/live/station-${d.stationId}/?embed=true`
};

/* Nothing is fetched for a source the page is not showing, so the single card
   page makes one API call rather than two. */
const setIfPresent = (id, apply) => { const el = document.getElementById(id); if (el) apply(el); };
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
      setIfPresent('e-podcast', (el) => { el.src = embedUrl.podcast(pod); });
    } catch (e) { failAll('podcast', e); }
  }
  if (WIDGETS.live.length || document.getElementById('e-live')) {
    try {
      const live = await loadStation(1469);              /* Z100 New York */
      WIDGETS.live.forEach((w) => w.widget.load(Object.assign({}, live)));
      setIfPresent('e-live', (el) => { el.src = embedUrl.live(live); });
    } catch (e) { failAll('live', e); }
  }
})();
