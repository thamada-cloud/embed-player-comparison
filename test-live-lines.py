"""The live card's three metadata states.

Stations flip between having a track and not, minute to minute, so this pins
both sources rather than waiting for a station to be in the state we want:
currentTrackMeta is forced to 204, the station saying nothing is on air, and
the on-air GraphQL service is allowed or blocked to select the last two cases.

  track on air        station line, then track and artist
  no track, show on   station line, then who is on air
  no track, no show   station name and description, where it always was
"""
import asyncio, json, subprocess, sys, time

PORT = 8781
URL = 'http://localhost:%d/widget.html' % PORT
from playwright.async_api import async_playwright
OUT='/tmp/'
BAD = []

def check(label, r):
    if label.startswith('track'):
        return bool(r['station']) and r['name'] == 'Test Track \u2022 Test Artist'
    if label.startswith('no track, show'):
        return bool(r['station']) and bool(r['name']) and ' \u2022 ' not in (r['name'] or '') \
               and 'iheart.com' in (r['href'] or '')
    # the old fallback: no station line, name and sub carry the station itself
    return r['station'] is None and bool(r['name']) and bool(r['sub'])

TRACK = json.dumps({'title': 'Test Track', 'artist': 'Test Artist',
                    'trackId': 1, 'artistId': 2})

async def run(label, no_track, no_show, shot):
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); pg=await b.new_page(viewport={'width':1200,'height':1400},device_scale_factor=2)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # Pinned in BOTH directions. Letting the first case hit the network made it
    # depend on Z100 happening to be mid-song, and it fails the moment the
    # station goes to a break.
    if no_track:   # 204 is the station saying nothing is on air
        await pg.route('**/live-meta/**', lambda r: asyncio.ensure_future(r.fulfill(status=204, body='')))
    else:
        await pg.route('**/live-meta/**', lambda r: asyncio.ensure_future(
            r.fulfill(status=200, content_type='application/json', body=TRACK)))
    if no_show:
        await pg.route('**/webapi.radioedit.iheart.com/**', lambda r: asyncio.ensure_future(r.abort()))
    await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(10000)
    r=await pg.evaluate("""()=>{const w=document.querySelector('#w-live-c');
      const g=(s)=>{const e=w.querySelector(s); return e?e.textContent.trim():null;};
      return {station:g('.h-station'), name:g('.h-name'), sub:g('.h-sub'),
              href:(w.querySelector('.h-name a')||{}).href||null};}""")
    ok = check(label, r)
    print(('PASS ' if ok else 'FAIL ') + f'{label:<34}', json.dumps(r))
    if errs: print('   errors:', errs); ok = False
    if not ok: BAD.append(label)
    await pg.locator('#w-live-c').screenshot(path=OUT+shot)
    await b.close()
async def main():
  await run('track on air (unchanged)',        False, False, 'live-a-track.png')
  await run('no track, show on air',            True, False, 'live-b-show.png')
  await run('no track, no show (old fallback)', True,  True, 'live-c-idle.png')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    asyncio.run(main())
finally:
    srv.terminate()
print('\n%d failed' % len(BAD)); [print('  FAIL', x) for x in BAD]
sys.exit(1 if BAD else 0)
