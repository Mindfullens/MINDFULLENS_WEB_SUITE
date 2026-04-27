#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/MindfulLens_System_Master/marketing/public_html/matcher"

HOST="${HOMEPL_HOST:-serwer2519530.home.pl}"
USER_NAME="${HOMEPL_USER:-Irmapolcz@gmail.com}"
REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html/matcher}"
RAW_REMOTE_ROOT="${HOMEPL_RAW_REMOTE_ROOT:-/public_html/raw}"
SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl/matcher}"

if [[ ! -f "${SRC_DIR}/index.html" ]]; then
  echo "Brak pliku: ${SRC_DIR}/index.html"
  exit 1
fi

if [[ ! -d "${SRC_DIR}/raw" ]]; then
  echo "Brak katalogu RAW bridge: ${SRC_DIR}/raw"
  exit 1
fi

echo "== 1/3 Upload statycznego matcher =="
echo "Host: ${HOST}"
echo "Remote path: ${REMOTE_ROOT}"
echo "Raw root path: ${RAW_REMOTE_ROOT}"
echo "Site URL: ${SITE_URL}"
echo

# AppleDouble sidecars can break/dirty remote deploy.
find "${SRC_DIR}" -name '._*' -type f -delete

SFTP_BATCH="$(mktemp)"
trap 'rm -f "$SFTP_BATCH"' EXIT

cat >"$SFTP_BATCH" <<EOF
mkdir ${REMOTE_ROOT}
cd ${REMOTE_ROOT}
lcd ${SRC_DIR}
put index.html
put index.php
mkdir raw
cd raw
lcd ${SRC_DIR}/raw
put probe.php
put decode.php
put raw_bridge_lib.php
cd ${REMOTE_ROOT}
ls
mkdir ${RAW_REMOTE_ROOT}
cd ${RAW_REMOTE_ROOT}
lcd ${SRC_DIR}/raw
put probe.php
put decode.php
put raw_bridge_lib.php
ls
EOF

sftp -oStrictHostKeyChecking=no "${USER_NAME}@${HOST}" <"$SFTP_BATCH"

echo
echo "== 2/3 Probe endpoint =="
PROBE_URL_MATCHER="${SITE_URL%/}/raw/probe.php"
PROBE_URL_ROOT="${SITE_URL%/}/../raw/probe.php"

echo "-- matcher/raw/probe.php --"
curl -fsS "${PROBE_URL_MATCHER}" || true
echo
echo "-- root/raw/probe.php --"
curl -fsS "${PROBE_URL_ROOT}" || true
echo

echo "== 3/3 Decode endpoint status =="
DECODE_URL="${SITE_URL%/}/raw/decode.php"
DECODE_HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${DECODE_URL}")"
echo "decode.php HTTP status (GET): ${DECODE_HTTP_CODE} (oczekiwane 405)."

echo
echo "Deploy statycznego matcher zakonczony."
