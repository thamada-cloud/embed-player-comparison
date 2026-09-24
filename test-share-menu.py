"""The share button asks what to share, on the two podcast kinds only.

Item sets are production's, from apps/listen:

  podcast   Share Podcast        always          podcast-hero.tsx
            Share Episode        always
            Share from {time}    while playing
  episode   Share Episode        always          episode-hero.tsx, which renders
            Share from {time}    while playing     SocialShareEpisode and then
            Share Podcast        always            a Share Podcast item

Only "Share from {time}" waits for playback, since there is no position to name
until something is playing. That is one step away from production, which also
gates Share Episode on the podcast hero, and the reason is that iheart.com's
show page has no episode selected until you start one. This card always has one:
its top bar shows an episode title before you press anything and the list marks
which row it is. Gating it made the podcast player's menu a single item while
the episode player's had two, for no reason a viewer could see.

Every row carries accomplice's Share glyph at 18, which is what ShareMenuItem
draws when it is passed `icon`, and every caller passes it. The row overflow is
asserted mixed, share with a glyph and View Episode Info without, because
go-to-episode-link.tsx renders a plain MenuItem.

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

ITEMS = ("(k)=>[...document.querySelectorAll('#w-'+k+'-c .ihr-menu button')]"
         ".map(b=>b.querySelector('.mi-label').textContent)")
GLYPHS = ("(k)=>[...document.querySelectorAll('#w-'+k+'-c .ihr-menu button')].map(b=>{"
          "const s=b.querySelector('.mi-icon svg'); if(!s) return 'none';"
          "const r=s.getBoundingClientRect();"
          "return Math.round(r.width)+'x'+Math.round(r.height);})")
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
            ('podcast', ['Share Podcast', 'Share Episode'],
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
            ck(f'{kind} every row carries the Share glyph at 18',
               await pg.evaluate(GLYPHS, kind), ['18x18'] * len(playing))
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

        print('  --- the episode row overflow, which production draws mixed')
        await pg.evaluate("()=>{const s=document.getElementById('heightRange');"
                          "s.value='600';s.dispatchEvent(new Event('input',{bubbles:true}));}")
        await pg.wait_for_timeout(700)
        await pg.click('#w-podcast-c .list .row-more'); await pg.wait_for_timeout(700)
        ck('row overflow items', await pg.evaluate(ITEMS, 'podcast'),
           ['View Episode Info', 'Share Episode'])
        ck('share has a glyph, info does not',
           await pg.evaluate(GLYPHS, 'podcast'), ['none', '18x18'])
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        print('  --- the speed menu is untouched by the glyph column')
        await pg.click('#w-podcast-c .hero-play'); await pg.wait_for_timeout(2200)
        await pg.click('#w-podcast-c .h-btn[data-act="speed"]'); await pg.wait_for_timeout(700)
        ck('speed items carry no glyph', set(await pg.evaluate(GLYPHS, 'podcast')), {'none'})
        ck('speed items still read back', await pg.evaluate(ITEMS, 'podcast'),
           lambda v: len(v) == 5 and v[1] == '1x')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.click('#w-podcast-c .hero-play'); await pg.wait_for_timeout(600)
        await pg.evaluate("()=>{const s=document.getElementById('heightRange');"
                          "s.value='420';s.dispatchEvent(new Event('input',{bubbles:true}));}")
        await pg.wait_for_timeout(600)

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
