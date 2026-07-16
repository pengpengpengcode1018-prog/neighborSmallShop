#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Repository: $ROOT_DIR"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

npm install
npm run verify

echo
echo "Initialization verified. Common commands:"
echo "  npm run infra:up"
echo "  npm run dev:server"
echo "  npm run dev:admin"
echo "  npm run dev:miniapp"

if [[ "${RUN_START_COMMAND:-0}" == "1" ]]; then
  npm run dev:server
fi

