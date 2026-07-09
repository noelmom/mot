#!/usr/bin/env bash
#
# Build the Rebound extension package for the Chrome/Edge Web Store and for
# manual installs. Produces rebound-<version>.zip with manifest.json at the
# zip root (Chrome requires this). Version is read from manifest.json.
#
#   ./package.sh
#
set -euo pipefail
cd "$(dirname "$0")"

# ponytail: explicit runtime-file list, not a glob — keeps the package minimal
# and reviewer-clean. Add any new runtime file here when you add one.
FILES=(
  manifest.json
  assets/icon16.png assets/icon48.png assets/icon128.png
  background/service-worker.js
  content/content.js content/content.css
  page/page-bridge.js
  popup/popup.html popup/popup.css popup/popup.js
)

VERSION=$(grep -m1 -oE '"version"[[:space:]]*:[[:space:]]*"[0-9][0-9.]*"' manifest.json \
          | sed 's/.*"\([0-9][0-9.]*\)".*/\1/')
[ -n "$VERSION" ] || { echo "could not read version from manifest.json" >&2; exit 1; }
OUT="rebound-${VERSION}.zip"

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing runtime file: $f" >&2; exit 1; }
done

rm -f "$OUT"
# -X strips extra macOS attributes; -x drops any stray .DS_Store
zip -rX "$OUT" "${FILES[@]}" -x '*.DS_Store' >/dev/null

# self-check: manifest.json must sit at the zip root, or Chrome rejects it.
# (no `grep -q`: it would exit early and SIGPIPE unzip, tripping pipefail)
unzip -l "$OUT" | grep -E '[[:space:]]manifest\.json$' >/dev/null \
  || { echo "ERROR: manifest.json is not at the zip root" >&2; exit 1; }

COUNT=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "built $OUT — $COUNT files, $(du -h "$OUT" | cut -f1)"
