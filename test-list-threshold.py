"""The List-at switch: where the inline list takes over from the drawer.

170, 240 and 300, so the three can be compared. 300 is what the card has shipped
with; the other two trade player area for a list sooner.

Asserted for each setting, at heights either side of it: the list is inline at or
above the threshold and a drawer below, the list button mirrors that, and the
tile follows the player area rather than the card.

The lower two thresholds needed more than a query. A 240px card with a 136px list
hands the player 104, which cannot hold a 36 top bar, a 40 button and a 28 bottom
row, and the button ran straight through the subtitle. The card switches to its
compact row there now, which it previously only did on CARD height.
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
    for at in ('170','240','300'):
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
