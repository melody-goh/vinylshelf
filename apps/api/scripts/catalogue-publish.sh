#!/usr/bin/env bash
# Publishes a built catalogue as the GitHub Release `catalogue-YYYYMM` (ADR 0012), from
# the Catalogue workflow or from a machine that built it locally (ADR 0012, note of
# 2026-10-27). A rebuild of the same month replaces its files rather than failing.
#
#   pnpm --filter @vinylshelf/api catalogue:publish -- ./catalogue-out
#
# Needs the GitHub CLI, signed in with permission to create releases.
set -euo pipefail

dir="${1:?usage: catalogue-publish.sh <built catalogue directory>}"
manifest="$dir/manifest.json"
rows_file="$dir/catalogue.jsonl.gz"
[ -f "$manifest" ] && [ -f "$rows_file" ] || { echo "No built catalogue in $dir" >&2; exit 1; }

dump=$(node -p "require('$(cd "$dir" && pwd)/manifest.json').dump")
rows=$(node -p "require('$(cd "$dir" && pwd)/manifest.json').rows")
tag="catalogue-${dump:0:6}"
notes="Taste catalogue: ${rows} vinyl masters from the Discogs data dump of ${dump}, embedded with bge-small-en-v1.5 (ADR 0008, ADR 0012).

Data provided by Discogs (https://www.discogs.com), published by Discogs under CC0 at https://data.discogs.com/. Load it with: pnpm --filter @vinylshelf/api catalogue:load -- --tag ${tag}"

if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" "$manifest" "$rows_file" --clobber
else
  gh release create "$tag" "$manifest" "$rows_file" \
    --title "Catalogue ${dump:0:4}-${dump:4:2}" --notes "$notes"
fi
echo "Published $tag ($rows masters)"
