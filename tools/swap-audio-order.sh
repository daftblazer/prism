#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Reorders audio tracks per file.
# Default: swap the first two audio tracks (common case: make preferred language first).
# You can manually choose which audio positions to front-load via SWAP_ORDER (1-based positions).
#   - Example: SWAP_ORDER="2,1" (swap first two)
#   - Example: SWAP_ORDER="3,1,2" (bring 3rd track first, then 1st, then 2nd, then the rest)
# Tracks not listed remain in their original relative order after the chosen ones.
# Strategy:
#   1) Take original file as primary input but strip its audio.
#   2) Re-attach audio from the same file in the new order.
# Preserves video, subtitles, chapters, attachments, and tags.

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"
: "${OUTPUT_DIR:=$INPUT_DIR}"
: "${TARGET_GLOB:=*.mkv}"
: "${SWAP_ORDER:=2,1}"   # comma-separated 1-based positions in desired order

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need jq

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $INPUT_DIR"
  exit 0
fi

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${*}"
  else
    "$@"
  fi
}

for src in "${files[@]}"; do
  base="$(basename "$src")"
  out="$OUTPUT_DIR/$base"

  echo "==> $base"

  media_json="$(mkvmerge -J "$src")"

  # Collect audio track ids in file order.
  mapfile -t audio_ids < <(
    printf '%s' "$media_json" | jq -r '
      .tracks
      | map(select(.type=="audio"))
      | map(.id)
      | .[]
    '
  )

  total=${#audio_ids[@]}
  if [[ $total -lt 2 && -z "${SWAP_ORDER:-}" ]]; then
    echo "  Skipped (found <2 audio tracks and no custom SWAP_ORDER); leaving as-is."
    continue
  fi

  # Collect non-audio track ids (video, subtitles, buttons, etc.) in order.
  mapfile -t nona_ids < <(
    printf '%s' "$media_json" | jq -r '
      .tracks
      | map(select(.type!="audio"))
      | map(.id)
      | .[]
    '
  )

  # Build desired order from SWAP_ORDER (1-based positions).
  IFS=',' read -r -a order_pos <<<"$SWAP_ORDER"
  new_order=()
  used=()

  valid_pos() {
    local p="$1"
    [[ "$p" =~ ^[0-9]+$ ]] && (( p>=1 && p<=total ))
  }

  # Add requested positions first (if valid and not duplicated).
  for p in "${order_pos[@]}"; do
    if valid_pos "$p"; then
      idx=$((p-1))
      track_id="${audio_ids[$idx]}"
      if [[ -z "${used[$idx]:-}" ]]; then
        new_order+=("$track_id")
        used[$idx]=1
      fi
    else
      echo "  Warning: SWAP_ORDER position '$p' is out of range (1-$total); ignored."
    fi
  done

  # Append the rest in original order.
  for i in "${!audio_ids[@]}"; do
    if [[ -z "${used[$i]:-}" ]]; then
      new_order+=("${audio_ids[$i]}")
    fi
  done

  # Fallback: if new_order somehow empty, keep original.
  if [[ ${#new_order[@]} -eq 0 ]]; then
    new_order=("${audio_ids[@]}")
  fi

  echo "  Original audio order (by track id): $(printf '%s ' "${audio_ids[@]}")"
  echo "  New audio order (by track id):       $(printf '%s ' "${new_order[@]}")"
  echo "  SWAP_ORDER positions applied:        ${SWAP_ORDER}"

  # Build mkvmerge command:
  #   input 1: original file without audio (keeps everything else)
  #   input 2: same file, audio only, in desired order
  tmp_out="$(dirname "$out")/.tmp.$(basename "$out")"
  cmd=(mkvmerge -o "$tmp_out")
  cmd+=( --no-audio "$src" )
  # Second pass: audio only from the same file in desired order.
  cmd+=( --no-video --no-subtitles --no-chapters --no-attachments --no-track-tags --no-global-tags )
  cmd+=( --audio-tracks "$(IFS=,; echo "${new_order[*]}")" "$src" )

  # Explicit track order: all non-audio tracks from input 0, then reordered audio from input 1.
  track_order=()
  for id in "${nona_ids[@]}"; do
    track_order+=( "0:${id}" )
  done
  for id in "${new_order[@]}"; do
    track_order+=( "1:${id}" )
  done
  cmd+=( --track-order "$(IFS=,; echo "${track_order[*]}")" )

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${cmd[*]}"
  else
    "${cmd[@]}"
    mv -- "$tmp_out" "$out"
  fi
done

echo "Done. Output -> $OUTPUT_DIR"
