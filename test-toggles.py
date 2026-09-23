"""The prototype page's Background and List switches.

Background: "Follows play" paints what is playing, the track on a station or the
chosen episode on a show. "Fixed" paints the thing the card is FOR and never
changes, so the backdrop and the tile are the same image.

List: "Inline when it fits" is the responsive behaviour, inline above 300 and a
drawer below. "Drawer only" holds the pre-300 behaviour at every height.

Both flip back to their defaults at the end, so this also proves they are
reversible rather than one-way.

The switches themselves are commented out of the page header for now, so this
drives the FLAGS they set rather than clicking the buttons. The behaviour is
what matters and it is all still there; only the controls are hidden. Written
this way it keeps passing whether they are visible or not.
"""
import asyncio, base64, subprocess, sys, time
from playwright.async_api import async_playwright
PORT = 8785
URL = 'http://localhost:%d/widget.html' % PORT
def dec(u):
  try: return base64.b64decode(u.rsplit('/',1)[-1]).decode()[:60]
  except Exception: return (u or '')[:60]
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1400,'height':1700},device_scale_factor=1)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)

    print('=== Background toggle ===')
    A="""(k)=>{const w=document.querySelector('#w-'+k+'-c');
      const row=w.querySelector('.row.on .row-art')||w.querySelector('.rows .row .row-art');
      return {back:w.querySelector('.art').src, tile:w.querySelector('.h-thumb').src,
              playing: row?(row.src||row.getAttribute('src')):null};}"""
    for mode in ('live','fixed','live'):
      await pg.evaluate("""(m)=>{document.querySelector('main').dataset.bg = m;
        if (typeof repaintAll === 'function') repaintAll();}""", mode)
      await pg.wait_for_timeout(1200)
      for k in ('podcast','live','playlist'):
        r=await pg.evaluate(A,k)
        same = r['back']==r['tile']
        print(f"  bg={mode:<6} {k:<9} backdrop {'== tile' if same else 'differs from tile'}  {dec(r['back'])}")
        if mode=='fixed' and not same: bad.append((k,'fixed but backdrop is not the card art'))
        # Against the RULE, not against a coincidence. This used to assert that
        # in "follows play" the podcast backdrop DIFFERS from its tile, which
        # only holds while the current episode happens to ship its own artwork.
        # A newly published episode reused the show's image and the assertion
        # broke, reporting a bug in code that was behaving correctly.
        if mode=='live' and k=='podcast' and r['playing'] and r['back']!=r['playing']:
          bad.append((k,'follows play, but the backdrop is not the current episode art'))
      print()

    print('=== List toggle ===')
    for mode in ('auto','drawer','auto'):
      await pg.evaluate("(m)=>{document.documentElement.dataset.list = m;}", mode)
      await pg.wait_for_timeout(700)
      for h in (300,440):
        await pg.evaluate("(h)=>{const s=document.getElementById('heightRange');s.value=String(h);s.dispatchEvent(new Event('input',{bubbles:true}));}",h)
        await pg.wait_for_timeout(450)
        r=await pg.evaluate("""()=>{const w=document.querySelector('#w-podcast-c .widget');
          const vis=(s)=>{const e=w.querySelector(s); return !!e && getComputedStyle(e).display!=='none';};
          const st=w.querySelector('.stage').getBoundingClientRect();
          return {inline:vis('.list'), btn:vis('.h-btn[data-act=\\"list\\"]'), stage:Math.round(st.height)};}""")
        print(f"  list={mode:<7} h={h}  inline={str(r['inline']):<5} listBtn={str(r['btn']):<5} stage={r['stage']}")
        if mode=='drawer' and (r['inline'] or not r['btn']): bad.append((mode,h,r))
        if mode=='auto' and not r['inline']: bad.append((mode,h,r))
      # and the drawer must actually open when forced
      if mode=='drawer':
        await pg.click('#w-podcast-c .h-btn[data-act="list"]'); await pg.wait_for_timeout(900)
        v=await pg.evaluate("()=>getComputedStyle(document.querySelector('#w-podcast-c .sheet:not(.info-sheet)')).visibility")
        print(f"    drawer opens: {v}")
        if v!='visible': bad.append(('drawer did not open',v))
        await pg.click('#w-podcast-c .sheet-close'); await pg.wait_for_timeout(700)
    print('  errors:', errs)
    if errs: bad.append(('errors',errs))
    await b.close()
  global FAILED
  FAILED = len(bad)
  print('\n%d failed' % len(bad))
  for x in bad[:8]: print('  FAIL',x)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
sys.exit(1 if FAILED else 0)
