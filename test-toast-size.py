"""The skip-limit toast is pinned to accomplice's SMALL size at every card width.

Accomplice steps the toast up twice as the viewport grows. Notification's title
goes subtitle-2 to h5 and its copy body-4 to body-3 at shmedium, 560, and the
skip-limit caller in apps/listen passes { medium: 'large', xsmall: 'small' }, so
its CTA steps at medium, 769. Neither step is wanted here, so neither is here.
This asserts the small values hold at widths either side of both breakpoints.

The values, read from the accomplice sources and converted from its 10px rem
base to this page's 16px one:

  title   subtitle-2   16 / 600 / 24, letterSpacing[0] = -0.2px
  copy    body-4       14 / 400, letterSpacing[1] = -0.5px, and a 24 line height
                       rather than body-4's 18, because Notification hard-sets
                       lineHeight 2.4rem inline on that span at every breakpoint
  cta     small        32 tall, button-2, 14 / 600 / 16, letterSpacing[0]
  box     root         radius 6, padding 16, min-height 56, capped at the global
                       region's 500

A failure here means either a step crept back in or a token drifted. Check the
value against packages/accomplice/src/components/notification/notification.css.ts
and components/button/size.ts before changing the expectation.
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8795
URL = 'http://localhost:%d/widget.html' % PORT
WIDTHS = (360, 500, 620, 900)
WANT = {
    'title': ('16px', '600', '24px', '-0.2px'),
    'copy':  ('14px', '400', '24px', '-0.5px'),
    'cta':   ('14px', '600', '16px', '-0.2px'),
}
WANT_BOX = {'ctaH': 32, 'radius': '6px', 'pad': '16px', 'minH': '56px', 'maxW': '500px'}
FAILED = 0

READ = """()=>{const t=document.querySelector('#w-artist-c .toast');
  if(!t) return null;
  const g=(s)=>{const e=t.querySelector(s); if(!e) return null; const c=getComputedStyle(e);
    return [c.fontSize,c.fontWeight,c.lineHeight,c.letterSpacing];};
  const c=getComputedStyle(t);
  return {title:g('.toast-title'), copy:g('.toast-copy'), cta:g('.toast-action'),
          ctaH: Math.round(t.querySelector('.toast-action').getBoundingClientRect().height),
          radius:c.borderTopLeftRadius, pad:c.paddingTop, minH:c.minHeight, maxW:c.maxWidth};}"""


async def main():
    bad = []
    def ck(label, got, want):
        ok = got == want
        print(f"    {label:<10} {'PASS' if ok else 'FAIL'}  got {got}")
        if not ok:
            bad.append((label, got, want))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1500, 'height': 1200})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(11000)
        for w in WIDTHS:
            await pg.evaluate("(x)=>{const s=document.getElementById('widthRange');"
                              "s.value=String(x);s.dispatchEvent(new Event('input',{bubbles:true}));}", w)
            await pg.evaluate("()=>{const s=document.getElementById('heightRange');"
                              "s.value='440';s.dispatchEvent(new Event('input',{bubbles:true}));}")
            await pg.wait_for_timeout(700)
            await pg.evaluate("()=>document.querySelector('#w-artist-c').scrollIntoView({block:'center'})")
            await pg.wait_for_timeout(400)
            await pg.click('#w-artist-c .hero-play'); await pg.wait_for_timeout(1200)
            # One more press than the limit, which is what raises the toast.
            for _ in range(7):
                await pg.click('#w-artist-c [data-act="next"]'); await pg.wait_for_timeout(240)
            await pg.wait_for_timeout(600)
            r = await pg.evaluate(READ)
            print(f'  --- card width {w}')
            if not r:
                print('    no toast'); bad.append(('no toast', w, None)); continue
            for k, v in WANT.items():
                ck(k, tuple(r[k]), v)
            for k, v in WANT_BOX.items():
                ck(k, r[k], v)
            # A reload, because the skip count does not reset on its own and the
            # next width needs a card that can still reach the limit.
            await pg.reload(wait_until='load'); await pg.wait_for_timeout(9000)
        print('  errors:', errs)
        if errs:
            bad.append(('page errors', errs, []))
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
