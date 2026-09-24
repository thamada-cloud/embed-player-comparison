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
                        delete main.dataset.h;
                        /* Auto keeps the container and gives each card its own
                           published default, so this mirrors the button rather
                           than unmarking the shells the way it used to. */
                        document.querySelectorAll('section[data-design="c"]').forEach((sec) => {
                          const s = sec.querySelector('.shell'); if (!s) return;
                          s.dataset.fill = '';
                          s.style.setProperty('--player-h', embedHeight({ kind: sec.dataset.kind }) + 'px');
                        });
                        return; }
      document.documentElement.style.setProperty('--player-h', h + 'px');
      main.dataset.h = 'on';
      /* The compression rules key off the shell now, not the page, so the same
         marker the height control sets has to be set here too. And the per-shell
         height Auto leaves behind has to be cleared, exactly as applyHeight does:
         an inline --player-h on the shell beats the one on the root, so without
         this every card stayed at its Auto default however this was called. */
      document.querySelectorAll('section[data-design="c"] .shell')
        .forEach((s) => { s.dataset.fill = ''; s.style.removeProperty('--player-h'); });
    }""", h)
    pg.wait_for_timeout(120)

def set_listat(pg, mode):
    """Which List mode the card is in.

    Every block below that asserts a stepped threshold has to say `300` out
    loud. It used to be the default and these read it implicitly; the default is
    `figma` now, whose list opens at 161 and glides rather than stepping, so an
    implicit read asserted one mode's numbers against another's. Naming the mode
    is also just better: a test of the 300 threshold should not change meaning
    when somebody changes which toggle is pressed on load.
    """
    pg.evaluate("(m) => { document.documentElement.dataset.listat = m; }", mode)
    pg.wait_for_timeout(300)


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
    # Stated, not assumed. Everything below is the 300 threshold's numbers.
    set_listat(pg, '300')
    set_height(pg, None)
    b = boxes(pg, "#w-podcast-c")
    # 263, not 234. The stage no longer derives its height from its width: the
    # 16:9 rule is gone, because a slot hands a card a width and a height
    # independently and a card deriving one from the other can only honour one.
    # 263 is what every 350px Design D frame draws.
    # 300, not 263. The card defaults to the height iHeart publishes for its
    # content type through its oEmbed endpoint, 300 for a show, rather than to
    # the 263 its Figma frame is drawn at. See EMBED_H in widget-core.js.
    check("auto, podcast card is iHeart's published 300", b["card"], 300)
    # The stage is no longer the whole card in Auto. Auto now sets the card's own
    # published default as a real height, so the 300 threshold matches and the
    # inline list takes its 128 minimum out of the card, leaving 172 of stage.
    # Auto used to leave the shell without a size container, so no height query
    # matched and the list stayed a drawer however tall the card was.
    # 100 and 172, not 136 and 208. The episode list has no heading any more, so
    # 36 of its fixed height went with it: a 32 header and the 4 gap under it.
    # The rows are untouched, still 72 each with a 16 peek under the last, and
    # the 36 comes back to the player. See --list-fix in the stylesheet. The
    # artist and playlist lists keep their heading and so keep 136 and 208.
    check("auto, podcast stage is the card less the inline list", b["stage"], 200)
    check("auto, inline list is 100, one row plus the peek", b["list"], 100)
    check("auto, list icon is gone, same as typing 300", b["icon"], "none")

    for h in (234, 260, 299):
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
    # The lockup words stay at EVERY width now. They used to be hidden under 239,
    # which removed half the attribution, and the attribution is the point of the
    # embed on someone else's page. This asserts the opposite of what it used to.
    check("at 220 wide the lockup keeps its words",
          pg.evaluate("""() => { const w = document.querySelector('#w-podcast-c .ihr-lockup span');
                                 return w ? getComputedStyle(w).display : 'no-span'; }"""), "block")
    pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
    set_height(pg, None)

def inline(pg):
    print("\n--- Task 2, the inline list above 300 ---")
    set_listat(pg, '300')
    set_height(pg, 440)
    b = boxes(pg, "#w-podcast-c")
    check("at 440, card is exactly 440 not 454", b["card"], 440)
    check("at 440, stage is 268", b["stage"], 268)
    # 136 and 208, not 128..220. The list snaps to whole rows plus a constant
    # 16px peek now, so it takes two values instead of gliding. Gliding made
    # the peek an accident of where the clamp landed: 8px at a 300 card and
    # 2px at 400, which read as no peek at all.
    check("at 440, inline list is 172, two rows plus the peek", b["list"], 172)
    check("at 440, list icon is gone", b["icon"], "none")

    # One pixel under the threshold, nothing has changed.
    set_height(pg, 299)
    b = boxes(pg, "#w-podcast-c")
    check("at 299, card is 299", b["card"], 299)
    check("at 299, inline list is hidden", b["list"], "none")
    check("at 299, list icon is shown", b["icon"], 32)

    # The threshold itself. A fixed 220 list cannot fit here, so the list shrinks
    # with the card between 300 and 440: 128 at the bottom, 220 at the top.
    set_height(pg, 300)
    b = boxes(pg, "#w-podcast-c")
    check("at 300, card is exactly 300", b["card"], 300)
    check("at 300, list is 100, one row plus the peek", b["list"], 100)
    check("at 300, stage clears its 136 floor", b["stage"] >= 136, True)
    check("at 300, list icon is gone", b["icon"], "none")

    # 392 and 692, the card less the 208 list. They were 380 and 680 against the
    # old 220.
    # 428 and 728, the card less the 172 list.
    for h, stage in ((600, 428), (900, 728)):
        set_height(pg, h)
        b = boxes(pg, "#w-podcast-c")
        check("at %d, card is %d" % (h, h), b["card"], h)
        check("at %d, stage is %d" % (h, stage), b["stage"], stage)
        check("at %d, list holds 172" % h, b["list"], 172)
        check("at %d, list icon is gone" % h, b["icon"], "none")

    for h in (440, 900):
        set_height(pg, h)
        b = boxes(pg, "#w-live-c")
        check("live at %d, stage takes the whole card" % h, b["stage"], h)
        check("live at %d, no inline list" % h, b["list"], None)

    # 260, not 300. 300 is above the threshold now, so the list is inline there
    # and the button that opens the drawer is deliberately gone.
    set_height(pg, 260)
    pg.click('#w-podcast-c .h-btn[data-act="list"]'); pg.wait_for_timeout(900)
    check("below 300 the drawer still opens",
          pg.evaluate("""() => { const s = document.querySelector('#w-podcast-c .sheet:not(.info-sheet)');
                                 return getComputedStyle(s).visibility; }"""), "visible")
    pg.click('#w-podcast-c .sheet-close'); pg.wait_for_timeout(900)
    set_height(pg, None)
    set_listat(pg, 'figma')

def control(pg):
    print("\n--- Task 3, the height control ---")
    pg.reload(); pg.wait_for_timeout(4500)
    # After the reload, since a reload puts the page back on its default mode.
    set_listat(pg, '300')
    pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
    pg.wait_for_timeout(200)

    check("control exists", pg.evaluate("!!document.getElementById('heightRange')"), True)
    check("defaults to Auto, main carries no explicit height",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("defaults to Auto, card is 300", boxes(pg, "#w-podcast-c")["card"], 300)
    # Auto is a size container too now, carrying each card's own published
    # default on its shell. It used to unmark the shells, which left no size
    # container at all: Auto said 300 and behaved like nothing, so the inline
    # list never appeared until a height was typed in.
    check("Auto still marks the shells, so height queries apply",
          pg.evaluate("() => document.querySelector('section[data-design=c] .shell').hasAttribute('data-fill')"),
          True)
    check("Auto gives the podcast shell its own 300",
          pg.evaluate("() => document.querySelector('section[data-design=c][data-kind=podcast] .shell')"
                      ".style.getPropertyValue('--player-h')"), "300px")
    check("Auto gives the live shell its own 200",
          pg.evaluate("() => document.querySelector('section[data-design=c][data-kind=live] .shell')"
                      ".style.getPropertyValue('--player-h')"), "200px")
    check("Auto shows the inline list, same as typing 300",
          boxes(pg, "#w-podcast-c")["list"], 100)
    # 50, not 100. Lowered so a slot smaller than the card's own floor can be
    # looked at; the card still floors and the slot clips below that.
    check("range floor is 50", pg.evaluate("document.getElementById('heightRange').min"), "50")
    check("range ceiling is 900",
          pg.evaluate("document.getElementById('heightRange').max"), "900")

    pg.evaluate("""() => { const r = document.getElementById('heightRange');
      r.value = '600'; r.dispatchEvent(new Event('input', {bubbles: true})); }""")
    pg.wait_for_timeout(200)
    check("set to 600, card is 600", boxes(pg, "#w-podcast-c")["card"], 600)
    check("set to 600, number field says 600",
          pg.evaluate("document.getElementById('heightNum').value"), "600")

    pg.click("#heightAuto"); pg.wait_for_timeout(250)
    check("Auto clears the explicit-height flag",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("Auto restores the 300 default", boxes(pg, "#w-podcast-c")["card"], 300)
    check("Auto clears the ROOT custom property",
          pg.evaluate("document.documentElement.style.getPropertyValue('--player-h')"), "")
    # and puts the per-card default on the shell instead, which is what makes
    # Auto and typing 300 render the same thing.
    check("Auto puts 300 back on the podcast shell",
          pg.evaluate("() => document.querySelector('section[data-design=c][data-kind=podcast] .shell')"
                      ".style.getPropertyValue('--player-h')"), "300px")
    check("Auto shows the inline list again", boxes(pg, "#w-podcast-c")["list"], 100)

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
