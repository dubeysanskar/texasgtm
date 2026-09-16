#!/bin/bash
# GTM CRM — install a local PostgreSQL on the Ubuntu VPS and create the app database.
# Run once on the server as root:
#   bash /var/www/texasgtm/scripts/server-setup-postgres.sh
# Then put the printed DATABASE_URL into /var/www/texasgtm/.env, run
#   node scripts/bootstrap-db.js
# and restart the app: pm2 restart texasgtm
#
# Skip this entirely if you prefer SQLite: just leave DATABASE_URL out of .env.

set -e
DB_NAME="${DB_NAME:-gtm_crm}"
DB_USER="${DB_USER:-gtm}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"

echo "[1/4] Installing PostgreSQL…"
if ! command -v psql >/dev/null 2>&1; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi
systemctl enable --now postgresql

echo "[2/4] Creating role and database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
# UTF-8 locale so ILIKE / lower() fold Cyrillic correctly (needed for Russian lead search)
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${DB_USER}" -E UTF8 -T template0 --locale=C.UTF-8 "${DB_NAME}" 2>/dev/null || \
  sudo -u postgres createdb -O "${DB_USER}" -E UTF8 -T template0 --locale=en_US.UTF-8 "${DB_NAME}" 2>/dev/null || \
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

echo "[3/4] Verifying connection…"
PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT version();" | head -c 60; echo

echo "[4/4] Done."
echo
echo "Add this line to /var/www/texasgtm/.env (replace the old Supabase DATABASE_URL):"
echo
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
echo
echo "Then:  cd /var/www/texasgtm && node scripts/bootstrap-db.js && pm2 restart texasgtm"
