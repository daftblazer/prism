#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Helper to report whether a video is CFR or VFR.
# Prefers mediainfo; falls back to ffprobe if mediainfo is unavailable.
# Usage: ./0.check_vfr [file]
# If no file is provided, it uses the first video in ./Input matching mkv/mp4/mov.

have() { command -v "$1" >/dev/null 2>&1; }

pick_default_file() {
  shopt -s nullglob
  local matches=(Input/*.{mkv,mp4,mov})
  if [[ ${#matches[@]} -gt 0 ]]; then
    echo "${matches[0]}"
  fi
}

FILE="${1:-$(pick_default_file)}"
if [[ -z "${FILE:-}" ]]; then
  echo "No input file provided and none found in ./Input"
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE"
  exit 1
fi

echo "Analyzing: $FILE"

if have mediainfo; then
  line="$(mediainfo "$FILE" | awk -F':' '/Frame rate mode/{gsub(/^[ \t]+/,"",$2); print $2; exit}')"
  if [[ -z "$line" ]]; then
    echo "Frame rate mode not reported by mediainfo."
    exit 1
  fi
  mode_uc="$(echo "$line" | tr '[:lower:]' '[:upper:]')"
  echo "Frame rate mode: $line"
  if [[ "$mode_uc" == *VARIABLE* ]]; then
    echo "Result: VFR"
  elif [[ "$mode_uc" == *CONSTANT* ]]; then
    echo "Result: CFR"
  else
    echo "Result: Unknown (reported: $line)"
  fi
  exit 0
fi

if have ffprobe; then
  FRAME_LIMIT="${FRAME_LIMIT:-400}"
  echo "mediainfo not found; using ffprobe sample of $FRAME_LIMIT frames."

  collect_deltas() {
    ffprobe -v error -select_streams v:0 -read_intervals %+#"$FRAME_LIMIT" \
      -show_frames -show_entries frame=pts_time \
      -of csv=p=0 "$FILE" \
    | awk '
        BEGIN{have_prev=0}
        {
          # Keep only the first column (pts_time); extra columns (timecode tags) are ignored.
          split($0, a, ",");
          val=a[1];
          if (val ~ /^-?[0-9]+(\.[0-9]+)?$/) {
            if (!have_prev) { prev=val; have_prev=1; next }
            delta=val-prev;
            if (delta>0) printf "%.6f\n", delta;
            prev=val;
          }
        }'
  }

  mapfile -t durations < <(collect_deltas)
  total=${#durations[@]}
  if [[ $total -eq 0 ]]; then
    echo "Could not derive frame durations from ffprobe."
    exit 1
  fi

  unique=$(printf "%s\n" "${durations[@]}" | sort -u | wc -l | tr -d '[:space:]')
  if [[ $unique -gt 1 ]]; then
    verdict="VFR"
  else
    verdict="CFR"
  fi

  echo "Result: $verdict"
  echo "Frames analyzed: $total | Unique durations: $unique"
  exit 0
fi

echo "Neither mediainfo nor ffprobe is installed. Please install one of them."
exit 1
