#!/usr/bin/env python3
"""
Answers three questions about the players, by measurement rather than opinion.

1. Is the dead space under some players ours or theirs?
   Compares the iframe height we declare against the bottom edge of the player's
   own lowest visible content. A gap means WE set the frame taller than the
   player needs. Padding inside the player's own root means THEY did it.

2. Are the rounded corners ours or theirs?
   Reads each player's own root and outermost element border-radius.

3. Which players are not loading properly?
   Looks for error and unavailable states, and for frames that rendered almost
   nothing.
"""
import json, time, pathlib, sys

ROOT = pathlib.Path(__file__).parent
HOST = "http://localhost:8899/"
FRAME_W = 640

PROBE = r"""
() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.02;
  };
  const deep = (root, acc) => {
    acc = acc || [];
    root.querySelectorAll('*').forEach((el) => {
      acc.push(el);
      if (el.shadowRoot) deep(el.shadowRoot, acc);
    });
    return acc;
  };
  const all = deep(document).filter(vis);
  const de = document.documentElement, body = document.body;

  /* lowest painted pixel of the player's own content */
  let contentBottom = 0, contentTop = 1e9;
  all.forEach((el) => {
    if (el === body || el === de) return;
    const r = el.getBoundingClientRect();
    if (r.height < 2) return;
    contentBottom = Math.max(contentBottom, r.bottom);
    contentTop = Math.min(contentTop, r.top);
  });
  if (contentTop > 1e8) contentTop = 0;

  /* Lowest PAINTED pixel: the bottom of the player's own visible card, ignoring
     transparent wrappers that stretch to fill the frame we gave it. This is
     what separates "the player has whitespace inside it" from "we made the
     frame too tall". */
  const opaque = (cs) => {
    const c = cs.backgroundColor || '';
    const m = c.match(/[\d.]+/g);
    if (!m) return false;
    if (m.length >= 4 && parseFloat(m[3]) < 0.05) return false;   /* transparent */
    return true;
  };
  let paintedBottom = 0;
  all.forEach((el) => {
    if (el === body || el === de) return;
    const r = el.getBoundingClientRect();
    if (r.height < 3 || r.width < 3) return;
    const cs = getComputedStyle(el);
    const isMedia = /^(img|video|canvas|svg)$/.test(el.tagName.toLowerCase());
    const hasBgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
    const hasText = (el.textContent || '').trim().length > 0 && el.children.length === 0;
    if (isMedia || hasBgImg || opaque(cs) || hasText) {
      paintedBottom = Math.max(paintedBottom, r.bottom);
    }
  });

  const rootCS = getComputedStyle(de), bodyCS = getComputedStyle(body);
  /* the player's own outermost real element, which is what would carry its
     own corner treatment if it has one */
  const shell = body.firstElementChild;
  const shellCS = shell ? getComputedStyle(shell) : null;
  const shellR = shell ? shell.getBoundingClientRect() : null;

  const text = (body.innerText || '').replace(/\s+/g, ' ').trim();

  return {
    viewportH: de.clientHeight,
    contentTop: Math.round(contentTop),
    contentBottom: Math.round(contentBottom),
    paintedBottom: Math.round(paintedBottom),
    bodyMargin: bodyCS.margin,
    bodyPadding: bodyCS.padding,
    rootRadius: rootCS.borderTopLeftRadius,
    bodyRadius: bodyCS.borderTopLeftRadius,
    shellTag: shell ? shell.tagName.toLowerCase() : null,
    shellRadius: shellCS ? shellCS.borderTopLeftRadius : null,
    shellH: shellR ? Math.round(shellR.height) : null,
    shellBg: shellCS ? shellCS.backgroundColor : null,
    visibleEls: all.length,
    textLen: text.length,
    text: text.slice(0, 180),
    errorish: /\b(error|unavailable|not available|cannot|can't|failed|offline|no longer|removed|private|restricted|sorry|oops|unsupported|try again)\b/i.test(text),
    errorClasses: all.filter((el) => {
      const c = (el.className && el.className.toString) ? el.className.toString() : '';
      return /error|unavailable|not-found|notfound|offline/i.test(c);
    }).length
  };
}
"""


def main():
    from playwright.sync_api import sync_playwright
    players = [p for p in json.loads((ROOT / '.players.json').read_text()) if not p.get('blocked')]
    only = set(sys.argv[1:])
    if only:
        players = [p for p in players if p['id'] in only]

    rows = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome", headless=True)
        ctx = br.new_context(viewport={'width': 900, 'height': 1000})
        page = ctx.new_page()
        page.goto(HOST + 'measure-host.html', wait_until='load')
        for p in players:
            declared = p['entry'].get('h') or round(FRAME_W * 9 / 16)
            page.evaluate("([s, w, h, a]) => window.mountOne(s, w, h, a)",
                          [p['src'], FRAME_W, declared, p['attrs']])
            time.sleep(7)
            el = page.query_selector('#probe iframe')
            fr = el.content_frame() if el else None
            d = None
            if fr:
                try:
                    d = fr.evaluate(PROBE)
                except Exception as e:
                    d = {'err': str(e)[:70]}
            if not d or 'err' in d:
                rows.append({'id': p['id'], 'name': p['name'], 'declared': declared,
                             'broken': True, 'reason': 'frame unreadable'})
                print(f"  {p['name']:16} UNREADABLE")
                continue

            gap = declared - d['contentBottom']
            # the gap a viewer actually sees is below the last painted pixel
            visualGap = declared - d['paintedBottom']
            # A video player legitimately has no readable text, and shadow-DOM
            # players hide theirs from innerText. Apple Music (78 elements) and
            # Streamable (a real video) were both wrongly flagged by a textLen
            # test. Judge on error signals and on rendering almost nothing.
            broken = (d['errorish'] or d['errorClasses'] > 0 or d['visibleEls'] < 6)
            rows.append({
                'id': p['id'], 'name': p['name'], 'aspect': p['entry']['aspect'],
                'declared': declared, 'contentBottom': d['contentBottom'],
                'paintedBottom': d['paintedBottom'],
                'contentTop': d['contentTop'], 'gap': gap, 'visualGap': visualGap,
                'bodyMargin': d['bodyMargin'], 'bodyPadding': d['bodyPadding'],
                'rootRadius': d['rootRadius'], 'bodyRadius': d['bodyRadius'],
                'shellRadius': d['shellRadius'], 'shellTag': d['shellTag'],
                'visibleEls': d['visibleEls'], 'textLen': d['textLen'],
                'errorish': d['errorish'], 'errorClasses': d['errorClasses'],
                'broken': broken, 'text': d['text']
            })
            flag = ('BROKEN' if broken else 'CLIP' if gap <= -12
                    else 'GAP' if visualGap >= 14 else 'ok')
            print(f"  {p['name']:16} {flag:6} declared={declared:>4} painted={d['paintedBottom']:>4} "
                  f"content={d['contentBottom']:>5} visualGap={visualGap:>4} "
                  f"radius={d['rootRadius']}/{d['bodyRadius']}/{d['shellRadius']} els={d['visibleEls']}",
                  flush=True)
        br.close()

    (ROOT / '.diagnosis.json').write_text(json.dumps(rows, indent=1))
    print("\n--- dead space BELOW THE PAINTED PLAYER (what a viewer sees) ---")
    for r in sorted([x for x in rows if not x.get('broken') and x.get('visualGap', 0) >= 14],
                    key=lambda x: -x['visualGap']):
        who = 'OURS, frame taller than the player needs' if r['gap'] >= 12 else \
              "the player's own internal whitespace"
        print(f"   {r['name']:16} {r['visualGap']:>4}px  ({who})")
    print("\n--- clipped: our frame is SHORTER than the player's content ---")
    for r in sorted([x for x in rows if not x.get('broken') and x.get('gap', 0) <= -12],
                    key=lambda x: x['gap']):
        print(f"   {r['name']:16} cut off by {-r['gap']:>5}px  "
              f"(declared {r['declared']}, content needs {r['contentBottom']})")
    print("\n--- players that round their OWN corners ---")
    for r in rows:
        rr = [r.get('rootRadius'), r.get('bodyRadius'), r.get('shellRadius')]
        if any(v and v not in ('0px', None) for v in rr):
            print(f"   {r['name']:16} root={r['rootRadius']} body={r['bodyRadius']} shell={r['shellRadius']}")
    print("\n--- not loading properly ---")
    for r in rows:
        if r.get('broken'):
            print(f"   {r['name']:16} els={r.get('visibleEls')} textLen={r.get('textLen')} "
                  f"errorish={r.get('errorish')} errClasses={r.get('errorClasses')}")
            print(f"      text: {str(r.get('text'))[:150]}")


if __name__ == '__main__':
    main()
