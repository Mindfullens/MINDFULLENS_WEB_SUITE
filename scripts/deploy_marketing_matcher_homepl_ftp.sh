#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/MindfulLens_System_Master/marketing/public_html/matcher"
RAW_DIR="${SRC_DIR}/raw"

HOST="${HOMEPL_HOST:-serwer2519530.home.pl}"
USER_NAME="${HOMEPL_USER:-Irmapolcz@gmail.com}"
PASSWORD="${HOMEPL_PASSWORD:-}"
REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html/matcher}"
RAW_REMOTE_ROOT="${HOMEPL_RAW_REMOTE_ROOT:-/public_html/raw}"
SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl/matcher}"

if [[ ! -f "${SRC_DIR}/index.html" ]]; then
  echo "Brak pliku: ${SRC_DIR}/index.html"
  exit 1
fi

if [[ ! -f "${SRC_DIR}/index.php" ]]; then
  cp -f "${SRC_DIR}/index.html" "${SRC_DIR}/index.php"
fi

if [[ ! -d "${RAW_DIR}" ]]; then
  echo "Brak katalogu RAW bridge: ${RAW_DIR}"
  exit 1
fi

if [[ -z "${PASSWORD}" ]]; then
  read -r -s -p "Podaj hasło FTP (${USER_NAME}@${HOST}): " PASSWORD
  echo
fi

echo "== 1/3 Upload statycznego matcher przez FTP/FTPS =="
echo "Host: ${HOST}"
echo "Remote path: ${REMOTE_ROOT}"
echo "Raw root path: ${RAW_REMOTE_ROOT}"
echo "Site URL: ${SITE_URL}"
echo

find "${SRC_DIR}" -name '._*' -type f -delete

upload_file() {
  local local_path="$1"
  local remote_path="$2"

  echo "-> ${remote_path}"

  if curl --silent --show-error --fail --ftp-create-dirs --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftps://${HOST}${remote_path}" >/dev/null; then
    return 0
  fi

  if curl --silent --show-error --fail --ftp-create-dirs --ssl-reqd --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftp://${HOST}${remote_path}" >/dev/null; then
    return 0
  fi

  curl --silent --show-error --fail --ftp-create-dirs --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftp://${HOST}${remote_path}" >/dev/null
}

upload_file "${SRC_DIR}/index.html" "${REMOTE_ROOT}/index.html"
upload_file "${SRC_DIR}/index.php" "${REMOTE_ROOT}/index.php"

upload_file "${RAW_DIR}/probe.php" "${REMOTE_ROOT}/raw/probe.php"
upload_file "${RAW_DIR}/decode.php" "${REMOTE_ROOT}/raw/decode.php"
upload_file "${RAW_DIR}/raw_bridge_lib.php" "${REMOTE_ROOT}/raw/raw_bridge_lib.php"

upload_file "${RAW_DIR}/probe.php" "${RAW_REMOTE_ROOT}/probe.php"
upload_file "${RAW_DIR}/decode.php" "${RAW_REMOTE_ROOT}/decode.php"
upload_file "${RAW_DIR}/raw_bridge_lib.php" "${RAW_REMOTE_ROOT}/raw_bridge_lib.php"

echo
echo "== 2/3 Probe endpoint =="
PROBE_URL_MATCHER="${SITE_URL%/}/raw/probe.php"
PROBE_URL_ROOT="https://mindfullens.pl/raw/probe.php"

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

echo "Deploy statycznego matcher (FTP/FTPS) zakonczony."
