"""The play button, and the metadata, survive every height down to 50.

The card used to floor at 136 and let a shorter slot clip the overflow, which
cut the button in half, since it is centred on the card. Hiding the top bar
under 128 stopped the clipping and cost the metadata, which was the wrong trade:
the button competes with the top bar for the same vertical space only because it
sits over it. Putting the button INTO that row removes the competition, and the
whole line is 40 tall including the 36 tile, so it fits any card from 56 up.

Asserted at every height and for every content type:
  the button is fully inside the card, never cut
  nothing still on screen overlaps it
  the metadata row is still there, all the way to 50
  info, list and share are gone once the button joins the row, and present above
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8779
URL = 'http://localhost:%d/widget.html' % PORT
KINDS = ['podcast', 'episode', 'live', 'artist', 'playlist']
# Either side of each of the three thresholds, 128, 76 and 56, plus the ends.
HS = [200, 160, 136, 128, 127, 110, 96, 80, 76, 75, 70, 60, 56, 55, 50]
bad = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1300, 'height': 1500})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load')
        await pg.wait_for_timeout(9000)
        print('%4s %-9s %4s %8s %9s %7s  %s'
              % ('h', 'kind', 'play', 'inCard', 'tileGap', 'botGap', 'chrome'))
        for h in HS:
            await pg.evaluate("""(h)=>{const s=document.getElementById('heightRange');
              s.value=String(h); s.dispatchEvent(new Event('input',{bubbles:true}));}""", h)
            await pg.wait_for_timeout(280)
            for k in KINDS:
                r = await pg.evaluate("""(k)=>{
                  const w=[...document.querySelectorAll('.widget.c')].find(x=>x.dataset.kind===k);
                  if(!w) return null;
                  const W=w.getBoundingClientRect();
                  const P=w.querySelector('.hero-play').getBoundingClientRect();
                  const shown=(s)=>{const e=w.querySelector(s);
                    return e && getComputedStyle(e).display!=='none' ? e.getBoundingClientRect() : null;};
                  const T=shown('.topbar'), B=shown('.hero-bottom'), tile=shown('.thumb-link');
                  const meta=w.querySelector('.meta');
                  const acts=[...w.querySelectorAll('.topbar .h-btn')]
                    .filter(e=>getComputedStyle(e).display!=='none')
                    .map(e=>e.dataset.act||'?');
                  return {play:Math.round(P.height),
                          above:Math.round(P.top-W.top), below:Math.round(W.bottom-P.bottom),
                          tileGap: tile?Math.round(tile.left-P.right):null,
                          botGap: B?Math.round(B.top-P.bottom):null,
                          bar: !!T, bottom: !!B, acts,
                          metaText: meta?meta.textContent.trim().length:0};}""", k)
                if not r:
                    continue
                flag = ''
                if r['above'] < 0 or r['below'] < 0:
                    flag = ' <<< PLAY CUT'
                elif r['botGap'] is not None and r['botGap'] < 0:
                    flag = ' <<< BOTTOM OVERLAPS PLAY'
                # The tile only sits beside the button once the row layout is on.
                elif h <= 127 and r['tileGap'] is not None and r['tileGap'] < 0:
                    flag = ' <<< PLAY OVERLAPS TILE'
                elif r['play'] < 40:
                    flag = ' <<< PLAY UNDER ITS 40 MINIMUM'
                # The whole point of the row: the metadata no longer disappears.
                elif not r['bar'] or r['metaText'] == 0:
                    flag = ' <<< METADATA GONE'
                # The row is the whole card at this height; the title needs the
                # width more than three secondary actions do.
                elif h <= 127 and r['acts']:
                    flag = ' <<< ACTIONS STILL SHOWN IN THE ROW'
                elif h >= 128 and not r['acts']:
                    flag = ' <<< ACTIONS MISSING FROM THE STACKED CARD'
                if flag:
                    bad.append((h, k, flag.strip(), r))
                if k == 'podcast' or flag:
                    print('%4d %-9s %4d %3d/%-4d %9s %7s  %s%s'
                          % (h, k, r['play'], r['above'], r['below'],
                             str(r['tileGap']), str(r['botGap']),
                             ('bar ' if r['bar'] else '') + ('bottom ' if r['bottom'] else '')
                             + ','.join(r['acts']),
                             flag))
        if errs:
            bad.append(('page errors', errs))
        await b.close()
    print('\n%d failed' % len(bad))
    for x in bad[:12]:
        print('  FAIL', x)
    if bad:
        sys.exit(1)

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
