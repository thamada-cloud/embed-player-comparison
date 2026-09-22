"""Choosing an episode keeps your place in the list.

render() rebuilds the card with innerHTML and a rebuilt list starts at the top,
so selecting an episode used to throw away where you had scrolled to. On a show
with hundreds of episodes that means scrolling back from the top every time you
play something.

Two traps this test works around, both of which made an earlier version of it
pass without proving anything:

  Playwright scrolls a target into view before clicking it, so clicking a row
  that is off screen moves the list and the test then measures its own side
  effect. It only ever clicks a row that is already fully visible.

  If the click misses, nothing re-renders and the scroll position survives for
  the wrong reason. So it also asserts the episode actually changed.
"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8783
URL = 'http://localhost:%d/widget.html' % PORT
bad = []

VISIBLE = """(sel) => {
  const r = document.querySelector(sel);
  const box = r.getBoundingClientRect();
  const rows = [...r.querySelectorAll('.row[data-act="row"]')];
  const i = rows.findIndex(x => { const b = x.getBoundingClientRect();
    return b.top >= box.top - 1 && b.bottom <= box.bottom + 1; });
  return {index: i, top: Math.round(r.scrollTop), max: r.scrollHeight - r.clientHeight};
}"""
TITLE = "() => { const e = document.querySelector('#w-podcast-c .h-ep'); return e ? e.textContent.trim() : null; }"

async def height(pg, h):
    await pg.evaluate("""(h) => { const s = document.getElementById('heightRange');
      s.value = String(h); s.dispatchEvent(new Event('input', {bubbles: true})); }""", h)
    await pg.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1100, 'height': 1500})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load')
        await pg.wait_for_timeout(10000)

        async def case(label, sel, rowsel, reopen=None):
            # Halfway down, so a reset to the top is unmistakable.
            await pg.evaluate("""(s) => { const r = document.querySelector(s);
              r.scrollTop = Math.round((r.scrollHeight - r.clientHeight) / 2);
              r.dispatchEvent(new Event('scroll')); }""", sel)
            await pg.wait_for_timeout(400)
            st = await pg.evaluate(VISIBLE, sel)
            if st['index'] < 0:
                bad.append((label, 'no fully visible row to click, test proved nothing'))
                return
            before, t0 = st['top'], await pg.evaluate(TITLE)
            await pg.locator(rowsel).nth(st['index']).click()
            await pg.wait_for_timeout(1800)
            if reopen:
                await reopen()
            after = await pg.evaluate("(s) => Math.round(document.querySelector(s).scrollTop)", sel)
            t1 = await pg.evaluate(TITLE)
            print('%-22s scrolled %3d of %3d -> %3d   episode %s'
                  % (label, before, st['max'], after, 'changed' if t0 != t1 else 'DID NOT CHANGE'))
            if t0 == t1:
                bad.append((label, 'the click did not change the episode, so nothing re-rendered'))
            if after != before:
                bad.append((label, 'lost the scroll position', before, after))

        await height(pg, 600)
        await case('inline list at 600', '#w-podcast-c .list .rows',
                   '#w-podcast-c .list .row[data-act="row"]')

        await height(pg, 240)
        await pg.click('#w-podcast-c .h-btn[data-act="list"]')
        await pg.wait_for_timeout(1000)
        async def reopen():
            # Choosing from the drawer closes it, so reopen to read the list back.
            await pg.click('#w-podcast-c .h-btn[data-act="list"]')
            await pg.wait_for_timeout(1000)
        await case('drawer at 240', '#w-podcast-c .sheet .rows',
                   '#w-podcast-c .sheet .row[data-act="row"]', reopen)

        if errs:
            bad.append(('page errors', errs))
        await b.close()
    print('\n%d failed' % len(bad))
    for x in bad:
        print('  FAIL', x)
    if bad:
        sys.exit(1)

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
