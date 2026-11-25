#!/usr/bin/env bash
# Fail if Chinese characters or fullwidth punctuation remain outside vendor/.
# Usage: bash tools/lint-cjk.sh
set -u
cd "$(dirname "$0")/.." || exit 1

PATTERN='[一-龥]|[\x{3000}-\x{303F}]|[\x{FF00}-\x{FFEF}]'
hits=$(grep -rnP "$PATTERN" bundle \
  --include=*.js --include=*.html --include=*.css 2>/dev/null \
  | grep -v '/vendor/' || true)

if [ -z "$hits" ]; then
  echo "OK: no CJK / fullwidth punctuation outside vendor/"
  exit 0
fi

total=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
echo "FAIL: $total line(s) with CJK or fullwidth punctuation" >&2
printf '%s\n' "$hits" | head -20 >&2
[ "$total" -gt 20 ] && echo "... (${total} total, run: bash tools/lint-cjk.sh 2>&1 | wc -l)" >&2
exit 1
