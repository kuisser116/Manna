#!/bin/bash
# ═══════════════════════════════════════════════════════════
# deploy.sh — Deploy de Shekael a producción (VPS Contabo)
# Uso: ./deploy.sh [frontend|backend|all]
# Requiere: llave SSH ~/.ssh/shekael_vps
# ═══════════════════════════════════════════════════════════
set -euo pipefail

VPS="root@157.173.198.58"
KEY="$HOME/.ssh/shekael_vps"
REPO_API="/var/www/shekael/repo/shekael-api"
REPO_FE="/var/www/shekael/repo/shekael-frontend"
BRANCH="beta-2026-07-15"
TARGET="${1:-all}"

echo "═══ Deploy Shekael → producción (${BRANCH}) ═══"

# 1. Frontend: build local con envs de producción
if [[ "$TARGET" == "all" || "$TARGET" == "frontend" ]]; then
  echo "[1/3] Build frontend (envs producción)..."
  cd "$(dirname "$0")/shekael-frontend"
  VITE_API_URL=https://api.shekael.com \
  VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(grep VITE_GOOGLE_CLIENT_ID .env | cut -d= -f2)}" \
  VITE_RECAPTCHA_SITE_KEY="${VITE_RECAPTCHA_SITE_KEY:-$(grep VITE_RECAPTCHA_SITE_KEY .env | cut -d= -f2)}" \
  npm run build

  echo "[2/3] Subiendo dist/ al VPS..."
  # Limpiar dist remoto para no acumular bundles viejos
  ssh -i "$KEY" "$VPS" "rm -rf ${REPO_FE}/dist/assets/*"
  scp -i "$KEY" -r dist/* "$VPS:${REPO_FE}/dist/"
  echo "      Frontend desplegado ✓"
fi

# 2. Backend: copiar código y reiniciar PM2
if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then
  echo "[3/3] Subiendo backend + restart PM2..."
  cd "$(dirname "$0")/shekael-api"
  # Archivos nuevos/modificados que no sean node_modules ni .env
  rsync -az --exclude node_modules --exclude .env --exclude uploads \
    -e "ssh -i $KEY" ./ "$VPS:${REPO_API}/"
  ssh -i "$KEY" "$VPS" "cd ${REPO_API} && npm install --omit=dev --silent 2>/dev/null; pm2 restart shekael-api --update-env --silent && sleep 3"
  echo "      Backend desplegado ✓"
fi

# 3. Verificación
echo "═══ Verificación ═══"
sleep 2
curl -sf https://api.shekael.com/health && echo " ← API OK" || echo "⚠ API CAÍDA"
curl -sf -o /dev/null -w "Frontend: %{http_code}\n" https://shekael.com/

echo "═══ Deploy completado ═══"
