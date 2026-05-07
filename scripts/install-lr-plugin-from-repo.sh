#!/usr/bin/env bash
# Copy plugin from repo into Lightroom Modules (after git pull).
# Override destination: LR_PLUGIN_DST="/path/to/MindfulLensFilmEngine.lrplugin" ./scripts/install-lr-plugin-from-repo.sh
set -euo pipefail

export COPYFILE_DISABLE=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/lrplugin/MindfulLensFilmEngine.lrplugin"
DST="${LR_PLUGIN_DST:-$HOME/Library/Application Support/Adobe/Lightroom/Modules/MindfulLensFilmEngine.lrplugin}"

if [[ ! -d "$SRC" ]]; then
  echo "install-lr-plugin-from-repo: missing $SRC (run npm run sync:lr-plugin first or clone repo)." >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
echo "install-lr-plugin-from-repo: $SRC -> $DST"
echo "install-lr-plugin-from-repo: quit Lightroom before overwriting the bundle."

rsync -a --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "$SRC/" "$DST/"

echo "install-lr-plugin-from-repo: done ($(du -sh "$DST" | cut -f1))"
