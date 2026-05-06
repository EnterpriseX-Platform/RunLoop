#!/usr/bin/env bash
# Generates strong secrets for a fresh .env file.
# Usage: scripts/gen-secrets.sh >> .env
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found — install it first" >&2
  exit 1
fi

echo "JWT_SECRET=$(openssl rand -hex 48)"
echo "SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
