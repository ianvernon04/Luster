#!/usr/bin/env bash
# Puts the vendored browser libraries (vendor/sources.txt) in place from npm, exact versions. Releases leave them out
# to stay small; the release workflow runs this before building. Safe to rerun: files already present are kept.
set -euo pipefail
cd "$(dirname "$0")/.."
grep -Ev '^\s*(#|$)' vendor/sources.txt | while read -r file pkg inner; do
  if [ -f "$file" ]; then echo "have $file"; continue; fi
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack "$pkg" --silent >/dev/null && tar -xzf ./*.tgz "$inner")
  mkdir -p "$(dirname "$file")"; mv "$tmp/$inner" "$file"; rm -rf "$tmp"
  echo "fetched $file ($pkg)"
done
