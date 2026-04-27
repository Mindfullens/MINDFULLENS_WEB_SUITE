#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

SERVER_NAME="${HOMEPL_SERVER_NAME:-serwer2519530}"
HOST="${HOMEPL_SFTP_HOST:-${HOMEPL_HOST:-${SERVER_NAME}.home.pl}}"
USER_NAME="${HOMEPL_USER:-${SERVER_NAME}}"
REMOTE_ROOT="${HOMEPL_REMOTE_ROOT:-/public_html/timemachine}"
SITE_URL="${HOMEPL_SITE_URL:-https://mindfullens.pl/timemachine}"
BUILD_BASE="${TIMEMACHINE_BASE:-/timemachine/}"

echo "== 1/4 Build (Vite) =="
echo "Host: ${HOST}"
echo "Remote path: ${REMOTE_ROOT}"
echo "Site URL: ${SITE_URL}"
echo "Base: ${BUILD_BASE}"
echo

npm run build -- --base="${BUILD_BASE}"

find dist -name '._*' -type f -delete
find dist -name '*.map' -type f -delete

STAGE_DIR="$(mktemp -d)"
SFTP_BATCH="$(mktemp)"
cleanup() {
  rm -rf "${STAGE_DIR}" "${SFTP_BATCH}"
}
trap cleanup EXIT

cp -f dist/index.html "${STAGE_DIR}/index.html"
cp -R dist/assets "${STAGE_DIR}/assets"

cat > "${STAGE_DIR}/.htaccess" <<'EOF'
Options -Indexes

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
  Header always set Cross-Origin-Resource-Policy "same-site"
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
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule . index.html [L]
</IfModule>
EOF

cat > "${SFTP_BATCH}" <<EOF
mkdir ${REMOTE_ROOT}
cd ${REMOTE_ROOT}
lcd ${STAGE_DIR}
put index.html
put .htaccess
put -r assets
ls
EOF

echo "== 2/4 Upload =="
sftp \
  -oBatchMode=yes \
  -oConnectTimeout=8 \
  -oConnectionAttempts=1 \
  -oStrictHostKeyChecking=no \
  "${USER_NAME}@${HOST}" < "${SFTP_BATCH}"

echo
echo "== 3/4 Walidacja HTTP =="
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 8 --max-time 20 "${SITE_URL%/}/")"
echo "GET ${SITE_URL%/}/ -> HTTP ${HTTP_CODE}"

echo
echo "== 4/4 Naglowki bezpieczenstwa =="
curl -sS -I --connect-timeout 8 --max-time 20 "${SITE_URL%/}/" | grep -Ei 'content-security-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cross-origin-resource-policy' || true

echo
echo "Deploy TimeMachine zakonczony."
