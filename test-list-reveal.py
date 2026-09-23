"""The "Reveal" list mode: the shipping player's shape.

The stepped modes decide a list height from the card and let the player take the
rest, so the list arrives whole at its threshold. The shipping embed has no
height logic at all, it draws one tall layout and the slot clips it, so the list
is uncovered a row at a time and the player never moves.

This asserts that shape: no list to 172, then the player holding an exact 160
while the list reveals to its 208 maximum, then the player growing.

173 and not 161, because .list is border-box with 12px of top padding and cannot
render thinner than that; below 173 the clamp asked for less and the player was
squeezed to 149 instead of holding 160.
"""
import asyncio, subprocess, sys, time

PORT = 8795
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
OUT='/tmp/'
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':900,'height':1500},device_scale_factor=2)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    await pg.click('button[data-listat="reveal"]'); await pg.wait_for_timeout(600)
    print(f"{'card':>5} {'stage':>6} {'list':>5} {'play':>5} {'tile':>5}  want stage/list")
    for h in (150,160,172,173,180,200,240,300,368,400,500,600):
      await pg.evaluate("(x)=>{const s=document.getElementById('heightRange');s.value=String(x);s.dispatchEvent(new Event('input',{bubbles:true}));}",h)
      await pg.wait_for_timeout(330)
      r=await pg.evaluate("""()=>{const w=document.querySelector('#w-podcast-c .widget');
        const on=(s)=>{const e=w.querySelector(s); return !!e&&getComputedStyle(e).display!=='none';};
        const hh=(s)=>{const e=w.querySelector(s); return on(s)?Math.round(e.getBoundingClientRect().height):0;};
        return {card:Math.round(w.getBoundingClientRect().height), stage:hh('.stage'),
                list:hh('.list'), play:hh('.hero-play'), tile:hh('.thumb-link')};}""")
      # .list is border-box with 12px of top padding, so it cannot be thinner
      # than 12; the reveal therefore starts at 173 where the clamp first
      # exceeds that, and the player holds an exact 160 from there on.
      wl = 0 if h<=172 else min(208, h-160)
      ws = h - wl
      ok = abs(r['list']-wl)<=1 and abs(r['stage']-ws)<=1
      print(f"{r['card']:>5} {r['stage']:>6} {r['list']:>5} {r['play']:>5} {r['tile']:>5}  {ws}/{wl}  {'OK' if ok else 'WRONG'}")
      if not ok: bad.append((h,r,ws,wl))
    for h in (200,300,500):
      await pg.evaluate("(x)=>{const s=document.getElementById('heightRange');s.value=String(x);s.dispatchEvent(new Event('input',{bubbles:true}));}",h)
      await pg.wait_for_timeout(600)
      await pg.locator('section[data-design="c"][data-kind="podcast"] .shell').screenshot(path=OUT+f'rev-{h}.png')
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
