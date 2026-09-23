"""The info button, and which top-bar actions each card carries.

The playlist had no info button, so its name and description were unreachable
even though the drawer was already being rendered on every card. It has one now,
alongside the list, which the old `topAction` enum could not express: that field
read as a choice between 'info' and 'list' but the list button was always gated
separately, so 'list' selected nothing.

Two things this checks that bit while it was written:
  the list button is hidden at the default height, because the list is INLINE
  there; it returns below 300 where the list is a drawer.
  a drawer covers the card, so the other top-bar button is genuinely unreachable
  by pointer while one is open. That is correct, not a bug.
"""
import asyncio, subprocess, sys, time

PORT = 8791
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
OUT='/tmp/'
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1000,'height':1400},device_scale_factor=2)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    print('  top-bar buttons per card:')
    for k in ('podcast','episode','live','artist','playlist'):
      v=await pg.evaluate("""(k)=>[...document.querySelectorAll('#w-'+k+'-c .topbar .h-btn')]
        .filter(e=>getComputedStyle(e).display!=='none')
        .map(e=>e.dataset.act+'('+(e.getAttribute('aria-label')||'')+')')""",k)
      print(f'    {k:<9} {v}')
    # Two regimes. At the default height the cards with a list show it INLINE,
    # and the list button is deliberately hidden there; below 300 the list is a
    # drawer and the button comes back. An earlier version of this expected the
    # button in both, which is not what the card does.
    GOT = """(k)=>[...document.querySelectorAll('#w-'+k+'-c .topbar .h-btn')]
      .filter(e=>getComputedStyle(e).display!=='none').map(e=>e.dataset.act)"""
    tall={'podcast':['share'],'episode':['info','share'],'live':['info','share'],
          'artist':['share'],'playlist':['info','share']}
    for k,w in tall.items():
      got=await pg.evaluate(GOT,k)
      if got!=w: bad.append((k,'buttons at default height',got,'want',w))
    await pg.evaluate("(h)=>{const s=document.getElementById('heightRange');s.value=String(h);s.dispatchEvent(new Event('input',{bubbles:true}));}",240)
    await pg.wait_for_timeout(700)
    short={'podcast':['list','share'],'episode':['info','share'],'live':['info','share'],
           'artist':['list','share'],'playlist':['info','list','share']}
    print('\n  below 300, where the list is a drawer:')
    for k,w in short.items():
      got=await pg.evaluate(GOT,k)
      print(f'    {k:<9} {got}')
      if got!=w: bad.append((k,'buttons below 300',got,'want',w))
    await pg.evaluate("()=>document.getElementById('heightAuto').click()")
    await pg.wait_for_timeout(700)
    # open the playlist info drawer and read it
    await pg.click('#w-playlist-c .h-btn[data-act="info"]'); await pg.wait_for_timeout(2200)
    r=await pg.evaluate("""()=>{const s=document.querySelector('#w-playlist-c .info-sheet');
      return {vis:getComputedStyle(s).visibility,
              title:(s.querySelector('h3')||{}).textContent,
              body:(s.querySelector('.info-body')||{}).textContent,
              legal:[...s.querySelectorAll('.list-legal a')].map(a=>a.textContent+' -> '+a.getAttribute('href'))};}""")
    print('\n  playlist info drawer:')
    for k,v in r.items(): print(f'    {k}: {v}')
    if r['vis']!='visible': bad.append(('drawer did not open',r['vis']))
    if not r['title']: bad.append(('no title',))
    if not r['body'] or r['body']=='No description available.': bad.append(('no description',r['body']))
    if len(r['legal'])!=2: bad.append(('legal links',r['legal']))
    await pg.locator('#w-playlist-c').screenshot(path=OUT+'pl-info.png')
    await pg.evaluate("()=>document.querySelector('#w-playlist-c .info-sheet .sheet-close').click()"); await pg.wait_for_timeout(1000)
    # and the two drawers must not fight: opening the list closes info
    await pg.evaluate("(h)=>{const s=document.getElementById('heightRange');s.value=String(h);s.dispatchEvent(new Event('input',{bubbles:true}));}",240)
    await pg.wait_for_timeout(600)
    await pg.click('#w-playlist-c .h-btn[data-act="info"]'); await pg.wait_for_timeout(1200)
    # Dispatched rather than clicked. An open drawer covers the card, so the
    # list button is genuinely unreachable by pointer while info is up, which is
    # correct: you close one before opening the other. This exercises the code
    # path that guards against BOTH being open, which a pointer cannot reach.
    await pg.evaluate("()=>document.querySelector('#w-playlist-c .h-btn[data-act=\"list\"]').click()")
    await pg.wait_for_timeout(1200)
    st=await pg.evaluate("""()=>{const w=document.querySelector('#w-playlist-c');
      return {info:getComputedStyle(w.querySelector('.info-sheet')).visibility,
              list:getComputedStyle(w.querySelector('.sheet:not(.info-sheet)')).visibility};}""")
    print(f'\n  after opening info then list: {st}')
    if st['info']=='visible': bad.append(('both drawers open at once',st))
    print('  errors:', errs)
    if errs: bad.append(('errors',errs))
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
