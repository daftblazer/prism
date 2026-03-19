#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Compare runtimes between Input and Mux episodes (matched by SxxEyy).
# Prints per-episode diff (REMUX - ENG) and the average diff at the end.

INPUT_DIR="${INPUT_DIR:-./Input}"
ENG_DIR="${ENG_DIR:-./Mux}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need ffprobe

extract_token() {
  local name="$1"
  if [[ "$name" =~ ([sS][0-9]{2}[eE][0-9]{2}) ]]; then
    echo "${BASH_REMATCH[1]^^}"
  else
    echo ""
  fi
}

duration_ms() {
  local f="$1"
  local dur_ms
  dur_ms="$(ffprobe -v error -select_streams v:0 -show_entries stream=duration \
    -of default=noprint_wrappers=1:nokey=1 "$f" \
    | awk 'NR==1 && $1 != "N/A" {printf("%.0f", $1 * 1000)}')"
  if [[ -z "${dur_ms:-}" ]]; then
    dur_ms="$(ffprobe -v error -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 "$f" \
      | awk 'NR==1 {printf("%.0f", $1 * 1000)}')"
  fi
  echo "${dur_ms:-0}"
}

declare -A REMUX
declare -A ENG

shopt -s nullglob
for f in "$INPUT_DIR"/*.mkv; do
  token="$(extract_token "$(basename "$f")")"
  [[ -n "$token" ]] && REMUX["$token"]="$f"
done
for f in "$ENG_DIR"/*.mkv; do
  token="$(extract_token "$(basename "$f")")"
  [[ -n "$token" ]] && ENG["$token"]="$f"
done
shopt -u nullglob

tokens=()
for t in "${!REMUX[@]}"; do
  [[ -n "${ENG[$t]:-}" ]] && tokens+=("$t")
done

if (( ${#tokens[@]} == 0 )); then
  echo "No matching episodes found between $INPUT_DIR and $ENG_DIR."
  exit 0
fi

printf "%-8s %12s %12s %12s\n" "Token" "REMUX(ms)" "ENG(ms)" "Diff(ms)"
printf "%-8s %12s %12s %12s\n" "-----" "---------" "-------" "-------"

total_diff=0
count=0

for token in "${tokens[@]}"; do
  remux_f="${REMUX[$token]}"
  eng_f="${ENG[$token]}"
  remux_ms=$(duration_ms "$remux_f")
  eng_ms=$(duration_ms "$eng_f")
  diff_ms=$(( remux_ms - eng_ms ))
  printf "%-8s %12d %12d %12d\n" "$token" "$remux_ms" "$eng_ms" "$diff_ms"
  total_diff=$(( total_diff + diff_ms ))
  count=$(( count + 1 ))
done

avg=$(awk -v sum="$total_diff" -v n="$count" 'BEGIN{ if(n==0){print 0}else{printf("%.2f", sum/n)} }')
printf "\nAverage diff (REMUX - ENG): %s ms across %d episodes\n" "$avg" "$count"
