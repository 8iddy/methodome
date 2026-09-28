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
npm run web:typecheck
npm run web:build

echo "-- Ensure R2 bucket exists"
if npx wrangler r2 bucket list | grep -q "methodome-files"; then
  echo "methodome-files already exists"
else
  npx wrangler r2 bucket create methodome-files
fi

echo "-- Apply remote D1 migrations"
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc

echo "-- Ensure Better Auth secret exists"
if npx wrangler secret list --config wrangler.jsonc 2>/dev/null | grep -q "BETTER_AUTH_SECRET"; then
  echo "BETTER_AUTH_SECRET already configured"
else
  printf "%s" "$(openssl rand -base64 48)" | npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc
  echo "BETTER_AUTH_SECRET configured"
fi

echo "-- Verify Python tooling"
if ! command -v uv >/dev/null; then
  echo "uv is required to package the Cloudflare Python Worker."
  echo "Install uv, then rerun this script: https://docs.astral.sh/uv/getting-started/installation/"
  exit 2
fi

echo "-- Test Python statistics engine"
(
  cd services/stats-worker
  uv sync --group dev
  uv run --group dev pytest tests -q
)

echo "-- Deploy internal Python statistics Worker"
(
  cd services/stats-worker
  uv run --group dev pywrangler deploy --config wrangler.jsonc
)

echo "-- Deploy Methodome API Worker"
npx wrangler deploy --config wrangler.jsonc

echo "-- Deploy Methodome web Worker"
npm --workspace @methodome/web run deploy:cloudflare

echo "-- Verify public health endpoints"
curl --fail --silent --show-error https://api.methodome.com/api/health
echo

echo "-- Run complete research workflow"
METHODOME_API_URL=https://api.methodome.com/api node scripts/e2e-smoke.mjs

echo "== Methodome production deployment complete =="
