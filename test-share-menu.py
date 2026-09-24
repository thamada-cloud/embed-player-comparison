"""The share button asks what to share, on the two podcast kinds only.

Item sets are production's, from apps/listen:

  podcast   Share Podcast        always          podcast-hero.tsx
            Share Episode        while playing
            Share from {time}    while playing
  episode   Share Episode        always          episode-hero.tsx, which renders
            Share from {time}    while playing     SocialShareEpisode and then
            Share Podcast        always            a Share Podcast item

Both gate the episode-level items on playing, which is the only honest place for
"Share from {time}" since there is no position to name until something plays.

The drawer heading follows the pick, and "Share from {time}" is the exception
that proves it: it hands over the EPISODE url with ?position= on it and is still
titled "Share Episode", because production spreads the episode's own share props
and replaces only the url.

Live radio, artist radio and playlist have no second thing to share, so their
button still opens the drawer directly with the kind's own title.

The label and the link have to name the same second. The position is read once
when the menu opens and carried through the pick, so a menu left standing open
cannot hand over a later second than the one it is showing. Asserted with a
three second pause between drawing the menu and choosing from it.
"""
import asyncio, re, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8803
URL = 'http://localhost:%d/widget.html' % PORT
FAILED = 0

ITEMS = "(k)=>[...document.querySelectorAll('#w-'+k+'-c .ihr-menu button')].map(b=>b.textContent)"
TITLE = "(k)=>{const h=document.querySelector('#w-'+k+'-c .share-head h2'); return h?h.textContent:null;}"
SHEETURL = "(k)=>document.querySelector('#w-'+k+'-c .share-sheet').dataset.url"
OPEN = "(k)=>document.querySelector('#w-'+k+'-c .widget').classList.contains('share-open')"


async def main():
    bad = []

    def ck(label, got, want):
        ok = (want(got) if callable(want) else got == want)
        print(f"    {label:<44} {'PASS' if ok else 'FAIL'}  got {got!r}")
        if not ok:
            bad.append((label, got, want if not callable(want) else '(predicate)'))

    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 1300, 'height': 1400})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(12000)

        print('  --- item sets')
        for kind, idle, playing in (
            ('podcast', ['Share Podcast'],
             ['Share Podcast', 'Share Episode', 'SHAREFROM']),
            ('episode', ['Share Episode', 'Share Podcast'],
             ['Share Episode', 'SHAREFROM', 'Share Podcast']),
        ):
            await pg.click(f'#w-{kind}-c .h-btn[data-act="share"]'); await pg.wait_for_timeout(700)
            ck(f'{kind} at rest', await pg.evaluate(ITEMS, kind), idle)
            ck(f'{kind} at rest opens no drawer', await pg.evaluate(OPEN, kind), False)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click(f'#w-{kind}-c .hero-play'); await pg.wait_for_timeout(2500)
            await pg.click(f'#w-{kind}-c .h-btn[data-act="share"]'); await pg.wait_for_timeout(700)
            got = await pg.evaluate(ITEMS, kind)
            shaped = [('SHAREFROM' if re.fullmatch(r'Share from \d+:\d\d', x) else x) for x in got]
            ck(f'{kind} while playing', shaped, playing)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click(f'#w-{kind}-c .hero-play'); await pg.wait_for_timeout(700)

        print('  --- every pick, on the podcast card while playing')
        await pg.click('#w-podcast-c .hero-play'); await pg.wait_for_timeout(3000)
        for i, (want_title, want_url) in enumerate((
            ('Share Podcast', lambda u: u.endswith('-31090140/')),
            ('Share Episode', lambda u: '/episode/episode-' in u and 'position' not in u),
            ('Share Episode', lambda u: '?position=' in u),
        )):
            await pg.click('#w-podcast-c .h-btn[data-act="share"]'); await pg.wait_for_timeout(700)
            btns = await pg.query_selector_all('#w-podcast-c .ihr-menu button')
            label = (await btns[i].text_content()).strip()
            await btns[i].click(); await pg.wait_for_timeout(1300)
            ck(f'{label!r} title', await pg.evaluate(TITLE, 'podcast'), want_title)
            ck(f'{label!r} url', await pg.evaluate(SHEETURL, 'podcast'), want_url)
            await pg.click('#w-podcast-c .share-close'); await pg.wait_for_timeout(900)

        print('  --- the label and the link name the same second')
        await pg.click('#w-podcast-c .h-btn[data-act="share"]'); await pg.wait_for_timeout(700)
        btns = await pg.query_selector_all('#w-podcast-c .ihr-menu button')
        label = (await btns[2].text_content()).strip()
        await pg.wait_for_timeout(3000)          # leave it standing open
        await btns[2].click(); await pg.wait_for_timeout(1200)
        url = await pg.evaluate(SHEETURL, 'podcast')
        m, sec = re.search(r'Share from (\d+):(\d\d)', label).groups()
        ck('the link carries the second on the label',
           url.split('?position=')[1], str(int(m) * 60 + int(sec)))
        await pg.click('#w-podcast-c .share-close'); await pg.wait_for_timeout(900)
        await pg.click('#w-podcast-c .hero-play'); await pg.wait_for_timeout(600)

        print('  --- the kinds with nothing to choose between')
        for kind, title in (('live', 'Share Station'), ('artist', 'Share Artist Radio'),
                            ('playlist', 'Share Playlist')):
            await pg.click(f'#w-{kind}-c .h-btn[data-act="share"]'); await pg.wait_for_timeout(1200)
            ck(f'{kind} raises no menu', await pg.evaluate(ITEMS, kind), [])
            ck(f'{kind} opens the drawer', await pg.evaluate(OPEN, kind), True)
            ck(f'{kind} title', await pg.evaluate(TITLE, kind), title)
            await pg.click(f'#w-{kind}-c .share-close'); await pg.wait_for_timeout(900)

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
