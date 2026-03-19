#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="Input"
OUTPUT_DIR="Input/Samples"
DURATION="${DURATION:-30}"
START="${START:-240}"
OVERWRITE="${OVERWRITE:-0}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need_cmd ffmpeg

mkdir -p "$OUTPUT_DIR"
shopt -s nullglob

files=("$INPUT_DIR"/*.mkv)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .mkv files found in $INPUT_DIR"
  exit 0
fi

for input in "${files[@]}"; do
  base="$(basename "$input")"
  stem="${base%.mkv}"
  output="$OUTPUT_DIR/${stem}.sample_${DURATION}s.mkv"

  if [[ -f "$output" && "$OVERWRITE" != "1" ]]; then
    echo "Skipping existing sample: $output"
    continue
  fi

  echo "Creating sample: $input -> $output"

  ffmpeg -hide_banner -loglevel warning \
    -ss "$START" \
    -i "$input" \
    -t "$DURATION" \
    -map 0 \
    -c copy \
    -y "$output"
done

echo "Done. Samples are in $OUTPUT_DIR"
