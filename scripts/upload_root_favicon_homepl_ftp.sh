#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

SERVER_NAME="${HOMEPL_SERVER_NAME:-serwer2519530}"
HOST="${HOMEPL_FTP_HOST:-${HOMEPL_HOST:-${SERVER_NAME}.home.pl}}"
USER_NAME="${HOMEPL_USER:-${SERVER_NAME}}"
PASSWORD="${HOMEPL_PASSWORD:-}"
REMOTE_FILE="${HOMEPL_FAVICON_REMOTE_PATH:-/public_html/favicon.ico}"
LOCAL_FILE="${HOMEPL_FAVICON_LOCAL_PATH:-${ROOT_DIR}/public/favicon.ico}"

if [[ ! -f "${LOCAL_FILE}" ]]; then
  echo "Brak pliku favicon lokalnie: ${LOCAL_FILE}"
  exit 1
fi

if [[ -z "${PASSWORD}" ]] && command -v security >/dev/null 2>&1; then
  PASSWORD="$(security find-internet-password -s "${HOST}" -w 2>/dev/null || true)"
fi

if [[ -z "${PASSWORD}" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "Podaj hasło FTP (${USER_NAME}@${HOST}): " PASSWORD
    echo
  else
    echo "Brak hasła FTP: ustaw HOMEPL_PASSWORD albo dodaj hasło do keychain."
    exit 1
  fi
fi

if [[ -z "${PASSWORD}" ]]; then
  echo "Brak hasła FTP."
  exit 1
fi

echo "Upload favicon:"
echo "Host: ${HOST}"
echo "User: ${USER_NAME}"
echo "Local: ${LOCAL_FILE}"
echo "Remote: ${REMOTE_FILE}"
echo

upload_file() {
  local local_path="$1"
  local remote_path="$2"

  echo "-> ${remote_path}"

  if curl --silent --show-error --fail --connect-timeout 10 --max-time 120 --ftp-create-dirs --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftps://${HOST}${remote_path}" >/dev/null; then
    return 0
  fi

  if curl --silent --show-error --fail --connect-timeout 10 --max-time 120 --ftp-create-dirs --ssl-reqd --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftp://${HOST}${remote_path}" >/dev/null; then
    return 0
  fi

  curl --silent --show-error --fail --connect-timeout 10 --max-time 120 --ftp-create-dirs --user "${USER_NAME}:${PASSWORD}" -T "${local_path}" "ftp://${HOST}${remote_path}" >/dev/null
}

upload_file "${LOCAL_FILE}" "${REMOTE_FILE}"

echo
echo "Sprawdzam HTTP:"
curl -sS -I --connect-timeout 8 --max-time 20 "https://mindfullens.pl/favicon.ico" | sed -n '1,10p'
echo
echo "Gotowe."
