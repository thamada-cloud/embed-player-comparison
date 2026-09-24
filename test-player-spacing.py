"""Spacing inside the player container, frame 2700:561776.

Every auto-layout inside player_container, asserted as gaps, padding and the
edges those produce. The frame puts a flat 8 of padding on player_container and
nothing on its three children. Ours pushes the horizontal 8 onto each child
instead, which lands in the same place, so the edge assertions below are what
actually matter: the artwork, the trailing buttons, the scrubber and the brand
row all have to start and end on the same two lines.

  player_container  padding 8 on all four sides
  top_bar           gap 8, padding 0
  copy              gap 2
  trailing_buttons  gap 8, each button 4 of padding around a 24 icon
  middle_bar        padding 2 top and bottom, so the block is 68 not 64
  playback_controls gap 8
  left_buttons      gap 8
  right_buttons     gap 4
  bottom_bar        gap 2, padding 0
  Slider            gap 12
  brand             gap 4

One value in the frame is deliberately NOT reproduced. right_buttons carries 4
of padding where left_buttons carries none, which would put the first right
control 12 from the play button against the left's 8. It reads as a drafting
slip rather than an intent, and it is the only value in the frame that would
move a control off-centre against its opposite number.

Run on the episode card, which is the only one that shows a scrubber, and on the
podcast card for the no-scrubber path. Both at 420 wide, the frame's own width.
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8799
URL = 'http://localhost:%d/widget.html' % PORT
PAD = 8
FAILED = 0

READ = """(kind)=>{
  const w=document.querySelector('#w-'+kind+'-c .widget');
  const one=(s)=>{const e=w.querySelector(s); if(!e) return null;
    const c=getComputedStyle(e); const b=e.getBoundingClientRect();
    return {gap:c.gap, pt:c.paddingTop, pb:c.paddingBottom,
            pl:c.paddingLeft, pr:c.paddingRight,
            h:Math.round(b.height), x:Math.round(b.left), r:Math.round(b.right)};};
  const card=w.getBoundingClientRect();
  return {x:Math.round(card.left), r:Math.round(card.right),
    stage:one('.stage'), topbar:one('.topbar'), thumb:one('.thumb-link'),
    meta:one('.topbar .meta'), share:one('.topbar .tb-share'),
    controls:one('.hero-controls'), play:one('.hero-play'),
    bottom:one('.hero-bottom'), crows:one('.c-rows'),
    slider:one('.slider'), lrow:one('.list-row'), lrside:one('.lr-side'),
    sides:[...w.querySelectorAll('.hero-controls .cc-side')].map(e=>{
      const c=getComputedStyle(e); return {gap:c.gap, pad:c.padding};})};}"""


async def main():
    bad = []

    def ck(label, got, want):
        ok = got == want
        print(f"    {label:<34} {'PASS' if ok else 'FAIL'}  got {got}  want {want}")
        if not ok:
            bad.append((label, got, want))

    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1300, 'height': 1300})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(12000)
        await pg.evaluate("()=>{const s=document.getElementById('widthRange');"
                          "s.value='420';s.dispatchEvent(new Event('input',{bubbles:true}));}")
        await pg.evaluate("()=>{const s=document.getElementById('heightRange');"
                          "s.value='300';s.dispatchEvent(new Event('input',{bubbles:true}));}")
        await pg.wait_for_timeout(700)
        # The episode card only draws its scrubber once it is playing.
        await pg.click('#w-episode-c .hero-play'); await pg.wait_for_timeout(1600)

        for kind in ('episode', 'podcast'):
            r = await pg.evaluate(READ, kind)
            left, right = r['x'] + PAD, r['r'] - PAD
            print(f'  --- {kind}, content runs {left} to {right}')

            ck('player_container padding top', r['stage']['pt'], '8px')
            ck('player_container padding bottom', r['bottom']['pb'], '8px')
            ck('top_bar gap', r['topbar']['gap'], '8px')
            ck('copy gap', r['meta']['gap'], '2px')
            ck('middle_bar padding top', r['controls']['pt'], '2px')
            ck('middle_bar padding bottom', r['controls']['pb'], '2px')
            ck('middle block is 68 not 64', r['controls']['h'], 68)
            ck('playback_controls gap', r['controls']['gap'], '8px')
            ck('left_buttons gap', r['sides'][0]['gap'], '8px')
            ck('right_buttons gap', r['sides'][1]['gap'], '4px')
            ck('right_buttons padding not copied', r['sides'][1]['pad'], '0px')
            ck('bottom_bar gap', r['bottom']['gap'], '2px')
            ck('bottom_bar rows gap', r['crows']['gap'], '2px')
            ck('brand gap', r['lrside']['gap'], '4px')

            # The four things that have to line up on the same two edges.
            ck('artwork left edge', r['thumb']['x'], left)
            ck('trailing button right edge', r['share']['r'], right)
            ck('brand row left edge', r['lrow']['x'] + 8, left)
            ck('brand row right edge', r['lrow']['r'] - 8, right)
            if r['slider'] and r['slider']['h']:
                ck('Slider gap', r['slider']['gap'], '12px')
                ck('Slider left edge', r['slider']['x'] + 8, left)
                ck('Slider right edge', r['slider']['r'] - 8, right)
            elif kind == 'episode':
                bad.append(('no scrubber on the episode card', None, None))

        print('  errors:', errs)
        if errs:
            bad.append(('page errors', errs, []))
        await b.close()
    global FAILED
    FAILED = len(bad)
    print('\n%d failed' % len(bad))
    for x in bad[:10]:
        print('  FAIL', x)


srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
sys.exit(1 if FAILED else 0)
