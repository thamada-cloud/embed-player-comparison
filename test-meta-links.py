"""Every metadata line that should be a link, is one.

Artist radio and playlist used to render theirs as plain text, on the belief
that a simulated station had no page to open. Their tracks come from the catalog
with ids, so the song and the artist both resolve, and being plain text was
visible: they were the only lines on the page that did not underline on hover.

Two traps this covers:
  a link that EXISTS is not a link that works. The first version of this change
  pointed every idle line at /podcast/undefined-undefined/, because contentUrl
  had no branch for these kinds and fell through to the show builder.
  the in-place writer rebuilds the track line on every change, so the anchor has
  to survive a skip rather than only appear on first render.
"""
import asyncio, json, subprocess, sys, time

PORT = 8787
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
FAILED = 0

async def main():
  bad=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1300,'height':1600})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    Q="""(k)=>{const w=document.querySelector('#w-'+k+'-c');
      const lines=[...w.querySelectorAll('.meta p')].map(pp=>{
        const a=pp.querySelectorAll('a.line-link');
        return {cls:pp.className.split(' ')[0], text:pp.textContent.trim().slice(0,34),
                links:[...a].map(x=>x.getAttribute('href'))};});
      return lines;}"""
    print('=== idle ===')
    for k in ('artist','playlist','live'):
      for L in await pg.evaluate(Q,k):
        print(f"  {k:<9} {L['cls']:<11} {L['text']:<36} {L['links']}")
        # a link that exists is not the same as a link that works: the first
        # version of this pointed every idle line at /podcast/undefined-undefined/
        if not L['links']: bad.append((k,'idle',L['cls'],'no link'))
        for href in L['links']:
          if 'undefined' in (href or '') or (href or '').endswith('//'): bad.append((k,'idle',L['cls'],'broken href',href))
    print()
    print('=== playing (simulated transport) ===')
    for k in ('artist','playlist'):
      await pg.click(f'#w-{k}-c .hero-play'); await pg.wait_for_timeout(2000)
      for L in await pg.evaluate(Q,k):
        print(f"  {k:<9} {L['cls']:<11} {L['text']:<36} {L['links']}")
        if not L['links']: bad.append((k,'playing',L['cls'],'no link'))
        for href in L['links']:
          if 'undefined' in (href or ''): bad.append((k,'playing',L['cls'],'broken href',href))
      # hover underline comes from a.line-link, so assert the class is really there
      u=await pg.evaluate("""(k)=>{const a=document.querySelector('#w-'+k+'-c .h-name a.line-link');
        if(!a) return 'no anchor';
        return getComputedStyle(a).textDecorationLine;}""",k)
      print(f"    {k} track line anchor present, base decoration: {u}")
      if u=='no anchor': bad.append((k,'no anchor on the track line'))
    # skip a track: the link must move with the text
    before=await pg.evaluate("()=>document.querySelector('#w-artist-c .h-name a.line-link').getAttribute('href')")
    await pg.click('#w-artist-c .h-btn[data-act="next"]'); await pg.wait_for_timeout(1500)
    after=await pg.evaluate("()=>{const a=document.querySelector('#w-artist-c .h-name a.line-link');return a?a.getAttribute('href'):'GONE';}")
    print(f"\n  after skip: {after}")
    if after=='GONE': bad.append(('skip','the in-place writer dropped the anchor'))
    if after==before: bad.append(('skip','href did not follow the new track'))
    # the tile uses the same builder, so check it too
    for k in ('artist','playlist','episode','podcast','live'):
      h=await pg.evaluate("(k)=>{const a=document.querySelector('#w-'+k+'-c a.thumb-link');return a?a.getAttribute('href'):null;}",k)
      print(f"  tile link {k:<9} {h}")
      if not h or 'undefined' in h: bad.append((k,'tile link',h))
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
