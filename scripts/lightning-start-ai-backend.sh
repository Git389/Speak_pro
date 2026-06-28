#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/metahuman-server/backend"
PIPER_VOICE_DIR="${PIPER_VOICE_DIR:-$ROOT_DIR/piper-voices}"
DEFAULT_PIPER_VOICE="${DEFAULT_PIPER_VOICE:-en_US-lessac-medium}"

cd "$BACKEND_DIR"

echo "Installing AI backend requirements into the Lightning Studio environment..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install piper-tts

mkdir -p "$PIPER_VOICE_DIR"
if [[ -z "${PIPER_VOICE:-}" ]]; then
  export PIPER_VOICE="$PIPER_VOICE_DIR/$DEFAULT_PIPER_VOICE.onnx"
fi

if [[ ! -f "$PIPER_VOICE" ]]; then
  echo "Downloading default Piper voice: $DEFAULT_PIPER_VOICE"
  curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/$DEFAULT_PIPER_VOICE.onnx?download=true" -o "$PIPER_VOICE"
  curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/$DEFAULT_PIPER_VOICE.onnx.json?download=true" -o "$PIPER_VOICE.json"
fi

export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1}"
export WHISPER_MODEL="${WHISPER_MODEL:-base.en}"
export WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}"
export WHISPER_COMPUTE="${WHISPER_COMPUTE:-int8}"

echo "Starting AI backend on :8000"
exec uvicorn app:app --host 0.0.0.0 --port 8000
