/* Flattens players.js into .players.json for measure.py, so the harness can
   never drift from the real registry. Run: node export-players.js */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/players.js', 'utf8');
/* Measurement runs against a local server, and Twitch reflects parent= into
   frame-ancestors, special-casing localhost for any port and scheme. Exporting
   with the deployed hostname made Twitch refuse the frame and measure as empty. */
global.location = { hostname: 'localhost' };
const sandbox = { location: global.location };
const fn = new Function('location', src + '\nreturn {PLAYERS, GROUPS, resolveEntry, buildSrc};');
const { PLAYERS, GROUPS, resolveEntry, buildSrc } = fn(global.location);

/* Measure the podcast view, which is the default on both pages and the one a
   reader will have seen. Live-only players fall back to their live entry. */
const MODE = 'podcast';
const out = [];
for (const p of PLAYERS) {
  const r = resolveEntry(p, MODE);
  if (r.blocked) {
    out.push({ id: p.id, name: p.name, group: p.group, status: p.status,
               blocked: true, why: p.why || null });
    continue;
  }
  const attrs = {};
  if (p.allow) attrs.allow = p.allow;
  if (p.sandbox) attrs.sandbox = p.sandbox;
  if (p.scrolling) attrs.scrolling = p.scrolling;
  if (p.allowfullscreen) attrs.allowfullscreen = true;
  out.push({
    id: p.id, name: p.name, group: p.group, status: p.status,
    blocked: false,
    themed: !!p.themed,
    fellBack: !!r.fellBack,
    shownMode: r.fellBack ? r.to : MODE,
    src: buildSrc(p, r.entry, 'light'),
    entry: { h: r.entry.h || null, aspect: !!r.entry.aspect },
    attrs
  });
}
fs.writeFileSync(__dirname + '/.players.json', JSON.stringify(out, null, 1));
console.log(`exported ${out.length} players (${out.filter(p => !p.blocked).length} embeddable)`);
console.log('groups:', Object.keys(GROUPS).join(', '));
