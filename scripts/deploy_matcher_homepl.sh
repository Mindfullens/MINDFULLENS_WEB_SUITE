#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOMEPL_HOST:-serwer2519530.home.pl}"
USER_NAME="${HOMEPL_USER:-Irmapolcz@gmail.com}"
REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html/matcher}"
RAW_REMOTE_ROOT="${HOMEPL_RAW_REMOTE_ROOT:-/public_html/raw}"
SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl/matcher}"

echo "== 1/3 Build + upload =="
echo "Host: ${HOST}"
echo "Remote path: ${REMOTE_ROOT}"
echo "Raw root path: ${RAW_REMOTE_ROOT}"
echo "Site URL: ${SITE_URL}"
echo

npm run build

# AppleDouble sidecars can break/dirty remote deploy.
find dist -name '._*' -type f -delete

SFTP_BATCH="$(mktemp)"
trap 'rm -f "$SFTP_BATCH"' EXIT

cat >"$SFTP_BATCH" <<EOF
mkdir ${REMOTE_ROOT}
cd ${REMOTE_ROOT}
lcd ${ROOT_DIR}/dist
put index.html
put logo.png
put -r assets
put -r luts
put -r overlays
put -r raw
mkdir ${RAW_REMOTE_ROOT}
cd ${RAW_REMOTE_ROOT}
lcd ${ROOT_DIR}/dist/raw
put probe.php
put decode.php
put raw_bridge_lib.php
ls
EOF

sftp -oStrictHostKeyChecking=no "${USER_NAME}@${HOST}" <"$SFTP_BATCH"

echo
echo "== 2/3 Probe endpoint =="
PROBE_URL="${SITE_URL%/}/raw/probe.php"
PROBE_JSON="$(curl -fsS "${PROBE_URL}")"
echo "${PROBE_JSON}"

echo
echo "== 3/3 Decoder status =="
if echo "${PROBE_JSON}" | grep -q '"decoderInstalled"[[:space:]]*:[[:space:]]*true'; then
  echo "OK: decoderInstalled=true (RAW decode powinien dzialac)."
else
  echo "UWAGA: decoderInstalled=false (RAW decode NIE bedzie dzialal na produkcji)."
  echo "Wymagane na serwerze: Imagick lub binarka ImageMagick (magick/convert)."
fi

DECODE_URL="${SITE_URL%/}/raw/decode.php"
DECODE_HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${DECODE_URL}")"
echo "decode.php HTTP status (GET): ${DECODE_HTTP_CODE} (oczekiwane 405)."

echo
echo "Deploy i walidacja zakonczone."
