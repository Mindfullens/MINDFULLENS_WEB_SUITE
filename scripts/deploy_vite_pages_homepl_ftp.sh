#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy_timemachine_homepl_ftp.sh"

if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
  echo "Brak skryptu deploy: ${DEPLOY_SCRIPT}"
  exit 1
fi

SITE_BASE_URL="${HOMEPL_SITE_BASE_URL:-https://mindfullens.pl}"
REMOTE_PREFIX="${HOMEPL_REMOTE_PREFIX:-/public_html}"
INCLUDE_ROOT="${HOMEPL_INCLUDE_ROOT:-0}"
ROOT_UPLOAD_HTACCESS="${HOMEPL_ROOT_UPLOAD_HTACCESS:-0}"

DEFAULT_PAGES=("matcher" "film-lab" "ciemnia" "live" "landing" "analog-signature")

if [[ -n "${HOMEPL_PAGES:-}" ]]; then
  # Accept comma or space separated values.
  read -r -a PAGES <<<"$(echo "${HOMEPL_PAGES}" | tr ',' ' ')"
else
  PAGES=("${DEFAULT_PAGES[@]}")
fi

if [[ "${HOMEPL_INCLUDE_TIMEMACHINE:-0}" == "1" ]]; then
  PAGES+=("timemachine")
fi

if [[ "${#PAGES[@]}" -eq 0 ]]; then
  echo "Brak stron do wdrozenia. Ustaw HOMEPL_PAGES."
  exit 1
fi

echo "== Deploy wielu stron (FTP/FTPS) =="
echo "Strony: ${PAGES[*]}"
echo "Site base URL: ${SITE_BASE_URL}"
echo "Remote prefix: ${REMOTE_PREFIX}"
echo "Include root (/): ${INCLUDE_ROOT}"
echo

counter=0
total="${#PAGES[@]}"

for raw_page in "${PAGES[@]}"; do
  page="$(echo "${raw_page}" | xargs)"
  if [[ -z "${page}" ]]; then
    continue
  fi

  counter=$((counter + 1))

  echo "============================================================"
  echo "== [${counter}/${total}] Deploy: ${page}"
  echo "============================================================"

  HOMEPL_PAGE="${page}" \
  HOMEPL_REMOTE_ROOT="${REMOTE_PREFIX}/${page}" \
  HOMEPL_SITE_URL="${SITE_BASE_URL%/}/${page}" \
  HOMEPL_BUILD_BASE="/${page}/" \
  bash "${DEPLOY_SCRIPT}"

  echo
done

if [[ "${INCLUDE_ROOT}" == "1" ]]; then
  echo "============================================================"
  echo "== Deploy root: /"
  echo "============================================================"

  HOMEPL_DEPLOY_ROOT=1 \
  HOMEPL_SITE_URL="${SITE_BASE_URL%/}" \
  HOMEPL_REMOTE_ROOT="${REMOTE_PREFIX}" \
  HOMEPL_UPLOAD_HTACCESS="${ROOT_UPLOAD_HTACCESS}" \
  bash "${DEPLOY_SCRIPT}"

  echo
fi

echo "Gotowe. Wdrozenie zakonczone dla: ${PAGES[*]}"
