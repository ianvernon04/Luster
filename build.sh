#!/usr/bin/env bash
# Concatenates the parts into the artifact fragment (index.html) and a full standalone page for local testing (test/page.html).
set -euo pipefail
cd "$(dirname "$0")"
OUT=index.html
{
  cat parts/00-head.html
  cat parts/10-styles.css
  cat parts/20-markup.html
  echo "<script>"
  echo "'use strict';"
  for f in parts/3*.js parts/4*.js parts/50-app.js; do
    echo "/* ---- $f ---- */"
    cat "$f"
    echo
  done
  echo "</script>"
} > "$OUT"
mkdir -p test
{
  echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  cat "$OUT"
  echo '</body></html>'
} > test/page.html
echo "built $OUT ($(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines)"
