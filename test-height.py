"""Verification for design C responsive height.

Run one group or all of them:
    python3 test-height.py fill
    python3 test-height.py inline
    python3 test-height.py control
    python3 test-height.py all

Serves the repo on 8777 itself, so nothing needs starting first.
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8777
URL = "http://localhost:%d/widget.html" % PORT
WIDE = {"width": 1500, "height": 1200}

fails = []

def check(label, got, want):
    ok = got == want
    print("%-58s %s   got %r want %r" % (label, "PASS" if ok else "FAIL", got, want))
    if not ok:
        fails.append(label)

def set_height(pg, h):
    """The contract. None means Auto."""
    pg.evaluate("""(h) => {
      const main = document.querySelector('main');
      if (h === null) { document.documentElement.style.removeProperty('--player-h');
                        delete main.dataset.h; return; }
      document.documentElement.style.setProperty('--player-h', h + 'px');
      main.dataset.h = 'on';
    }""", h)
    pg.wait_for_timeout(120)

def boxes(pg, sel):
    return pg.evaluate("""(sel) => {
      const root = document.querySelector(sel);
      const h = (s) => { const e = root.querySelector(s);
        if (!e) return null;
        const cs = getComputedStyle(e);
        if (cs.display === 'none') return 'none';
        return Math.round(e.getBoundingClientRect().height); };
      const shell = root.closest('.shell') || root.parentElement;
      return { shell: Math.round(shell.getBoundingClientRect().height),
               card: h('.widget'), stage: h('.stage'), list: h('.list'),
               icon: h('.h-btn[data-act="list"]') };
    }""", sel)

def fill(pg):
    print("\n--- Task 1, fills the slot ---")
    set_height(pg, None)
    b = boxes(pg, "#w-podcast-c")
    # 263, not 234. The stage no longer derives its height from its width: the
    # 16:9 rule is gone, because a slot hands a card a width and a height
    # independently and a card deriving one from the other can only honour one.
    # 263 is what every 350px Design D frame draws.
    check("auto, podcast card is its natural 263", b["card"], 263)
    check("auto, podcast stage is its natural 263", b["stage"], 263)
    check("auto, list icon is shown", b["icon"], 32)

    for h in (234, 300, 439):
        set_height(pg, h)
        b = boxes(pg, "#w-podcast-c")
        check("podcast at %d, card is %d" % (h, h), b["card"], h)
        check("podcast at %d, stage is %d" % (h, h), b["stage"], h)
        check("podcast at %d, list icon still shown" % h, b["icon"], 32)

    set_height(pg, 150)
    b = boxes(pg, "#w-podcast-c")
    check("podcast at 150, shell is 150", b["shell"], 150)
    # 150 now fits outright. The chrome interpolates between the two frames that
    # exist, 350x263 and 350x147, so at a short slot the thumbnail is 40 rather
    # than 48 and the top bar shrinks with it. The floor is 136.
    check("podcast at 150, card fits, no floor hit", b["card"], 150)
    # overflow:hidden still reports scrollHeight past clientHeight, so the
    # honest assertion is that the box is 150 and nothing can be scrolled to.
    check("podcast at 150, shell clips",
          pg.evaluate("""() => { const s = document.querySelector('#w-podcast-c').closest('.shell');
                                 return [getComputedStyle(s).overflow, s.clientHeight, s.scrollTop]; }"""),
          ["hidden", 150, 0])

    for h in (150, 300, 900):
        set_height(pg, h)
        b = boxes(pg, "#w-live-c")
        check("live at %d, stage is %d" % (h, max(h, 136)), b["stage"], max(h, 136))
        check("live at %d, no list icon" % h, b["icon"], None)

    # The design B check that used to live here is gone with design B. It is
    # commented out of the page, so the roster never builds a hero widget and
    # #w-podcast-hero does not exist to measure.

    set_height(pg, 300)
    pg.evaluate("document.documentElement.style.setProperty('--player-w','220px')")
    pg.wait_for_timeout(150)
    check("width query still fires at 220 wide, lockup words hidden",
          pg.evaluate("""() => { const w = document.querySelector('#w-podcast-c .ihr-lockup span');
                                 return w ? getComputedStyle(w).display : 'no-span'; }"""), "none")
    pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
    set_height(pg, None)

def inline(pg):
    print("\n--- Task 2, the inline list above 440 ---")
    set_height(pg, 440)
    b = boxes(pg, "#w-podcast-c")
    check("at 440, card is exactly 440 not 454", b["card"], 440)
    check("at 440, stage is 220", b["stage"], 220)
    check("at 440, inline list is 220", b["list"], 220)
    check("at 440, list icon is gone", b["icon"], "none")

    set_height(pg, 439)
    b = boxes(pg, "#w-podcast-c")
    check("at 439, card is 439", b["card"], 439)
    check("at 439, inline list is hidden", b["list"], "none")
    check("at 439, list icon is shown", b["icon"], 32)

    for h, stage in ((600, 380), (900, 680)):
        set_height(pg, h)
        b = boxes(pg, "#w-podcast-c")
        check("at %d, card is %d" % (h, h), b["card"], h)
        check("at %d, stage is %d" % (h, stage), b["stage"], stage)
        check("at %d, list holds 220" % h, b["list"], 220)
        check("at %d, list icon is gone" % h, b["icon"], "none")

    for h in (440, 900):
        set_height(pg, h)
        b = boxes(pg, "#w-live-c")
        check("live at %d, stage takes the whole card" % h, b["stage"], h)
        check("live at %d, no inline list" % h, b["list"], None)

    set_height(pg, 300)
    pg.click('#w-podcast-c .h-btn[data-act="list"]'); pg.wait_for_timeout(900)
    check("below 440 the drawer still opens",
          pg.evaluate("""() => { const s = document.querySelector('#w-podcast-c .sheet:not(.info-sheet)');
                                 return getComputedStyle(s).visibility; }"""), "visible")
    pg.click('#w-podcast-c .sheet-close'); pg.wait_for_timeout(900)
    set_height(pg, None)

def control(pg):
    print("\n--- Task 3, the height control ---")
    pg.reload(); pg.wait_for_timeout(4500)
    pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
    pg.wait_for_timeout(200)

    check("control exists", pg.evaluate("!!document.getElementById('heightRange')"), True)
    check("defaults to Auto, no flag set",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("defaults to Auto, card is its natural 263",
          boxes(pg, "#w-podcast-c")["card"], 263)
    check("range floor is the shipped homepage 150",
          pg.evaluate("document.getElementById('heightRange').min"), "150")
    check("range ceiling is 900",
          pg.evaluate("document.getElementById('heightRange').max"), "900")

    pg.evaluate("""() => { const r = document.getElementById('heightRange');
      r.value = '600'; r.dispatchEvent(new Event('input', {bubbles: true})); }""")
    pg.wait_for_timeout(200)
    check("set to 600, card is 600", boxes(pg, "#w-podcast-c")["card"], 600)
    check("set to 600, number field says 600",
          pg.evaluate("document.getElementById('heightNum').value"), "600")

    pg.click("#heightAuto"); pg.wait_for_timeout(250)
    check("Auto clears the flag",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("Auto restores the natural 263", boxes(pg, "#w-podcast-c")["card"], 263)
    check("Auto clears the custom property",
          pg.evaluate("document.documentElement.style.getPropertyValue('--player-h')"), "")

    pg.evaluate("""() => { const n = document.getElementById('heightNum');
      n.value = '9999'; n.dispatchEvent(new Event('change', {bubbles: true})); }""")
    pg.wait_for_timeout(200)
    check("typing 9999 clamps to 900", boxes(pg, "#w-podcast-c")["card"], 900)
    pg.click("#heightAuto"); pg.wait_for_timeout(250)

GROUPS = {"fill": fill, "inline": inline, "control": control}

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(channel="chrome")
            pg = b.new_page(viewport=WIDE)
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
            pg.goto(URL); pg.wait_for_timeout(4500)
            # Pin the width for the whole run. Design C's stage is 16:9 when no
            # height is set, so its natural height is a function of the column
            # width, and the column width changes with the layout. Every "natural
            # 234" below is 234 only at this width; unpinned, the same assertions
            # read 352 in a two column page and would have to be rewritten
            # whenever the page's columns change.
            pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
            pg.wait_for_timeout(200)
            for name, fn in GROUPS.items():
                if which in ("all", name):
                    fn(pg)
            check("no page errors", errs, [])
            b.close()
    finally:
        srv.terminate()
    print("\n%d checks failed" % len(fails))
    for f in fails:
        print("  FAIL", f)
    sys.exit(1 if fails else 0)

main()
