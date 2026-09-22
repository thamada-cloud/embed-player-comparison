#!/usr/bin/env bash
# Commit, cache-bust, push, and verify a deploy actually reached the browser.
#
# WHY THE CACHE-BUST EXISTS
# Nearly all of this project's content lives in players.js and measurements.js.
# GitHub Pages serves them with cache-control: max-age=600, so a browser will use
# its cached copy for up to ten minutes WITHOUT asking the server. Reloading the
# page then appears to do nothing, because the HTML is fresh but the data is not.
# Stamping a version onto each asset reference makes every deploy a new URL, so
# there is nothing stale to serve. Bumped automatically here so it cannot be
# forgotten.
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "usage: ./deploy.sh \"commit message\"" >&2
  exit 1
fi

V="$(date -u +%Y%m%d%H%M%S)"
echo "cache-bust version: $V"

# rewrite every local asset reference to carry this version
for f in index.html gallery.html analysis.html widget.html embed.html host-home.html responsive.html; do
  [ -f "$f" ] || continue
  /usr/bin/sed -i '' -E \
    -e "s|(href=\"shared\.css)(\?v=[0-9]+)?\"|\1?v=$V\"|g" \
    -e "s|(src=\"players\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|g" \
    -e "s|(src=\"measurements\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|g" \
    -e "s|(href=\"widget-core\.css)(\?v=[0-9]+)?\"|\1?v=$V\"|g" \
    -e "s|(src=\"widget-core\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|g" \
    -e "s|(const EMBED_V = ')[0-9]*(')|\1$V\2|g" \
    "$f"
  echo "  stamped $f"
done

git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  git commit -q -F - <<COMMIT
$MSG

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
COMMIT
  git push -q origin main
  echo "pushed"
fi

BASE="https://thamada-cloud.github.io/embed-player-comparison"
echo -n "waiting for Pages to serve v=$V "
for _ in $(seq 1 90); do
  if curl -s --max-time 15 "$BASE/gallery.html" | grep -q "players.js?v=$V"; then
    echo " live"
    for f in index.html gallery.html analysis.html widget.html embed.html host-home.html responsive.html; do
      n=$(curl -s --max-time 15 "$BASE/$f" | grep -c "?v=$V" || true)
      printf "  %-14s %s versioned refs\n" "$f" "$n"
    done
    exit 0
  fi
  echo -n "."
  sleep 10
done
echo " TIMED OUT: pushed, but Pages has not served v=$V yet" >&2
exit 1
