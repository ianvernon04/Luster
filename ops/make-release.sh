#!/usr/bin/env bash
# Packs a release the GitHub workflow can apply: a .tar.gz overlay of source files, base64-encoded, plus its sha256.
#   ops/make-release.sh <id> [base-ref]
# With a base ref (the commit that matches what's live), only files changed since then are packed, and files deleted
# since then are listed in .release-deletions. Without one, every tracked source file is packed.
# Generated files (index.html, sw.js) are rebuilt by the workflow; the vendored supabase-js is fetched from npm there.
# Prints: {id, sha256, bytes, files, payload_file}
set -euo pipefail
cd "$(dirname "$0")/.."
ID="${1:?release id, e.g. $(date -u +%Y%m%d-%H%M)}"; BASE="${2:-}"
OUT="${RELEASE_OUT:-/tmp/luster-release-$ID}"; mkdir -p "$OUT"
EXCLUDE='^(index\.html|sw\.js|src/index\.html|src/test/page\.html|CNAME|\.release|\.release-deletions|\.github/.*|vendor/.*\.js|.*/shots/.*|.*node_modules.*)$'
if [ -n "$BASE" ]; then
  git diff --name-only --diff-filter=ACMR "$BASE" HEAD | grep -Ev "$EXCLUDE" > "$OUT/files.txt" || true
  git diff --name-only --diff-filter=D "$BASE" HEAD | grep -Ev "$EXCLUDE" > "$OUT/deletions.txt" || true
else
  git ls-files | grep -Ev "$EXCLUDE" > "$OUT/files.txt"; : > "$OUT/deletions.txt"
fi
STAGE="$OUT/stage"; rm -rf "$STAGE"; mkdir -p "$STAGE"
tar -cf - -T "$OUT/files.txt" | tar -xf - -C "$STAGE"
echo "$ID" > "$STAGE/.release"
cp "$OUT/deletions.txt" "$STAGE/.release-deletions"
tar -czf "$OUT/release.tgz" -C "$STAGE" .
base64 -w0 "$OUT/release.tgz" > "$OUT/payload.b64"
SHA=$(sha256sum "$OUT/release.tgz" | cut -d' ' -f1)
printf '{"id":"%s","sha256":"%s","bytes":%s,"files":%s,"deletions":%s,"payload_file":"%s"}\n' "$ID" "$SHA" "$(wc -c < "$OUT/release.tgz")" "$(wc -l < "$OUT/files.txt")" "$(wc -l < "$OUT/deletions.txt")" "$OUT/payload.b64"
