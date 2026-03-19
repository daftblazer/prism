#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate a sample clip from an MKV file.
# Extracts a segment from the middle of the video, preserving all streams.
#
# Usage:
#   ./generate-sample.sh                          # defaults: 60s clip from first MKV in Output
#   INPUT_DIR=/path/to/files DURATION=90 ./generate-sample.sh

: "${INPUT_DIR:=Output}"
: "${SAMPLE_DIR:=${INPUT_DIR}/Samples}"
: "${DURATION:=60}"
: "${START_TIME:=}"         # empty = auto (25% into the video)
: "${SOURCE_FILE:=}"        # empty = first MKV in INPUT_DIR
: "${FFMPEG_BIN:=ffmpeg}"
: "${FFPROBE_BIN:=ffprobe}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need "$FFMPEG_BIN"
need "$FFPROBE_BIN"

# Resolve source file
if [[ -n "$SOURCE_FILE" ]]; then
  input="$SOURCE_FILE"
  if [[ ! -f "$input" ]]; then
    echo "Source file not found: $input" >&2
    exit 1
  fi
else
  mapfile -t mkvs < <(find "$INPUT_DIR" -maxdepth 1 -type f -name '*.mkv' | sort)
  if [[ ${#mkvs[@]} -eq 0 ]]; then
    echo "No MKV found in $INPUT_DIR" >&2
    exit 1
  fi
  input="${mkvs[0]}"
fi

base="$(basename "$input" .mkv)"

# Get total duration
total_duration="$($FFPROBE_BIN -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -i "$input")"
if [[ -z "$total_duration" ]]; then
  echo "Could not read duration from $input" >&2
  exit 1
fi

# Calculate start time if not specified (default: 25% into the video)
if [[ -z "$START_TIME" ]]; then
  START_TIME=$(python3 - "$total_duration" "$DURATION" <<'PY'
import sys
total = float(sys.argv[1])
dur = float(sys.argv[2])
# Start at 25% into the video, but ensure we don't run past the end
start = total * 0.25
if start + dur > total:
    start = max(0, total - dur)
print(f"{start:.2f}")
PY
)
fi

mkdir -p "$SAMPLE_DIR"
out="$SAMPLE_DIR/${base}.sample.mkv"

echo "Source:    $input"
echo "Duration: ${DURATION}s starting at ${START_TIME}s (total: ${total_duration}s)"
echo "Output:   $out"

"$FFMPEG_BIN" -hide_banner -y \
  -ss "$START_TIME" -i "$input" -t "$DURATION" \
  -map 0 -c copy \
  -avoid_negative_ts make_zero \
  "$out"

# Show resulting file size
size=$(du -h "$out" | cut -f1)
echo "Sample created: $out ($size)"
