#!/usr/bin/env bash
# Mirror Lightroom plugin bundle into the repo (source of truth: live Modules folder).
# Override source: LR_PLUGIN_SRC="/path/to/MindfulLensFilmEngine.lrplugin" ./scripts/sync-lr-plugin.sh
set -euo pipefail

export COPYFILE_DISABLE=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${LR_PLUGIN_SRC:-$HOME/Library/Application Support/Adobe/Lightroom/Modules/MindfulLensFilmEngine.lrplugin}"
DST="$ROOT/lrplugin/MindfulLensFilmEngine.lrplugin"

if [[ ! -d "$SRC" ]]; then
  echo "sync-lr-plugin: source missing: $SRC" >&2
  echo "Set LR_PLUGIN_SRC to your .lrplugin path." >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
echo "sync-lr-plugin: $SRC -> $DST"

rsync -a --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "$SRC/" "$DST/"

# Non-HFS destinations may sprout AppleDouble files; strip them so git stays clean.
find "$DST" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true

echo "sync-lr-plugin: done ($(du -sh "$DST" | cut -f1))"
