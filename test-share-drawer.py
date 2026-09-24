"""The share drawer, frame 2709:580630, "350px / Share Drawer", 350 by 166.

The frame is a 64 header over a 16-padded body holding one row of four targets.
Asserted here as the frame's own geometry at the 350 width it is drawn at, plus
the four actions, since three of the four do something and a drawer that looks
right and copies nothing is not the deliverable.

  panel              350 by 166
  header             64 tall, 16 of padding, background ihr_Grey-200
  title              18 / 700 / 24, at x 16
  close              32, a 24 glyph with 4 of padding, right edge at 334
  body               102 tall, 16 of padding
  Icons Buttons      318 wide at 16, 16, gap 8
  Button Group       48 wide, 70 tall, gap 8
  Button Icon        48 circle, white, elevation 1, a 40 glyph
  label              10 / 400 / 14

Two departures from the frame, both deliberate and both written into the source.

  Facebook and X keep a neutral glyph rather than the platforms' own marks.
  Those are trademarks and this is a public repo.

  The title is centred against the close button rather than top-aligned. The
  frame's items-start sits it 4px above centre; centred is what accomplice's
  Drawer does and what the other two drawers on this card do. The tracking is
  -0.5 for the same reason, the component's value over the frame's H5 style.

The frame says nothing about narrow cards. Four 48 circles, three 8 gaps and 32
of padding need 248, so that is asserted as the width it survives down to.
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8801
URL = 'http://localhost:%d/widget.html' % PORT
FAILED = 0

OPEN = """()=>{const w=document.querySelector('#w-podcast-c .widget');
  if(!w.classList.contains('share-open')) w.querySelector('.h-btn[data-act="share"]').click();}"""

READ = """()=>{const w=document.querySelector('#w-podcast-c .widget');
  const P=w.querySelector('.share-panel').getBoundingClientRect();
  const one=(s)=>{const e=w.querySelector(s); if(!e) return null;
    const c=getComputedStyle(e); const b=e.getBoundingClientRect();
    return {h:Math.round(b.height), w:Math.round(b.width),
            y:Math.round(b.top-P.top), x:Math.round(b.left-P.left),
            r:Math.round(b.right-P.left), gap:c.gap, pt:c.paddingTop, pl:c.paddingLeft,
            fs:c.fontSize, lh:c.lineHeight, fw:c.fontWeight, ls:c.letterSpacing,
            bg:c.backgroundColor};};
  return {panel:{h:Math.round(P.height), w:Math.round(P.width)},
    head:one('.share-head'), title:one('.share-head h2'), close:one('.share-close'),
    body:one('.share-body'), row:one('.share-targets'),
    groups:[...w.querySelectorAll('.share-target')].map(e=>{
      const b=e.getBoundingClientRect(); const c=getComputedStyle(e);
      const lbl=e.querySelector('.lbl'); const lc=getComputedStyle(lbl);
      return {label:lbl.textContent, w:Math.round(b.width), h:Math.round(b.height),
              gap:c.gap, ring:Math.round(e.querySelector('.ring').getBoundingClientRect().width),
              glyph:Math.round(e.querySelector('svg').getBoundingClientRect().width),
              fs:lc.fontSize, lh:lc.lineHeight, fw:lc.fontWeight};})};}"""


async def main():
    bad = []

    def ck(label, got, want):
        ok = got == want
        print(f"    {label:<32} {'PASS' if ok else 'FAIL'}  got {got}")
        if not ok:
            bad.append((label, got, want))

    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        ctx = await b.new_context(viewport={'width': 1300, 'height': 1300},
                                  permissions=['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(12000)

        async def width(x):
            await pg.evaluate("(v)=>{const s=document.getElementById('widthRange');"
                              "s.value=String(v);s.dispatchEvent(new Event('input',{bubbles:true}));}", x)
            await pg.wait_for_timeout(500)
            await pg.evaluate(OPEN); await pg.wait_for_timeout(1100)

        await width(350)
        r = await pg.evaluate(READ)
        print('  --- geometry at the frame width')
        ck('panel', [r['panel']['w'], r['panel']['h']], [350, 166])
        ck('header height', r['head']['h'], 64)
        ck('header padding', r['head']['pt'], '16px')
        ck('header background', r['head']['bg'], 'rgb(230, 234, 237)')
        ck('title type', [r['title']['fs'], r['title']['fw'], r['title']['lh']],
           ['18px', '700', '24px'])
        ck('title left edge', r['title']['x'], 16)
        ck('close size', [r['close']['w'], r['close']['h']], [32, 32])
        ck('close right edge', r['close']['r'], 334)
        ck('body height', r['body']['h'], 102)
        ck('body padding', r['body']['pt'], '16px')
        ck('row width', r['row']['w'], 318)
        ck('row origin', [r['row']['x'], r['row']['y']], [16, 80])
        ck('row gap', r['row']['gap'], '8px')
        ck('four targets', [g['label'] for g in r['groups']],
           ['Copy link', 'Facebook', 'X', 'Copy code'])
        for g in r['groups']:
            ck(f"{g['label']} group", [g['h'], g['ring'], g['glyph'], g['gap']],
               [70, 48, 40, '8px'])
            ck(f"{g['label']} label type", [g['fs'], g['fw'], g['lh']], ['10px', '400', '14px'])

        print('  --- actions')
        await pg.click('#w-podcast-c [data-share="copy"]'); await pg.wait_for_timeout(500)
        url = await pg.evaluate("()=>navigator.clipboard.readText()")
        ck('Copy link writes the page url', url.startswith('https://www.iheart.com/podcast/'), True)
        ck('Copy link flashes', await pg.evaluate(
            "()=>document.querySelector('#w-podcast-c [data-share=\"copy\"] .lbl').textContent"), 'Copied!')
        await pg.click('#w-podcast-c [data-share="code"]'); await pg.wait_for_timeout(500)
        code = await pg.evaluate("()=>navigator.clipboard.readText()")
        ck('Copy code writes an iframe', code.startswith('<iframe allow="autoplay"'), True)
        ck('the embed code carries the url', 'iheart.com/podcast/' in code and 'embed=true' in code, True)
        ck('Copy code flashes', await pg.evaluate(
            "()=>document.querySelector('#w-podcast-c [data-share=\"code\"] .lbl').textContent"), 'Copied!')
        hrefs = await pg.evaluate("""()=>({fb:document.querySelector('#w-podcast-c [data-share="facebook"]').href,
            x:document.querySelector('#w-podcast-c [data-share="x"]').href})""")
        ck('facebook target', hrefs['fb'].startswith('https://www.facebook.com/sharer/sharer.php?u=http'), True)
        ck('x target', hrefs['x'].startswith('https://twitter.com/intent/tweet?url=http'), True)

        print('  --- the width it survives down to')
        for W in (248, 280, 500):
            await width(W)
            side = await pg.evaluate("""()=>{const b=document.querySelector('#w-podcast-c .share-body');
                return b.scrollWidth > b.clientWidth + 1;}""")
            ck(f'no sideways scroll at {W}', side, False)

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
