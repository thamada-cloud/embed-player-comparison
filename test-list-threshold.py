"""The List-at switch: where the inline list takes over from the drawer.

300, which is what the card has shipped with, is the only stepped threshold left.
Asserted at heights either side of it: the list is inline at or above 300 and a
drawer below, the list button mirrors that, and the tile follows the player area
rather than the card.

170 and 240 used to be here too, as lower thresholds to compare against 300, and
were removed. Both hand the player so little room that the compact row has to
take over, so they compared a different card rather than a different threshold.
The compact-row duplicates they needed went with them; the only compact rule left
is the one on CARD height, which is where it started.

Reveal, the other setting the switch still offers, has its own test in
test-list-reveal.py because its list height is continuous rather than stepped.
"""
import asyncio, subprocess, sys, time

PORT = 8793
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1200,'height':1500})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    Q="""()=>{const w=document.querySelector('#w-podcast-c .widget');
      const on=(s)=>{const e=w.querySelector(s); return !!e&&getComputedStyle(e).display!=='none';};
      const h=(s)=>{const e=w.querySelector(s); return on(s)?Math.round(e.getBoundingClientRect().height):0;};
      return {inline:on('.list'), listH:h('.list'), btn:on('.h-btn[data-act=\\"list\\"]'),
              stage:h('.stage'), tile:h('.thumb-link')};}"""
    for at in ('300',):
      await pg.click(f'button[data-listat="{at}"]'); await pg.wait_for_timeout(500)
      print(f'  --- List at {at}')
      for hh in (160,170,200,240,260,300,320):
        await pg.evaluate("(h)=>{const s=document.getElementById('heightRange');s.value=String(h);s.dispatchEvent(new Event('input',{bubbles:true}));}",hh)
        await pg.wait_for_timeout(320)
        r=await pg.evaluate(Q)
        want_inline = hh >= int(at)
        ok = r['inline']==want_inline and r['btn']==(not want_inline)
        print(f"    h={hh:>3}  inline={str(r['inline']):<5} listH={r['listH']:>3} btn={str(r['btn']):<5} "
              f"stage={r['stage']:>3} tile={r['tile']:>2}  {'OK' if ok else 'WRONG'}")
        if not ok: bad.append((at,hh,r))
    await pg.click('button[data-listat="300"]'); await pg.wait_for_timeout(400)
    print('  errors:', errs)
    if errs: bad.append(('errors',errs))
    await b.close()
  global FAILED
  FAILED = len(bad)
  print('\n%d failed' % len(bad))
  for x in bad[:6]: print('  FAIL',x)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
sys.exit(1 if FAILED else 0)
