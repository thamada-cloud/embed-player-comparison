# Design C Responsive Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design C fills the height its slot gives it, showing the episode list inline above 440px and keeping the drawer below it.

**Architecture:** Pure CSS. `.shell` gains `container-type: size` and an explicit height only when the prototype page sets one, so the default path is untouched. One `@container (min-height: 440px)` rule swaps the list treatment. Design C's markup gains the inline list design B already uses, so both list forms sit in the DOM and CSS shows one. No JavaScript in the card, no re-render on resize.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step. Tests are Playwright measurement scripts against local headless Chrome, matching the project's existing `measure.py` and `diagnose.py` convention.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-21-design-c-responsive-height-design.md`. Read it before starting.
- **Scope is design C only.** Design B stays frozen at 444. Design A is commented out and is not touched. The shipping embeds are not touched.
- **The default path must not change.** With no height set, every card measures exactly as it does today. This is the primary regression guard.
- This repo runs a **16px rem base**; accomplice runs 10px. Every ported value is written in px.
- **No en-dashes, no em-dashes, no prose colons** in any comment, commit message or document.
- Comments in this codebase explain *why*, and record what was measured and what was rejected. Match that. Do not write comments that restate the code.
- Deploy with `./deploy.sh "<message>"` only in Task 4. It commits, pushes, stamps cache-bust versions and waits for Pages.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `widget-core.css` | All card styling | Add a fixed-height block near the design C rules at line 740 |
| `widget-core.js` | All card markup and behaviour | One line added to `cMarkup`, emitting the inline list |
| `widget.html` | Prototype page chrome and controls | Height control markup and its listener |
| `test-height.py` | Verification | New. Playwright checks for every spec assertion |

`embed.html` and `host-home.html` are **not** touched. The height control lives on the prototype page only, which is what the spec scopes.

## The contract between the page and the card

Both the test and the height control set the same two things, and nothing else:

```js
document.documentElement.style.setProperty('--player-h', px + 'px');
document.querySelector('main').dataset.h = 'on';
```

Auto means removing both. The CSS keys off `main[data-h="on"]`, because `container-type` cannot be made conditional on a custom property's value.

---

### Task 1: Design C fills the slot

The card takes the height it is given, across the drawer range. No list changes yet.

**Files:**
- Create: `test-height.py`
- Modify: `widget-core.css` (new block after line 741, `.widget.c .hero-controls { top: ... }`)

**Interfaces:**
- Produces: the `--player-h` + `main[data-h="on"]` contract above, consumed by Task 2's container query and Task 3's control.
- Produces: `test-height.py` with `run(name)` dispatch, extended by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `test-height.py`:

```python
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
    """Card, stage and list heights for one section, plus list-icon visibility."""
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
    # 1. Auto is unchanged from today
    set_height(pg, None)
    b = boxes(pg, "#w-podcast-c")
    check("auto, podcast card is its natural 234", b["card"], 234)
    check("auto, podcast stage is its natural 234", b["stage"], 234)
    check("auto, list icon is shown", b["icon"], 32)

    # 2. The drawer range fills the slot exactly
    for h in (234, 300, 439):
        set_height(pg, h)
        b = boxes(pg, "#w-podcast-c")
        check("podcast at %d, card is %d" % (h, h), b["card"], h)
        check("podcast at %d, stage is %d" % (h, h), b["stage"], h)
        check("podcast at %d, list icon still shown" % h, b["icon"], 32)

    # 3. The 234 floor holds and the shell clips below it
    set_height(pg, 150)
    b = boxes(pg, "#w-podcast-c")
    check("podcast at 150, shell is 150", b["shell"], 150)
    check("podcast at 150, card holds the 234 floor", b["card"], 234)
    check("podcast at 150, shell clips rather than scrolls",
          pg.evaluate("""() => { const s = document.querySelector('#w-podcast-c').closest('.shell');
                                 return s.scrollHeight <= s.clientHeight + 1; }"""), True)

    # 4. Live has no list at any height and fills the same way
    for h in (150, 300, 900):
        set_height(pg, h)
        b = boxes(pg, "#w-live-c")
        check("live at %d, stage is %d" % (h, max(h, 234)), b["stage"], max(h, 234))
        check("live at %d, no list icon" % h, b["icon"], None)

    # 5. Design B is untouched at every height
    set_height(pg, 600)
    check("design B stays 444 while C responds", boxes(pg, "#w-podcast-hero")["card"], 444)

    # 6. The existing width container query still fires after container-type changes
    set_height(pg, 300)
    pg.evaluate("document.documentElement.style.setProperty('--player-w','220px')")
    pg.wait_for_timeout(150)
    check("width query still fires at 220 wide, lockup words hidden",
          pg.evaluate("""() => { const w = document.querySelector('#w-podcast-c .ihr-lockup span');
                                 return w ? getComputedStyle(w).display : 'no-span'; }"""), "none")
    pg.evaluate("document.documentElement.style.removeProperty('--player-w')")
    set_height(pg, None)

GROUPS = {"fill": fill}

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 test-height.py fill`

Expected: the three `auto` checks PASS (nothing has changed yet), and every height check FAILs. At 300 the card reports **231**, not 300, because `aspect-ratio: 16 / 9` still governs it. That specific number is the confirmation you are testing the right thing.

- [ ] **Step 3: Write the CSS**

In `widget-core.css`, immediately after the existing line `.widget.c .hero-controls { top: calc(50% + .5px); }` (line 741), add:

```css
/* ---------------------------------------------------------------------------
   Design C given a height.

   A publisher slot hands a card a fixed width AND a fixed height, and until now
   every card here reported the height it wanted and the page obliged. The
   shipping embed does not do this either: measured at 411 wide it draws one
   layout 520 tall and lets the frame clip whatever does not fit, which is why
   the shipped homepage slot at 150 renders its whole episode list below the
   fold where nobody can see it. The first episode row starts at y=201.

   The flag is an attribute rather than the presence of --player-h, because
   container-type cannot be made conditional on a custom property's value.

   container-type: size, not inline-size. It queries BOTH axes, so every width
   query already written here keeps working untouched; the only reason it needs
   a definite height is that a size container may not take its height from its
   contents, which is exactly what a fixed slot is.

   aspect-ratio and max-height are dropped at EVERY height, not only above the
   threshold. They are what makes the card refuse the slot: at a 300 slot a
   stage still governed by 16 / 9 is 231 at 411 wide and leaves 69px of dead
   space under it, which is the whole defect. They still govern design C when no
   height is set, which is the page's default and every case shipping today.

   min-height: 234 stays. It is the floor protecting the centred control row
   from the 48px top bar and the 40px bottom bar; the true collision point is
   168 and 234 carries 66px of deliberate slack. A shorter slot clips, which is
   what the shipping widget already does at every height, now with an honest
   minimum rather than at any size at all. */
main[data-h="on"] section[data-design="c"] .shell {
  container-type: size; height: var(--player-h); overflow: hidden;
}
main[data-h="on"] section[data-design="c"] .widget.c { height: 100%; }
main[data-h="on"] section[data-design="c"] .widget.c .stage {
  aspect-ratio: auto; max-height: none; flex: 1 1 auto;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 test-height.py fill`

Expected: `0 checks failed`.

If "no page errors" fails, read the error before touching anything else. If the width query check fails, `container-type: size` has not applied and the shell has no definite height.

- [ ] **Step 5: Commit**

```bash
git add test-height.py widget-core.css
git commit -m "Design C fills the height its slot gives it

aspect-ratio and max-height are dropped whenever a height is set, not
only above the threshold: at a 300 slot a stage still governed by 16/9
is 231 at 411 wide and leaves 69px of dead space. The 234 floor stays
and a shorter slot clips.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The inline list above 440

**Files:**
- Modify: `widget-core.js` line 675, inside `cMarkup`
- Modify: `widget-core.css`, appended to the block added in Task 1
- Modify: `test-height.py`, add `inline()` and register it in `GROUPS`

**Interfaces:**
- Consumes: `main[data-h="on"]` and the `.shell` size container from Task 1.
- Consumes: `listMarkup(d)` at `widget-core.js:520`, already used by `heroMarkup` at line 585. Signature unchanged, no new component.

- [ ] **Step 1: Write the failing test**

In `test-height.py`, add this function above `GROUPS`:

```python
def inline(pg):
    print("\n--- Task 2, the inline list above 440 ---")
    # The threshold itself. 440, not 454: this is the floor conflict.
    set_height(pg, 440)
    b = boxes(pg, "#w-podcast-c")
    check("at 440, card is exactly 440 not 454", b["card"], 440)
    check("at 440, stage is 220", b["stage"], 220)
    check("at 440, inline list is 220", b["list"], 220)
    check("at 440, list icon is gone", b["icon"], "none")

    # One pixel below it, nothing has changed
    set_height(pg, 439)
    b = boxes(pg, "#w-podcast-c")
    check("at 439, card is 439", b["card"], 439)
    check("at 439, inline list is hidden", b["list"], "none")
    check("at 439, list icon is shown", b["icon"], 32)

    # Above it the stage absorbs and the list does not
    for h, stage in ((600, 380), (900, 680)):
        set_height(pg, h)
        b = boxes(pg, "#w-podcast-c")
        check("at %d, card is %d" % (h, h), b["card"], h)
        check("at %d, stage is %d" % (h, stage), b["stage"], stage)
        check("at %d, list holds 220" % h, b["list"], 220)
        check("at %d, list icon is gone" % h, b["icon"], "none")

    # Live has no list at any height, threshold or not
    for h in (440, 900):
        set_height(pg, h)
        b = boxes(pg, "#w-live-c")
        check("live at %d, stage takes the whole card" % h, b["stage"], h)
        check("live at %d, no inline list" % h, b["list"], None)

    # The drawer still works below the threshold
    set_height(pg, 300)
    pg.click('#w-podcast-c .h-btn[data-act="list"]'); pg.wait_for_timeout(900)
    check("below 440 the drawer still opens",
          pg.evaluate("""() => { const s = document.querySelector('#w-podcast-c .sheet:not(.info-sheet)');
                                 return getComputedStyle(s).visibility; }"""), "visible")
    pg.click('#w-podcast-c .sheet-close'); pg.wait_for_timeout(900)
    set_height(pg, None)

GROUPS = {"fill": fill, "inline": inline}
```

Replace the existing `GROUPS = {"fill": fill}` line with the one above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 test-height.py inline`

Expected: `at 440, card is exactly 440 not 454` FAILs reporting **454**. That is the floor conflict the spec predicts, and seeing 454 here confirms the test is real. Every `list` check FAILs with `None`, because design C emits no inline list yet.

- [ ] **Step 3: Emit the inline list**

In `widget-core.js`, find line 675 in `cMarkup`:

```js
          ${isLive ? '' : sheetMarkup(d)}
        </div>
```

Replace those two lines with:

```js
          ${isLive ? '' : sheetMarkup(d)}
        </div>
        ${isLive ? '' : listMarkup(d)}
```

Note the placement. `sheetMarkup` sits INSIDE `.stage` because the drawer overlays the artwork; `listMarkup` goes after the closing `</div>` so it is a sibling of the stage, which is exactly where `heroMarkup` puts it at line 585.

Directly above the `${isLive ? '' : listMarkup(d)}` line, add:

```js
        <!-- Design C carries BOTH list forms and CSS shows one. A JS switch
             would mean re-rendering the card while the height changes, and
             re-render is what broke the drawer animation and the live track
             order earlier here; it would also discard drawer state and focus on
             every crossing. The rows are duplicated in the DOM as a result,
             which is safe because render() writes both together and the
             current-row highlight is applied with querySelectorAll over every
             .row[data-ep], so the two cannot drift. -->
```

- [ ] **Step 4: Write the CSS**

Append to the block added in Task 1, at the end of it:

```css
/* Hidden by default, since design C's list is the drawer until it has the room
   not to be. This has to sit BEFORE the container query below: the two rules
   have identical specificity, so order is what decides. */
.widget.c .list { display: none; }

/* 440 = 220 stage + 220 list, two equal halves, which is what makes it a clean
   number rather than an arbitrary one. It also lands 4px under design B's
   natural 444, so the two still read as the same size side by side.

   min-height is removed rather than lowered. At exactly 440 the stage is
   440 - 220 = 220, which is BELOW the 234 floor, and left alone the two rules
   fight and the card overflows its slot by 14px at precisely the threshold.
   Above the threshold the stage is height - 220 by definition, so it can never
   be under 220 and no floor is needed. 220 is still 52px clear of the 168
   collision point.

   The drawer is taken out entirely up here rather than left underneath. Its
   button is gone, so a drawer left open by dragging the slider upward would
   have been sitting over the artwork with the inline list showing below it. Its
   open state survives, so dragging back under 440 returns it as it was. */
@container (min-height: 440px) {
  .widget.c .list { display: flex; flex: 0 0 220px; }
  .widget.c .stage { min-height: 0; }
  .widget.c .h-btn[data-act="list"] { display: none; }
  .widget.c .sheet:not(.info-sheet) { display: none; }
}
```

**`.h-btn` in that selector is load-bearing.** The drawer's own close button at
`widget-core.js:716` also carries `data-act="list"`, because closing the drawer
is the same toggle as opening it. A selector written as
`.widget.c [data-act="list"]` would hide the close button too. It is `.sheet-close`,
not `.h-btn`, which is what keeps the two apart.

- [ ] **Step 5: Run the test to verify it passes**

Run: `python3 test-height.py all`

Expected: `0 checks failed`. Task 1's group must still pass; run `all`, not `inline`, so a regression there is caught now.

- [ ] **Step 6: Commit**

```bash
git add widget-core.js widget-core.css test-height.py
git commit -m "Design C shows the episode list inline above 440

440 is 220 stage plus 220 list, two equal halves, and 4px under design
B's natural 444. The stage's min-height is removed above the threshold
rather than lowered: at exactly 440 the stage is 220, below the 234
floor, and the two rules fighting overflowed the slot by 14px.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The height control on the prototype page

**Files:**
- Modify: `widget.html`, control markup after the `.widthctl` div at lines 22-28, and a listener inside the existing IIFE at lines 152-186
- Modify: `widget-core.css`, one rule beside `.widthctl` at line 218
- Modify: `test-height.py`, add `control()` and register it

**Interfaces:**
- Consumes: the `--player-h` + `main[data-h="on"]` contract from Task 1. The control sets exactly those two things and nothing else.

- [ ] **Step 1: Write the failing test**

In `test-height.py`, add above `GROUPS`:

```python
def control(pg):
    print("\n--- Task 3, the height control ---")
    pg.reload(); pg.wait_for_timeout(4500)

    check("control exists", pg.evaluate("!!document.getElementById('heightRange')"), True)
    check("defaults to Auto, no flag set",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("defaults to Auto, card is its natural 234",
          boxes(pg, "#w-podcast-c")["card"], 234)
    check("range floor is the shipped homepage 150",
          pg.evaluate("document.getElementById('heightRange').min"), "150")
    check("range ceiling is 900",
          pg.evaluate("document.getElementById('heightRange').max"), "900")

    # Dragging it applies a height
    pg.evaluate("""() => { const r = document.getElementById('heightRange');
      r.value = '600'; r.dispatchEvent(new Event('input', {bubbles: true})); }""")
    pg.wait_for_timeout(200)
    check("set to 600, card is 600", boxes(pg, "#w-podcast-c")["card"], 600)
    check("set to 600, readout says 600",
          pg.evaluate("document.getElementById('heightNum').value"), "600")

    # Auto puts it back exactly
    pg.click("#heightAuto"); pg.wait_for_timeout(250)
    check("Auto clears the flag",
          pg.evaluate("document.querySelector('main').dataset.h || 'unset'"), "unset")
    check("Auto restores the natural 234", boxes(pg, "#w-podcast-c")["card"], 234)
    check("Auto clears the custom property",
          pg.evaluate("document.documentElement.style.getPropertyValue('--player-h')"), "")

    # Typing a height works and is clamped
    pg.evaluate("""() => { const n = document.getElementById('heightNum');
      n.value = '9999'; n.dispatchEvent(new Event('change', {bubbles: true})); }""")
    pg.wait_for_timeout(200)
    check("typing 9999 clamps to 900", boxes(pg, "#w-podcast-c")["card"], 900)
    pg.click("#heightAuto"); pg.wait_for_timeout(250)

GROUPS = {"fill": fill, "inline": inline, "control": control}
```

Replace the existing `GROUPS` line with the one above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 test-height.py control`

Expected: `control exists` FAILs with `False`, and everything after it FAILs.

- [ ] **Step 3: Add the control markup**

In `widget.html`, immediately after the closing `</div>` of `.widthctl` (after the `widthFill` button, line 28), add:

```html
  <!-- Height. A slot hands a card a height as surely as it hands it a width,
       and until this control existed the page could only ask half the question.
       Auto is the default and means no height is set at all, so the page loads
       exactly as it did, which is what keeps this additive.
       150 is the floor on purpose. It is the height the iHeart homepage
       hardcodes for this slot, and the case most worth being able to look at. -->
  <div class="widthctl heightctl">
    <label for="heightRange">Player height</label>
    <input id="heightRange" type="range" min="150" max="900" step="1" value="440"
           aria-label="Player height">
    <input id="heightNum" type="number" min="150" max="900" step="1"
           aria-label="Player height in pixels">
    <span class="unit">px</span>
    <button type="button" id="heightAuto" aria-pressed="true">Auto</button>
  </div>
```

- [ ] **Step 4: Add the listener**

In `widget.html`, inside the existing IIFE, immediately before its closing `})();` (line 186), add:

```js
  /* Height. The control sets exactly two things, the custom property and the
     flag on <main>, because container-type cannot be made conditional on a
     custom property's value and the CSS needs something it can select on.
     Auto removes both rather than setting a large number, so Auto is genuinely
     the old behaviour and not a tall slot pretending to be it.
     Design C is the only design that reads them. Design B is deliberately left
     frozen at 444, so above 440 the comparison is a card that grows beside one
     that does not, which is worth knowing when reading the results. */
  const hRange = document.getElementById('heightRange');
  const hNum = document.getElementById('heightNum');
  const hAuto = document.getElementById('heightAuto');
  const H_MIN = 150, H_MAX = 900;

  const applyHeight = (px) => {
    document.documentElement.style.setProperty('--player-h', px + 'px');
    main.dataset.h = 'on';
    hRange.value = String(px);
    /* Leave the field alone while it is being typed in, or the caret jumps.
       Same reason as the width control's own guard. */
    if (document.activeElement !== hNum) hNum.value = String(px);
    hAuto.setAttribute('aria-pressed', 'false');
  };

  const autoHeight = () => {
    document.documentElement.style.removeProperty('--player-h');
    delete main.dataset.h;
    hNum.value = '';
    hAuto.setAttribute('aria-pressed', 'true');
  };

  hRange.addEventListener('input', () => applyHeight(Number(hRange.value)));
  hAuto.addEventListener('click', autoHeight);

  const clampHeight = () => {
    const raw = Number(hNum.value);
    if (hNum.value.trim() === '' || !Number.isFinite(raw)) { autoHeight(); return; }
    applyHeight(Math.min(H_MAX, Math.max(H_MIN, Math.round(raw))));
  };
  hNum.addEventListener('input', () => {
    if (hNum.value.trim() === '') return;            /* mid-edit, leave it alone */
    const raw = Number(hNum.value);
    if (Number.isFinite(raw) && raw >= H_MIN && raw <= H_MAX) applyHeight(raw);
  });
  hNum.addEventListener('change', clampHeight);
  hNum.addEventListener('blur', clampHeight);
  hNum.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clampHeight(); hNum.blur(); }
  });
  autoHeight();
```

- [ ] **Step 5: Style the Auto button**

In `widget-core.css`, immediately after line 221 (`.widthctl input[type="number"] { ... }` and the rules that follow it for `.widthctl`), add:

```css
/* The Auto button is a state, not an action, so it reads as pressed while no
   height is set rather than looking like a button you have yet to use. */
.heightctl button[aria-pressed="true"] { background: var(--ihr-grey-600); color: #fff; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `python3 test-height.py all`

Expected: `0 checks failed`, all three groups.

- [ ] **Step 7: Commit**

```bash
git add widget.html widget-core.css test-height.py
git commit -m "Add a height control to the prototype page

Auto by default, so the page loads exactly as it did. The floor is 150
because that is the height the iHeart homepage hardcodes for this slot,
which is the case most worth being able to look at.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification and deploy

**Files:**
- Modify: none, unless a check fails

- [ ] **Step 1: Confirm the drawer, veil, share and row menus are unaffected**

Run this and confirm every line says PASS:

```bash
python3 - <<'PY'
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8777"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
bad = []
def ck(l, got, want):
    ok = got == want
    print("%-46s %s  got %r" % (l, "PASS" if ok else "FAIL", got))
    if not ok: bad.append(l)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width":1500,"height":1200})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    pg.goto("http://localhost:8777/widget.html"); pg.wait_for_timeout(4500)
    pg.evaluate("""() => { document.documentElement.style.setProperty('--player-h','300px');
                           document.querySelector('main').dataset.h='on'; }""")
    pg.wait_for_timeout(200)
    C = "#w-podcast-c "
    pg.click(C + '.hero-play'); pg.wait_for_timeout(1200)
    pg.click(C + '.hero-play'); pg.wait_for_timeout(600)
    ck("pause veil still opens at once",
       pg.evaluate("!!document.querySelector('%s.widget.veil-open')" % C), True)
    pg.click(C + '.pv-close'); pg.wait_for_timeout(400)
    pg.click(C + '[data-act="share"]'); pg.wait_for_timeout(900)
    ck("share drawer still opens",
       pg.evaluate("getComputedStyle(document.querySelector('%s.share-sheet')).visibility" % C), "visible")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pg.click(C + '.h-btn[data-act="list"]'); pg.wait_for_timeout(900)
    ck("episode drawer still opens below 440",
       pg.evaluate("getComputedStyle(document.querySelector('%s.sheet:not(.info-sheet)')).visibility" % C), "visible")
    ck("row overflow buttons present",
       pg.evaluate("document.querySelectorAll('%s.sheet:not(.info-sheet) .row-more').length" % C) > 0, True)
    ck("no page errors", errs, [])
    b.close()
srv.terminate()
print("\n%d failed" % len(bad)); sys.exit(1 if bad else 0)
PY
```

- [ ] **Step 2: Screenshot the range for the record**

```bash
python3 - <<'PY'
import subprocess, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
srv = subprocess.Popen([sys.executable,"-m","http.server","8777"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
HS=[150,300,439,440,600]
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome"); pg=b.new_page(viewport={"width":1500,"height":1200})
    pg.goto("http://localhost:8777/widget.html"); pg.wait_for_timeout(4500)
    for h in HS:
        pg.evaluate("""(h)=>{document.documentElement.style.setProperty('--player-h',h+'px');
                             document.querySelector('main').dataset.h='on';}""", h)
        pg.evaluate("document.documentElement.style.setProperty('--player-w','411px')")
        pg.wait_for_timeout(300)
        # The SHELL, not the card. The shell is what clips, so shooting the card
        # at 150 would photograph the full 234 and hide the very thing being checked.
        pg.locator('section[data-design="c"][data-kind="podcast"] .shell'
                   ).screenshot(path="/tmp/h-%d.png"%h)
    b.close()
srv.terminate()
ims=[(Image.open("/tmp/h-%d.png"%h).convert("RGB"), "%dpx"%h) for h in HS]
PAD=20; TOP=24
W=sum(i.width for i,_ in ims)+PAD*(len(ims)+1); H=max(i.height for i,_ in ims)+TOP+PAD
c=Image.new("RGB",(W,H),"white"); d=ImageDraw.Draw(c); x=PAD
for i,t in ims:
    d.text((x,6),t,fill="black"); c.paste(i,(x,TOP)); x+=i.width+PAD
c.save("/tmp/height-strip.png"); print(c.size)
PY
```

View `/tmp/height-strip.png` and confirm by eye: 150 is clipped, 439 has the list icon and no inline list, 440 has the inline list and no icon.

- [ ] **Step 3: Deploy**

```bash
./deploy.sh "Design C fills the height its slot gives it, list goes inline above 440"
```

Expected: `pushed`, then `live`, then the versioned-ref table, exit 0. `host-home.html 0 versioned refs` is expected and correct; that page carries its stamp as `const EMBED_V` rather than a `v=` query string.

- [ ] **Step 4: Confirm it is live**

```bash
curl -s https://thamada-cloud.github.io/embed-player-comparison/widget-core.css | grep -c "min-height: 440px"
```

Expected: `1`.

## Self-review notes

Spec coverage, section by section:

| Spec requirement | Task |
| --- | --- |
| Card fills the slot it is given | 1 |
| Behaviour table, 150 to 900 | 1 and 2 |
| Stage absorbs, list holds 220 | 2 |
| 440 threshold | 2 |
| 234 floor, clip below | 1 |
| Floor removed in inline mode, no 454 | 2 |
| CSS mechanism, two rules not one | 1 and 2 |
| No JS threshold, no re-render | 2 |
| Height control, Auto default, 150 to 900 | 3 |
| Design B untouched | 1, asserted |
| Verification checks 1 to 9 | 1, 2 and 4 |
