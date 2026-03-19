#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate batches of evenly spaced screenshots for every MKV in Output.
# Usage:
#   ./11.generate_screenshots.sh             # defaults: 8 shots, png, folder Screenshots
#   SHOT_COUNT=12 SHOT_FMT=jpg ./11.generate_screenshots.sh
#
# Output: Screenshots/<basename>_shotNNN.<ext> for each file

: "${OUTPUT_DIR:=Output}"
: "${SHOT_DIR:=Screenshots}"
: "${SHOT_COUNT:=8}"
: "${SHOT_FMT:=png}"
: "${FFMPEG_BIN:=ffmpeg}"
: "${FFPROBE_BIN:=ffprobe}"
: "${ALL:=0}"  # set ALL=1 to process all MKVs; default is first only
: "${SHOT_PREFIX:=}"  # optional: override screenshot filename prefix (e.g. "MyVariant")
: "${INPUT_FILE:=}"   # optional: direct path to a single file (skips OUTPUT_DIR scan)

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need "$FFMPEG_BIN"
need "$FFPROBE_BIN"

mkdir -p "$SHOT_DIR"

if [[ -n "$INPUT_FILE" ]]; then
  [[ -f "$INPUT_FILE" ]] || { echo "INPUT_FILE not found: $INPUT_FILE" >&2; exit 1; }
  mkvs=("$INPUT_FILE")
elif [[ "$ALL" -eq 1 ]]; then
  mapfile -t mkvs < <(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.mkv' | sort)
else
  mapfile -t mkvs < <(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.mkv' | sort | head -n1)
fi

if [[ ${#mkvs[@]} -eq 0 ]]; then
  echo "No MKV found in $OUTPUT_DIR" >&2
  exit 1
fi

for sample in "${mkvs[@]}"; do
  base="$(basename "$sample" .mkv)"
  safe_base="$(printf '%s' "$base" | tr -d '[]')"
  prefix="${SHOT_PREFIX:-$safe_base}"
  out_prefix="$SHOT_DIR/${prefix}_shot"

  duration="$($FFPROBE_BIN -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -i "$sample")"
  if [[ -z "$duration" ]]; then
    echo "Could not read duration from $sample; skipping." >&2
    continue
  fi

  interval=$(python3 - "$duration" "$SHOT_COUNT" <<'PY'
import sys
dur=float(sys.argv[1])
shots=int(sys.argv[2])
print(dur/(shots+1))
PY
)

  # Detect color matrix and range to ensure consistent YUV→RGB conversion.
  # Without this, untagged sources use a different matrix than tagged encodes,
  # and limited-range 10-bit content produces darker screenshots.
  color_matrix="$($FFPROBE_BIN -v error -select_streams v:0 \
    -show_entries stream=color_space -of default=noprint_wrappers=1:nokey=1 "$sample" 2>/dev/null)"
  color_matrix="${color_matrix:-unknown}"
  if [[ "$color_matrix" == "unknown" || -z "$color_matrix" ]]; then
    color_matrix="bt709"
  fi

  color_range="$($FFPROBE_BIN -v error -select_streams v:0 \
    -show_entries stream=color_range -of default=noprint_wrappers=1:nokey=1 "$sample" 2>/dev/null)"
  color_range="${color_range:-unknown}"
  # Default to limited (tv) range for unknown — standard for HD broadcast/disc content
  if [[ "$color_range" == "unknown" || -z "$color_range" ]]; then
    color_range="tv"
  fi

  # Explicit in_range→out_range ensures limited (16-235) is expanded to full (0-255) for RGB output.
  # Without this, 10-bit limited-range content writes darker values directly into 8-bit RGB.
  # Tested against VapourSynth resize.Lanczos (the reference used by comp.py) — scale matches
  # to <0.5 mean_abs per pixel, while zscale introduces a systematic shift (~1.0 mean_abs).
  # setparams at the end strips video color metadata (transfer/primaries/matrix) so the PNG
  # encoder doesn't write gAMA/cHRM chunks — those cause color-managed viewers to render
  # source (no gAMA → sRGB gamma 0.4545) and encode (bt709 gAMA 0.5099) differently.
  vf_color="scale=in_color_matrix=${color_matrix}:in_range=${color_range}:out_range=pc:flags=accurate_rnd+full_chroma_int,setparams=color_trc=unknown:color_primaries=unknown:colorspace=unknown"

  echo "Generating $SHOT_COUNT shots for $(basename "$sample") (matrix: $color_matrix, range: $color_range)"
  idx=1
  while [[ $idx -le $SHOT_COUNT ]]; do
    time=$(python3 - "$interval" "$idx" <<'PY'
import sys
interval=float(sys.argv[1])
idx=int(sys.argv[2])
print(interval*idx)
PY
)
    ts=$(printf "%06.2f" "$time")
    out="${out_prefix}$(printf '%03d' "$idx").${SHOT_FMT}"
    if "$FFMPEG_BIN" -y -ss "$ts" -i "$sample" -frames:v 1 \
        -vf "$vf_color" -pix_fmt rgb24 \
        -f image2 -update 1 "$out" >/dev/null 2>&1; then
      echo "  Saved $(basename "$out") (t=$ts)"
    else
      echo "  FFmpeg failed at shot $idx (t=$ts) for $(basename "$sample")" >&2
      break
    fi
    idx=$((idx+1))
  done
done

echo "Screenshots written to $SHOT_DIR"
