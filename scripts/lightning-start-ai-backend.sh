#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/metahuman-server/backend"

cd "$BACKEND_DIR"

echo "Installing AI backend requirements into the Lightning Studio environment..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install piper-tts

export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1}"
export WHISPER_MODEL="${WHISPER_MODEL:-base.en}"
export WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}"
export WHISPER_COMPUTE="${WHISPER_COMPUTE:-int8}"

echo "Starting AI backend on :8000"
exec uvicorn app:app --host 0.0.0.0 --port 8000
