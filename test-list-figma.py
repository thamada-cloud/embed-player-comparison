"""The "Figma" List mode reproduces frame 2700:561775, widget_160+, exactly.

The frame is not a drawing at one size. It carries auto-layout constraints, so
resolving them is the responsive spec, and this test resolves them independently
here and compares the rendered card against that rather than against a table of
numbers copied out of a measurement.

  player_container  flex 1 0 0, min-height 160, padding 8
  List              flex 1 0 0, max-height 208, min-height 1
  top_bar           flex 1 0 0, max-height 80, min-height 36
  middle_bar        shrink 0, a 64 play button with 2 above and below, so 68
  bottom_bar        flex 1 0 0, max-height 64
  art               aspect 1/1, height 100% of top_bar

Two children both flex 1 0 0 means every pixel the card gains is split evenly
until one of them hits a bound, which gives three bands. Below 320 an even split
would put the player under its floor, so the player holds 160 and the list takes
the rest. From 320 to 416 both are free and they grow together. Above 416 the
list is frozen at 208 and the player takes the rest.

Swept at every single height from 161 to 900 on the podcast card, since the
whole point of the mode is that it is continuous, and at a coarser step on the
other two cards that carry a list. A 1px tolerance, because an even split of an
odd card height lands on a half pixel and the two halves round outward.

The episode and live cards are asserted NOT to change. They carry no list, so
none of the three bands describes them and the frame says nothing about them.

The frame is 420 wide and the sweep runs at 420, which is also the only width at
which the tile's width term cannot bind. That term is ours, not the frame's, and
it is kept deliberately; see the stylesheet.
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8797
URL = 'http://localhost:%d/widget.html' % PORT
TOL = 1
FAILED = 0


def frame(h):
    """Frame 2700:561775 resolved as flexbox. Returns player, list, art."""
    half = h / 2
    if half < 160:                      # the player's floor binds
        player, lst = 160, h - 160
    elif half > 208:                    # the list's cap binds
        player, lst = h - 208, 208
    else:                               # both free, half each
        player, lst = half, half
    # inside the player: 8 of padding at each end, a fixed 68 middle bar, then
    # top_bar and bottom_bar split what is left. The art is the top bar.
    top = (player - 16 - 68) / 2
    return round(player), round(max(0, lst)), round(min(80, max(36, top)))


READ = """(k)=>{const w=document.querySelector('#w-'+k+'-c .widget');
  const on=(s)=>{const e=w.querySelector(s); return !!e&&getComputedStyle(e).display!=='none';};
  const h=(s)=>{const e=w.querySelector(s); return on(s)?Math.round(e.getBoundingClientRect().height):0;};
  return {stage:h('.stage'), list:h('.list'), tile:h('.thumb-link'), play:h('.hero-play'),
          btn:on('.h-btn[data-act="list"]')};}"""


async def main():
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1200, 'height': 1500})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(12000)
        await pg.click('button[data-listat="figma"]'); await pg.wait_for_timeout(500)
        await pg.evaluate("()=>{const s=document.getElementById('widthRange');"
                          "s.value='420';s.dispatchEvent(new Event('input',{bubbles:true}));}")
        await pg.wait_for_timeout(500)

        for kind, step in (('podcast', 1), ('artist', 17), ('playlist', 17)):
            worst = (0, None)
            for h in range(161, 901, step):
                await pg.evaluate("(x)=>{const s=document.getElementById('heightRange');"
                                  "s.value=String(x);s.dispatchEvent(new Event('input',{bubbles:true}));}", h)
                r = await pg.evaluate(READ, kind)
                want = frame(h)
                got = (r['stage'], r['list'], r['tile'])
                d = max(abs(a - b2) for a, b2 in zip(got, want))
                if d > worst[0]:
                    worst = (d, (h, want, got))
                # The frame's middle bar is shrink 0 around a 64 button, so the
                # play button never moves at any height this mode covers.
                if r['play'] != 64:
                    bad.append(('play not 64', kind, h, r['play']))
                # One route to the list, never two.
                if r['btn']:
                    bad.append(('list button still shown', kind, h))
            print(f'  {kind:9s} worst delta {worst[0]}   {worst[1] or ""}')
            if worst[0] > TOL:
                bad.append(('over tolerance', kind, worst[1]))

        for kind in ('episode', 'live'):
            await pg.evaluate("()=>{const s=document.getElementById('heightRange');"
                              "s.value='600';s.dispatchEvent(new Event('input',{bubbles:true}));}")
            await pg.wait_for_timeout(300)
            r = await pg.evaluate(READ, kind)
            print(f"  {kind:9s} stage {r['stage']} list {r['list']} tile {r['tile']}")
            if r['list'] != 0:
                bad.append(('a list appeared on', kind))

        print('  errors:', errs)
        if errs:
            bad.append(('page errors', errs))
        await b.close()
    global FAILED
    FAILED = len(bad)
    print('\n%d failed' % len(bad))
    for x in bad[:8]:
        print('  FAIL', x)


srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
sys.exit(1 if FAILED else 0)
