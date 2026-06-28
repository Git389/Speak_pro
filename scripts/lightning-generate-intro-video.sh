#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TALK_URL="${TALK_URL:-http://127.0.0.1:8100/talk}"
SCRIPT_FILE="${SCRIPT_FILE:-$ROOT_DIR/scripts/intro/speak-ai-app-intro.txt}"
WORK_DIR="${WORK_DIR:-$ROOT_DIR/.epsilon-runtime/intro-video}"
OUTPUT_FILE="${OUTPUT_FILE:-$ROOT_DIR/.epsilon-runtime/speak-ai-app-intro-5min.mp4}"

mkdir -p "$WORK_DIR"
mkdir -p "$(dirname "$OUTPUT_FILE")"

if [[ ! -f "$SCRIPT_FILE" ]]; then
  echo "Script file not found: $SCRIPT_FILE"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it first, for example:"
  echo "  conda install -y -c conda-forge ffmpeg"
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found. Install ffmpeg first."
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  echo "python is required"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi

health_url="${TALK_URL%/talk}/health"
echo "Checking talking-head backend:"
echo "  $health_url"
curl -fsS "$health_url" >/dev/null

SEGMENTS_FILE="$WORK_DIR/segments.txt"
rm -f "$SEGMENTS_FILE"
rm -f "$WORK_DIR"/segment-*.mp4

segment_count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  trimmed="$(printf '%s' "$line" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [[ -z "$trimmed" ]] && continue
  [[ "$trimmed" == \#* ]] && continue

  segment_count=$((segment_count + 1))
  segment_name="segment-$(printf '%03d' "$segment_count").mp4"
  segment_path="$WORK_DIR/$segment_name"

  echo "Rendering segment $segment_count..."
  payload="$(TEXT="$trimmed" python - <<'PY'
import json, os
print(json.dumps({"text": os.environ["TEXT"]}))
PY
)"

  http_code="$(curl -sS -o "$segment_path" -w "%{http_code}" -X POST "$TALK_URL" \
    -H "Content-Type: application/json" \
    -d "$payload" \
  )"

  if [[ "$http_code" != "200" ]]; then
    echo "Segment $segment_count failed with HTTP $http_code"
    echo "Response:"
    cat "$segment_path"
    exit 1
  fi

  if ! ffprobe -v error "$segment_path" >/dev/null 2>&1; then
    echo "Segment $segment_count is not a valid media file: $segment_path"
    echo "First bytes of response:"
    head -c 200 "$segment_path" || true
    echo
    exit 1
  fi

  printf "file '%s'\n" "$segment_path" >> "$SEGMENTS_FILE"
done < "$SCRIPT_FILE"

if [[ "$segment_count" -eq 0 ]]; then
  echo "No segments found in $SCRIPT_FILE"
  exit 1
fi

echo "Combining $segment_count segments into:"
echo "  $OUTPUT_FILE"

ffmpeg -y \
  -f concat \
  -safe 0 \
  -i "$SEGMENTS_FILE" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -c:a aac \
  -movflags +faststart \
  "$OUTPUT_FILE"

echo "Done:"
ls -lh "$OUTPUT_FILE"
