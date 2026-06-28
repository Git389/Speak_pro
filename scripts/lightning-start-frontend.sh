#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/r3f-interviewer"

cd "$FRONTEND_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  cat <<'EOF'
Node.js and npm are required to run the frontend in Lightning Studio.

Install them in the Studio, then rerun:
  conda install -y -c conda-forge nodejs
EOF
  exit 1
fi

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
fi

echo "Installing frontend dependencies..."
npm install

echo "Starting React frontend on :5173"
exec npm run dev -- --host 0.0.0.0 --port 5173
