#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

DEPLOY_ROOT="${HOMEPL_DEPLOY_ROOT:-0}"
PAGE_SLUG="${HOMEPL_PAGE:-timemachine}"
SERVER_NAME="${HOMEPL_SERVER_NAME:-serwer2519530}"
HOST="${HOMEPL_FTP_HOST:-${HOMEPL_HOST:-${SERVER_NAME}.home.pl}}"
USER_NAME="${HOMEPL_USER:-${SERVER_NAME}}"
PASSWORD="${HOMEPL_PASSWORD:-}"

if [[ "${DEPLOY_ROOT}" == "1" ]]; then
  PAGE_SLUG="root"
  REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html}"
  SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl}"
  BUILD_BASE="${HOMEPL_BUILD_BASE:-/}"
  UPLOAD_HTACCESS="${HOMEPL_UPLOAD_HTACCESS:-0}"
else
  REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html/${PAGE_SLUG}}"
  SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl/${PAGE_SLUG}}"
  BUILD_BASE="${HOMEPL_BUILD_BASE:-${TIMEMACHINE_BASE:-/${PAGE_SLUG}/}}"
  UPLOAD_HTACCESS="${HOMEPL_UPLOAD_HTACCESS:-1}"
fi

if [[ -z "${PASSWORD}" ]] && command -v security >/dev/null 2>&1; then
  PASSWORD="$(security find-internet-password -s "${HOST}" -w 2>/dev/null || true)"
fi

if [[ -z "${PASSWORD}" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "Podaj hasło FTP (${USER_NAME}@${HOST}): " PASSWORD
    echo
  else
    echo "Brak hasła FTP: ustaw HOMEPL_PASSWORD albo dodaj hasło do keychain (security find-internet-password)."
    exit 1
  fi
fi

if [[ -z "${PASSWORD}" ]]; then
  echo "Brak hasła FTP. Ustaw HOMEPL_PASSWORD lub wpisz hasło interaktywnie."
  exit 1
fi

echo "== 1/4 Build (Vite) =="
echo "Page: ${PAGE_SLUG}"
echo "FTP host: ${HOST}"
echo "Remote path: ${REMOTE_ROOT}"
echo "Site URL: ${SITE_URL}"
echo "Base: ${BUILD_BASE}"
echo "Upload .htaccess: ${UPLOAD_HTACCESS}"
echo

npm run build -- --base="${BUILD_BASE}"

find dist -name '._*' -type f -delete
find dist -name '*.map' -type f -delete

STAGE_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${STAGE_DIR}"
}
trap cleanup EXIT

cp -R dist/. "${STAGE_DIR}/"

cat > "${STAGE_DIR}/.htaccess" <<'EOF'
Options -Indexes

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
  Header always set Cross-Origin-Resource-Policy "same-site"
  Header always set X-Robots-Tag "noarchive, nosnippet, noimageindex"
  Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https://mindfullens.pl; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://mindfullens.pl; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests"
</IfModule>

<FilesMatch "\.(map|md|log|env|ini|bak)$">
  Require all denied
</FilesMatch>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>

<IfModule mod_rewrite.c>
  RewriteEngine On

  # Basic anti-hotlink deterrence for static assets.
  RewriteCond %{REQUEST_FILENAME} \.(jpg|jpeg|png|webp|gif|svg|css|js|woff2?)$ [NC]
  RewriteCond %{HTTP_REFERER} !^$ [NC]
  RewriteCond %{HTTP_REFERER} !^https?://([^.]+\.)?mindfullens\.pl/ [NC]
  RewriteRule ^ - [F,L]

  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule . index.html [L]
</IfModule>
EOF

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

check_ftp_auth() {
  local output

  if output="$(curl --show-error --silent --connect-timeout 10 --max-time 30 --list-only --user "${USER_NAME}:${PASSWORD}" "ftps://${HOST}/" 2>&1)"; then
    echo "Autoryzacja FTPS OK."
    return 0
  fi

  if output="$(curl --show-error --silent --connect-timeout 10 --max-time 30 --list-only --ssl-reqd --user "${USER_NAME}:${PASSWORD}" "ftp://${HOST}/" 2>&1)"; then
    echo "Autoryzacja FTP+SSL OK."
    return 0
  fi

  if output="$(curl --show-error --silent --connect-timeout 10 --max-time 30 --list-only --user "${USER_NAME}:${PASSWORD}" "ftp://${HOST}/" 2>&1)"; then
    echo "Autoryzacja FTP (plain) OK."
    return 0
  fi

  echo "Blad autoryzacji FTP: ${output}"
  if echo "${output}" | grep -q "530"; then
    echo "Serwer zwrocil 530 Access denied."
    echo "Sprawdz login FTP i haslo w panelu home.pl (to moze byc inne konto niz e-mail)."
    echo "Mozesz tez ustawic inny host: HOMEPL_FTP_HOST=ftp.home.pl lub serwerXXXX.home.pl."
  fi
  return 1
}

echo "== 2/4 Test autoryzacji FTP =="
check_ftp_auth
echo

echo "== 3/4 Upload FTP/FTPS =="
upload_file "${STAGE_DIR}/index.html" "${REMOTE_ROOT}/index.html"
if [[ "${UPLOAD_HTACCESS}" == "1" ]]; then
  upload_file "${STAGE_DIR}/.htaccess" "${REMOTE_ROOT}/.htaccess"
else
  echo "-> pomijam upload ${REMOTE_ROOT}/.htaccess"
fi

while IFS= read -r -d '' build_file; do
  rel_path="${build_file#${STAGE_DIR}/}"
  upload_file "${build_file}" "${REMOTE_ROOT}/${rel_path}"
done < <(find "${STAGE_DIR}" -type f ! -name 'index.html' ! -name '.htaccess' -print0)

echo
echo "== 4/4 Walidacja HTTP =="
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 8 --max-time 20 "${SITE_URL%/}/")"
echo "GET ${SITE_URL%/}/ -> HTTP ${HTTP_CODE}"

echo
echo "== Naglowki bezpieczenstwa =="
curl -sS -I --connect-timeout 8 --max-time 20 "${SITE_URL%/}/" | grep -Ei 'content-security-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cross-origin-resource-policy' || true

echo
echo "Deploy FTP/FTPS zakonczony (${PAGE_SLUG})."
