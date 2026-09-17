#!/bin/bash
# GTM CRM — zero-downtime deploy on the VPS.
# Builds into a temporary directory first, then swaps it in and restarts pm2, so the running app
# never serves requests while its build folder is empty.
#   bash /var/www/texasgtm/scripts/deploy.sh
set -e
APP_DIR="${APP_DIR:-/var/www/texasgtm}"
PM2_NAME="${PM2_NAME:-texasgtm}"
cd "$APP_DIR"
echo "[1/5] git pull"; git pull -q origin main
echo "[2/5] npm install"; npm install --no-audit --no-fund --silent
echo "[3/5] build (into .next-build)"; rm -rf .next-build
NEXT_DIST_DIR=.next-build npx next build 2>&1 | grep -E "Compiled|rror|✓" | head -3
echo "[4/5] schema"; node -e 'require("./scripts/_db").initSchema().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})'
echo "[5/5] swap + restart"; rm -rf .next-prev; [ -d .next ] && mv .next .next-prev; mv .next-build .next; pm2 restart "$PM2_NAME" >/dev/null; rm -rf .next-prev
sleep 3; curl -s -o /dev/null -w "http://localhost:3010 -> HTTP %{http_code}\n" http://localhost:3010/
