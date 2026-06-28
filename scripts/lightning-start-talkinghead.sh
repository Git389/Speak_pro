#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="${REPO_DIR:-$ROOT_DIR}"
SADTALKER_DIR="${SADTALKER_DIR:-$REPO_DIR/SadTalker}"
TALKINGHEAD_DIR="$REPO_DIR/talkinghead-server"

cd "$REPO_DIR"

PYTHON_VERSION="$(python - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"

echo "Lightning talking-head startup"
echo "Repo: $REPO_DIR"
echo "Python: $PYTHON_VERSION"

case "$PYTHON_VERSION" in
  3.10|3.11)
    ;;
  *)
    cat <<'EOF'
SadTalker does not install reliably on Lightning's default Python 3.12 image.

Run this first in the Studio terminal, then open a fresh terminal:
  conda install -y python=3.10

After that, run this script again.
EOF
    exit 1
    ;;
esac

if [[ ! -f "$TALKINGHEAD_DIR/portrait.jpg" ]]; then
  cat <<EOF
Missing portrait image:
  $TALKINGHEAD_DIR/portrait.jpg

Upload or copy your interviewer portrait there, then rerun this script.
EOF
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Installing ffmpeg into the Studio conda environment..."
  conda install -y -c conda-forge ffmpeg
fi

if [[ ! -d "$SADTALKER_DIR/.git" ]]; then
  echo "Cloning SadTalker..."
  git clone https://github.com/OpenTalker/SadTalker.git "$SADTALKER_DIR"
fi

cd "$SADTALKER_DIR"

echo "Installing GPU PyTorch..."
python -m pip install --upgrade pip
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo "Installing SadTalker requirements..."
python -m pip install -r requirements.txt

echo "Applying torchvision compatibility shim when needed..."
python - <<'PY'
from pathlib import Path
import importlib.util

spec = importlib.util.find_spec("torchvision")
if spec is None or spec.origin is None:
    raise SystemExit(0)

site_packages = Path(spec.origin).resolve().parent
transforms_dir = site_packages / "transforms"
legacy = transforms_dir / "functional_tensor.py"
modern = transforms_dir / "_functional_tensor.py"
if modern.exists() and not legacy.exists():
    legacy.write_text("from ._functional_tensor import *  # noqa: F401,F403\n", encoding="utf-8")
    print(f"Created compatibility shim: {legacy}")
PY

if [[ ! -f "$SADTALKER_DIR/checkpoints/SadTalker_V0.0.2_256.safetensors" ]]; then
  echo "Downloading SadTalker model weights..."
  bash scripts/download_models.sh
fi

echo "Torch CUDA check:"
python - <<'PY'
import torch
print({"cuda_available": torch.cuda.is_available(), "device_count": torch.cuda.device_count()})
PY

cd "$TALKINGHEAD_DIR"

export ENGINE="${ENGINE:-sadtalker}"
export PORTRAIT="${PORTRAIT:-$TALKINGHEAD_DIR/portrait.jpg}"
export SADTALKER_DIR="$SADTALKER_DIR"
export PYTHON_BIN="${PYTHON_BIN:-$(command -v python)}"
export SADTALKER_PREPROCESS="${SADTALKER_PREPROCESS:-crop}"
export SADTALKER_ENHANCER="${SADTALKER_ENHANCER:-}"
export SADTALKER_STILL="${SADTALKER_STILL:-1}"
export TTS_RATE="${TTS_RATE:-190}"

echo "Installing talking-head backend requirements..."
python -m pip install -r requirements.txt
python -m pip install piper-tts

echo "Starting talking-head backend on :8100"
exec uvicorn app:app --host 0.0.0.0 --port 8100
