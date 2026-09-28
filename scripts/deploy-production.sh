#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Methodome production deployment =="

command -v node >/dev/null || { echo "Node.js is required."; exit 1; }
command -v npm >/dev/null || { echo "npm is required."; exit 1; }
command -v npx >/dev/null || { echo "npx is required."; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required."; exit 1; }

echo "-- Cloudflare identity"
npx wrangler whoami

echo "-- Install JavaScript dependencies"
npm install

echo "-- Verify TypeScript and unit tests"
npm run typecheck
npm test
npm --prefix apps/web install --workspaces=false
npm run web:typecheck
npm run web:build

echo "-- Ensure R2 bucket exists"
if npx wrangler r2 bucket list | grep -q "methodome-files"; then
  echo "methodome-files already exists"
else
  npx wrangler r2 bucket create methodome-files
fi

echo "-- Ensure analysis queue exists"
if npx wrangler queues list | grep -q "methodome-analysis"; then
  echo "methodome-analysis already exists"
else
  npx wrangler queues create methodome-analysis
fi

echo "-- Resume analysis queue delivery"
npx wrangler queues resume-delivery methodome-analysis

echo "-- Apply remote D1 migrations"
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc

echo "-- Prepare Python deployment tooling"
UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" ]]; then
  DEPLOY_VENV="$ROOT/.methodome-deploy-venv"
  python3 -m venv "$DEPLOY_VENV"
  "$DEPLOY_VENV/bin/python" -m pip install --disable-pip-version-check --quiet uv
  UV_BIN="$DEPLOY_VENV/bin/uv"
fi

export PATH="$(dirname "$UV_BIN"):$PATH"

echo "-- Test Python statistics engine"
(
  cd services/stats-worker
  "$UV_BIN" sync --group dev
  "$UV_BIN" run --group dev pytest tests -q
)

echo "-- Deploy internal Python statistics Worker"
(
  cd services/stats-worker
  "$UV_BIN" run --group dev pywrangler deploy --config wrangler.jsonc
)

echo "-- Remove legacy Python queue consumer if present"
if npx wrangler queues consumer worker list methodome-analysis --json | grep -q '"script": "methodome-stats"'; then
  npx wrangler queues consumer worker remove methodome-analysis methodome-stats
fi

echo "-- Deploy Methodome API Worker"
npx wrangler deploy --config wrangler.jsonc

echo "-- Verify analysis queue consumer"
CONSUMERS_JSON="$(npx wrangler queues consumer worker list methodome-analysis --json)"
echo "$CONSUMERS_JSON"
echo "$CONSUMERS_JSON" | grep -q '"script": "methodome-api"' || {
  echo "methodome-api is not registered as the analysis queue consumer."
  exit 1
}

echo "-- Ensure Better Auth secret exists"
if npx wrangler secret list --config wrangler.jsonc 2>/dev/null | grep -q "BETTER_AUTH_SECRET"; then
  echo "BETTER_AUTH_SECRET already configured"
else
  printf "%s" "$(openssl rand -base64 48)" | npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc
  echo "BETTER_AUTH_SECRET configured"
fi

echo "-- Deploy Methodome web Worker"
npm --workspace @methodome/web run deploy:cloudflare

echo "-- Verify public endpoints"
curl --fail --silent --show-error https://api.methodome.com/api/health
echo
curl --fail --silent --show-error --output /dev/null https://methodome.com/
echo "methodome.com responded successfully"

echo "-- Run complete research workflow"
METHODOME_API_URL=https://api.methodome.com/api node scripts/e2e-smoke.mjs

echo "== Methodome production deployment complete =="
