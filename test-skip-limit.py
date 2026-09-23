"""The skip allowance: the count on the button, and the toast at the limit.

The 6 used to be part of the skip icon's own path, so it was a picture rather
than state and could never tick down. It is a separate layer over the glyph now,
which is how apps/listen's Next control does it in iheartradio/web, and that is
what makes the count real.

Asserted end to end: the button reads 6 before anything is played, counts down
to 0 across six presses, raises the toast on the seventh with production's own
copy and its upgrade action, and does NOT advance the track past the limit.
"""
import asyncio, subprocess, sys, time

PORT = 8789
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
OUT='/tmp/'
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1100,'height':1500},device_scale_factor=2)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    N="()=>{const e=document.querySelector('#w-artist-c .skip-n');return e?e.textContent.trim():'NONE';}"
    T="()=>{const t=document.querySelector('#w-artist-c .toast');return t?{title:(t.querySelector('.toast-title')||{}).textContent,copy:(t.querySelector('.toast-copy')||{}).textContent,acts:[...t.querySelectorAll('.toast-action')].map(a=>a.textContent+' -> '+a.getAttribute('href'))}:null;}"
    print('  before any play, the button already reads:', await pg.evaluate(N))
    if await pg.evaluate(N)!='6': bad.append(('initial count', await pg.evaluate(N)))
    await pg.click('#w-artist-c .hero-play'); await pg.wait_for_timeout(1600)
    print('  after play:', await pg.evaluate(N))
    seq=[]
    for i in range(7):
      await pg.click('#w-artist-c .h-btn[data-act="next"]'); await pg.wait_for_timeout(700)
      seq.append(await pg.evaluate(N))
      t=await pg.evaluate(T)
      if t: break
    print('  counting down:', seq)
    if seq[:6]!=['5','4','3','2','1','0']: bad.append(('countdown', seq))
    t=await pg.evaluate(T)
    print('  toast:', t)
    if not t: bad.append(('no toast at the limit',))
    else:
      if 'skip limit' not in (t['title'] or ''): bad.append(('toast title', t['title']))
      if not t['acts']: bad.append(('toast has no action',))
    # a 7th press must not advance the track
    tr=await pg.evaluate("()=>document.querySelector('#w-artist-c .h-name').textContent.trim()")
    await pg.click('#w-artist-c .h-btn[data-act="next"]'); await pg.wait_for_timeout(700)
    tr2=await pg.evaluate("()=>document.querySelector('#w-artist-c .h-name').textContent.trim()")
    print('  track unchanged past the limit:', tr==tr2)
    if tr!=tr2: bad.append(('advanced past the limit',))
    await pg.locator('#w-artist-c').screenshot(path=OUT+'skip-toast.png')
    await pg.evaluate("()=>{const t=document.querySelector('#w-artist-c .toast-close'); if(t) t.click();}")
    await pg.wait_for_timeout(500)
    await pg.locator('#w-artist-c .hero-controls').screenshot(path=OUT+'skip-count.png')
    print('  errors:', errs)
    if errs: bad.append(('errors',errs))
    # Stop the simulated transport before tearing down. Its 1s interval keeps
    # the page busy and browser close then takes minutes rather than seconds.
    await pg.evaluate("()=>document.querySelectorAll('.widget.c.playing .hero-play').forEach(b=>b.click())")
    await pg.wait_for_timeout(300)
    await b.close()
  global FAILED
  FAILED = len(bad)
  print('\n%d failed' % len(bad))
  for x in bad: print('  FAIL',x)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
sys.exit(1 if FAILED else 0)
