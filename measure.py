#!/usr/bin/env python3
"""
Measure every embed player across the comparison dimensions and emit
measurements.js for analysis.html.

WHY THIS IS AN OFFLINE SCRIPT
-----------------------------
Every player is a cross-origin iframe, so a published page cannot read inside
one. Playwright can, because it drives the browser rather than living in the
page. So the numbers are measured here, once, and baked into a data file that
analysis.html renders. Re-run this to refresh them.

    python3 measure.py            # all players
    python3 measure.py spotify iheart   # just these ids

Each player is measured alone in a fresh page, so the network figures belong to
that player and nothing else. Every dimension is measured twice, under
prefers-color-scheme light and dark, which is how theme response is detected.

Anything that cannot be determined is recorded as null and rendered as "not
determined" rather than guessed at.
"""
import json, re, sys, time, pathlib

FRAME_W = 640          # a common real-world embed width
NARROW_W = 375         # phone width, for the responsive check
HOST = "http://localhost:8899/"

ROOT = pathlib.Path(__file__).parent

# ---------------------------------------------------------------- in-frame JS
# Runs inside the player's own document. Pure measurement, no mutation.
PROBE = r"""
() => {
  const px = (v) => Math.round(v * 10) / 10;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  /* Walk shadow roots too. Apple Music, Tidal and TikTok build their controls
     inside shadow DOM, so a plain querySelectorAll finds nothing. */
  const deep = (root, acc) => {
    acc = acc || [];
    root.querySelectorAll('*').forEach((el) => {
      acc.push(el);
      if (el.shadowRoot) deep(el.shadowRoot, acc);
    });
    return acc;
  };
  const all = deep(document).filter(vis);
  const body = document.body;
  const de = document.documentElement;
  const raw = body.getBoundingClientRect();
  /* Some players absolutely position everything, leaving body with zero height
     even though the player rendered. Take the largest credible box. */
  const B = {
    left: raw.left, top: raw.top,
    width:  Math.max(raw.width,  de.clientWidth,  body.scrollWidth  || 0),
    height: Math.max(raw.height, de.clientHeight, body.scrollHeight || 0)
  };

  /* ---------- play control ----------
     Score candidates rather than taking the first selector that hits. An
     earlier version excluded any class containing "player" to avoid matching
     the whole panel, which threw away exactly the right elements: Megaphone's
     control is a div classed player__controls__play-btn. */
  const blobOf = (el) => [
    el.getAttribute && el.getAttribute('aria-label'),
    el.getAttribute && el.getAttribute('title'),
    el.getAttribute && el.getAttribute('data-testid'),
    el.id,
    (el.className && el.className.toString) ? el.className.toString() : ''
  ].filter(Boolean).join(' ');

  let play = null, playVia = null, playScore = -1;
  all.forEach((el) => {
    const blob = blobOf(el);
    if (!/play|pause/i.test(blob)) return;
    if (/playlist|playback\s*rate|autoplay|player-art|artwork/i.test(blob)) return;
    const r = el.getBoundingClientRect();
    /* A play control is a compact target, not the panel that contains it. */
    if (r.width < 20 || r.height < 20 || r.width > 150 || r.height > 150) return;
    /* Prefer the innermost control, but only step past this element if a
       descendant is itself a plausible control. Megaphone's play button wraps a
       tiny play-classed icon, and treating that as "not the leaf" discarded the
       real control and left nothing. */
    const innerBetter = [...el.querySelectorAll('*')].some((k) => {
      if (!/play|pause/i.test(blobOf(k))) return false;
      const kr = k.getBoundingClientRect();
      return kr.width >= 20 && kr.height >= 20 && kr.width <= 150 && kr.height <= 150;
    });
    if (innerBetter) return;

    const label = ((el.getAttribute && (el.getAttribute('aria-label') ||
                    el.getAttribute('title'))) || '');
    const cls = ((el.className && el.className.toString) ? el.className.toString() : '');
    let score = 1, via = 'class';
    if (/^\s*(play|pause)\b/i.test(label) || /play\s*button/i.test(label)) { score = 4; via = 'aria-label'; }
    else if (/play|pause/i.test(label)) { score = 3; via = 'aria-label'; }
    else if (/play[-_]?(btn|button)|btn[-_]?play|playerbtn/i.test(cls)) { score = 2; via = 'class'; }
    /* Squarer is more button-like; among equals prefer the tighter target. */
    const squareness = 1 - Math.min(1, Math.abs(r.width - r.height) / Math.max(r.width, r.height));
    const total = score * 10 + squareness * 2 - (r.width * r.height) / 100000;
    if (total > playScore) { playScore = total; play = el; playVia = via; }
  });

  /* Video players commonly use a named big-play overlay. Trust it over a
     lower-scoring guess when nothing better was found. */
  if (!play || playScore < 20) {
    const big = all.find((el) => /vjs-big-play|big-play|ytp-large-play|play-overlay/i.test(blobOf(el)));
    if (big) {
      const r = big.getBoundingClientRect();
      if (r.width >= 20 && r.height >= 20 && r.width <= 200 && r.height <= 200) {
        play = big; playVia = 'big-play overlay';
      }
    }
  }

  let playInfo = null;
  if (play) {
    const r = play.getBoundingClientRect();
    const cs = getComputedStyle(play);
    const name = (play.getAttribute('aria-label') || play.getAttribute('title') ||
                  (play.textContent || '').trim()).slice(0, 60);
    playInfo = {
      w: px(r.width), h: px(r.height),
      area: Math.round(r.width * r.height),
      via: playVia,
      /* centre as a fraction of the frame, which is what placement means */
      cx: B.width  ? px((r.left + r.width  / 2 - B.left) / B.width)  : null,
      cy: B.height ? px((r.top  + r.height / 2 - B.top)  / B.height) : null,
      radius: cs.borderTopLeftRadius,
      accessibleName: name || null,
      tag: play.tagName.toLowerCase()
    };
  }

  /* ---------- waveform ----------
     A waveform is many narrow bars of varying height sharing a parent, or a
     wide short canvas, or an svg full of thin rects. */
  let waveform = null;
  const barParents = new Map();
  all.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.width <= 6 && r.height >= 2 && r.height <= 200 && el.children.length === 0) {
      const p = el.parentElement;
      if (p) barParents.set(p, (barParents.get(p) || 0) + 1);
    }
  });
  let bestBars = 0, bestParent = null;
  barParents.forEach((n, p) => { if (n > bestBars) { bestBars = n; bestParent = p; } });
  if (bestBars >= 20) {
    const r = bestParent.getBoundingClientRect();
    waveform = { kind: 'bars', count: bestBars, w: px(r.width), h: px(r.height) };
  }
  if (!waveform) {
    const c = [...document.querySelectorAll('canvas')].filter(vis)
      .find((el) => { const r = el.getBoundingClientRect(); return r.width > 80 && r.width / r.height > 4; });
    if (c) { const r = c.getBoundingClientRect(); waveform = { kind: 'canvas', count: null, w: px(r.width), h: px(r.height) }; }
  }
  if (!waveform) {
    const s = [...document.querySelectorAll('svg')].filter(vis).find((el) => {
      const kids = el.querySelectorAll('rect, line, path');
      const r = el.getBoundingClientRect();
      return kids.length >= 20 && r.width > 80 && r.width / r.height > 3;
    });
    if (s) { const r = s.getBoundingClientRect(); waveform = { kind: 'svg', count: s.querySelectorAll('rect,line,path').length, w: px(r.width), h: px(r.height) }; }
  }

  /* ---------- artwork ----------
     Biggest roughly-square image or background-image in the frame. */
  const artCands = [];
  [...document.querySelectorAll('img')].filter(vis).forEach((el) => {
    const r = el.getBoundingClientRect();
    const ar = r.width / Math.max(r.height, 1);
    if (r.width >= 28 && r.height >= 28 && ar > 0.5 && ar < 2.2) artCands.push([el, r]);
  });
  all.forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg.includes('url(')) {
      const r = el.getBoundingClientRect();
      const ar = r.width / Math.max(r.height, 1);
      if (r.width >= 28 && r.height >= 28 && ar > 0.5 && ar < 2.2) artCands.push([el, r]);
    }
  });
  let artwork = null;
  if (artCands.length) {
    artCands.sort((a, b) => (b[1].width * b[1].height) - (a[1].width * a[1].height));
    const [el, r] = artCands[0];
    artwork = {
      w: px(r.width), h: px(r.height),
      /* fraction of the frame the artwork occupies, which is what "how is it
         displayed" really comes down to */
      areaShare: (B.width && B.height) ? px((r.width * r.height) / (B.width * B.height)) : null,
      cx: B.width ? px((r.left + r.width / 2 - B.left) / B.width) : null,
      cy: B.height ? px((r.top + r.height / 2 - B.top) / B.height) : null,
      radius: getComputedStyle(el).borderTopLeftRadius,
      isImg: el.tagName.toLowerCase() === 'img'
    };
  }

  /* ---------- progress / seek ---------- */
  let progress = null;
  const seek = [...document.querySelectorAll('[role="slider"], input[type="range"], progress')].filter(vis)[0];
  if (seek) {
    const r = seek.getBoundingClientRect();
    progress = { kind: seek.getAttribute('role') || seek.tagName.toLowerCase(),
                 w: px(r.width), h: px(r.height), interactive: true };
  } else {
    /* a long thin bar is almost certainly a progress track even unlabelled */
    const bar = all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > B.width * 0.35 && r.height > 0 && r.height <= 10 && el.children.length <= 2;
    });
    if (bar) { const r = bar.getBoundingClientRect();
      progress = { kind: 'unlabelled bar', w: px(r.width), h: px(r.height), interactive: false }; }
  }

  /* ---------- text, timecodes, controls, outbound ---------- */
  const text = (body.innerText || '').replace(/\s+/g, ' ').trim();
  const times = [...new Set(text.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) || [])];
  const controls = all.filter((el) => {
    const t = el.tagName.toLowerCase();
    return t === 'button' || t === 'input' || el.getAttribute('role') === 'button' ||
           (t === 'a' && el.hasAttribute('href'));
  });
  const outbound = [...document.querySelectorAll('a[href]')].filter(vis)
    .filter((a) => /^https?:/.test(a.getAttribute('href') || '')).length;
  const pushCopy = /open in|listen on|watch on|save on|play on|get the app|download/i.test(text);

  return {
    frame: { w: px(B.width), h: px(B.height) },
    bg: getComputedStyle(body).backgroundColor,
    color: getComputedStyle(body).color,
    radius: getComputedStyle(body).borderTopLeftRadius,
    play: playInfo,
    waveform,
    artwork,
    progress,
    timecodes: times.slice(0, 4),
    controlCount: controls.length,
    outboundLinks: outbound,
    platformPush: pushCopy,
    textLen: text.length,
    textSample: text.slice(0, 120)
  };
}
"""


def rgb(s):
    """'rgb(a) string -> (r,g,b) or None."""
    if not s:
        return None
    m = re.findall(r'[\d.]+', s)
    if len(m) < 3:
        return None
    return tuple(round(float(x)) for x in m[:3])


def luma(c):
    return None if not c else round(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 1)


def mean_luma(path):
    """Mean perceived brightness of a rendered frame, 0 (black) to 255 (white).
    Read from real pixels because every player's body background computes to
    transparent, making a computed-style comparison useless."""
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im.thumbnail((80, 80))                      # cheap, and enough for a mean
    px = list(im.getdata())
    if not px:
        return None
    tot = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px)
    return round(tot / len(px), 1)


def main():
    from playwright.sync_api import sync_playwright

    players = json.loads((ROOT / '.players.json').read_text())
    only = set(sys.argv[1:])
    if only:
        players = [p for p in players if p['id'] in only]

    results = {}
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome", headless=True)
        for p in players:
            if p.get('blocked'):
                # No embed exists, so there is nothing to measure. Recorded so
                # the analysis page can show it as not applicable with a reason.
                results[p['id']] = {'id': p['id'], 'name': p['name'], 'group': p['group'],
                                    'status': p['status'], 'blocked': True,
                                    'why': p.get('why'), 'measured': False}
                print(f"  {p['name']:16} blocked, nothing to measure", flush=True)
                continue
            entry = p['entry']
            rec = {'id': p['id'], 'name': p['name'], 'group': p['group'],
                   'status': p['status'], 'blocked': False,
                   'declaredHeight': entry.get('h'),
                   'aspect': bool(entry.get('aspect')), 'themedParam': bool(p.get('themed')),
                   'shownMode': p.get('shownMode'), 'fellBack': bool(p.get('fellBack')),
                   'schemes': {}, 'network': None, 'narrow': None}

            for scheme in ('light', 'dark'):
                ctx = br.new_context(viewport={'width': 900, 'height': 900},
                                     color_scheme=scheme)
                page = ctx.new_page()
                bytes_seen = {'n': 0, 'kb': 0.0}

                def on_resp(r):
                    if 'localhost:8899' in r.url:
                        return
                    bytes_seen['n'] += 1
                    # r.body() throws for redirects, opaque and cached responses,
                    # so fall back to the declared content-length.
                    try:
                        bytes_seen['kb'] += len(r.body()) / 1024.0
                    except Exception:
                        try:
                            cl = r.headers.get('content-length')
                            if cl:
                                bytes_seen['kb'] += int(cl) / 1024.0
                        except Exception:
                            pass

                if scheme == 'light':
                    page.on('response', on_resp)

                page.goto(HOST + 'measure-host.html', wait_until='load')
                page.evaluate("([src, w, h, attrs]) => window.mountOne(src, w, h, attrs)",
                              [p['src'], FRAME_W, entry.get('h') or 360, p['attrs']])
                time.sleep(1.0)
                el = page.query_selector('#probe iframe')
                fr = el.content_frame() if el else None
                data = None
                if fr:
                    try:
                        fr.wait_for_load_state('domcontentloaded', timeout=15000)
                    except Exception:
                        pass
                    # Poll until the reading STOPS CHANGING, not until the frame
                    # first shows signs of life. Breaking early was measuring
                    # half-rendered players: iHeart's 166-bar waveform paints
                    # well after its title does, so it was recorded as absent.
                    # Two conditions, both needed. A minimum dwell, because a
                    # Next.js player like Deezer can sit in a shallow
                    # pre-hydration state long enough for two consecutive polls
                    # to agree on the wrong answer. And three stable reads, not
                    # two, before believing the reading has settled.
                    prev, stable, t0 = None, 0, time.time()
                    for _ in range(34):
                        try:
                            d = fr.evaluate(PROBE)
                        except Exception:
                            d = None
                        if d:
                            key = json.dumps({k: d[k] for k in
                                              ('play', 'waveform', 'artwork', 'progress',
                                               'controlCount', 'textLen')}, sort_keys=True)
                            stable = stable + 1 if key == prev else 0
                            prev, data = key, d
                            rich = (d['play'] or d['artwork'] or d['waveform'] or
                                    d['controlCount'] >= 2)
                            if stable >= 3 and rich and (time.time() - t0) > 4.0:
                                break
                        time.sleep(0.6)
                    if data:
                        data['settleSeconds'] = round(time.time() - t0, 1)
                rec['schemes'][scheme] = data
                # Every player's body background computes to rgba(0,0,0,0), so a
                # computed-style comparison can never detect theme response.
                # Screenshot the frame and read the actual painted pixels.
                try:
                    shot = ROOT / f'.shot-{p["id"]}-{scheme}.png'
                    el.screenshot(path=str(shot))
                    rec.setdefault('pixels', {})[scheme] = mean_luma(shot)
                    shot.unlink(missing_ok=True)
                except Exception:
                    rec.setdefault('pixels', {})[scheme] = None
                if scheme == 'light':
                    rec['network'] = {'requests': bytes_seen['n'],
                                      'kb': round(bytes_seen['kb'], 1) or None}
                ctx.close()

            # ---- narrow-width behaviour, light only ----
            ctx = br.new_context(viewport={'width': 480, 'height': 900}, color_scheme='light')
            page = ctx.new_page()
            page.goto(HOST + 'measure-host.html', wait_until='load')
            page.evaluate("([src, w, h, attrs]) => window.mountOne(src, w, h, attrs)",
                          [p['src'], NARROW_W, entry.get('h') or 360, p['attrs']])
            time.sleep(1.0)
            el = page.query_selector('#probe iframe')
            fr = el.content_frame() if el else None
            if fr:
                try:
                    fr.wait_for_load_state('domcontentloaded', timeout=15000)
                except Exception:
                    pass
                time.sleep(4)
                try:
                    rec['narrow'] = fr.evaluate("""() => {
                        const b = document.body, d = document.documentElement;
                        return { scrollW: Math.max(b.scrollWidth, d.scrollWidth),
                                 clientW: d.clientWidth,
                                 scrollH: Math.max(b.scrollHeight, d.scrollHeight),
                                 clientH: d.clientHeight }; }""")
                except Exception:
                    rec['narrow'] = None
            ctx.close()

            # ---- derive the comparison verdicts ----
            lt, dk = rec['schemes'].get('light'), rec['schemes'].get('dark')
            base = lt or dk
            px = rec.get('pixels') or {}
            lb, db = px.get('light'), px.get('dark')
            # 12 points of mean luma is well beyond render noise but comfortably
            # below a real light/dark swap, which moves it by 100 or more.
            rec['themeResponds'] = (None if (lb is None or db is None)
                                    else abs(lb - db) > 12)
            rec['lightLuma'], rec['darkLuma'] = lb, db
            def real(d):
                if not d:
                    return False
                # Do NOT require a frame height: several players absolutely
                # position their contents and report a zero-height body while
                # rendering perfectly well. Evidence of content is the test.
                return bool(d.get('play') or d.get('artwork') or d.get('waveform') or
                            d.get('progress') or d.get('controlCount') or d.get('textLen', 0) >= 6)

            rec['measured'] = real(base)
            if not rec['measured']:
                rec['whyNotMeasured'] = ('the frame rendered nothing measurable, most often '
                                         'because the player refuses this host or needs a '
                                         'signed-in viewer')
            print(f"  {p['name']:16} play={base and base['play'] and (str(base['play']['w'])+'x'+str(base['play']['h']))}"
                  f"  wave={bool(base and base['waveform'])}"
                  f"  art={bool(base and base['artwork'])}"
                  f"  theme={rec['themeResponds']}"
                  f"  net={rec['network']}", flush=True)
            results[p['id']] = rec
        br.close()

    out = ROOT / 'measurements.js'
    payload = {'measuredAt': time.strftime('%Y-%m-%d'), 'frameWidth': FRAME_W,
               'narrowWidth': NARROW_W, 'players': results}
    out.write_text(
        "/* GENERATED by measure.py. Do not hand-edit: re-run the script.\n"
        "   Measured offline with Playwright, which can read inside cross-origin\n"
        "   frames. A published page cannot, which is why this data is baked. */\n"
        "const MEASUREMENTS = " + json.dumps(payload, indent=1) + ";\n")
    print(f"\nwrote {out} ({out.stat().st_size // 1024} KB) for {len(results)} players")


if __name__ == '__main__':
    main()
