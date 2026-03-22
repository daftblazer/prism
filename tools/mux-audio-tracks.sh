#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Mux selected audio tracks from SOURCE_DIR into TARGET_DIR files.
# Pairs files by S##E## episode token. Replaces mux-english.sh and mux-commentary.sh.

: "${SOURCE_DIR:=}"
: "${TARGET_DIR:=}"
: "${OUT_DIR:=}"
: "${DRY_RUN:=0}"
: "${SEASON:=S01}"
: "${TRACK_INDICES:=0}"           # comma-separated 0-based audio track indices to extract
: "${TRACK_NAMES:=}"              # pipe-separated names for each track (optional)

if [[ -z "$SOURCE_DIR" || -z "$TARGET_DIR" || -z "$OUT_DIR" ]]; then
  echo "ERROR: SOURCE_DIR, TARGET_DIR, and OUT_DIR must all be set." >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need mkvmerge
need jq

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

extract_token() {
  local name="$1"
  if [[ "$name" =~ ([sS][0-9]{2}[eE][0-9]{2}) ]]; then
    echo "${BASH_REMATCH[1]^^}"
  else
    echo ""
  fi
}

# Parse track indices
IFS=',' read -ra INDICES <<< "$TRACK_INDICES"

# Parse track names (pipe-separated)
IFS='|' read -ra NAMES <<< "${TRACK_NAMES:-}"

mkdir -p "$OUT_DIR"
shopt -s nullglob

# Index source files by episode token
declare -A SOURCE_BY_TOKEN
for src in "$SOURCE_DIR"/*.mkv; do
  token="$(extract_token "$(basename "$src")")"
  [[ -n "$token" && "$token" == ${SEASON}E* ]] || continue
  SOURCE_BY_TOKEN["$token"]="$src"
done

if [[ ${#SOURCE_BY_TOKEN[@]} -eq 0 ]]; then
  echo "No source files found matching season $SEASON in $SOURCE_DIR"
  exit 1
fi

for target in "$TARGET_DIR"/*.mkv; do
  target_base="$(basename "$target")"
  token="$(extract_token "$target_base")"

  [[ -n "$token" && "$token" == ${SEASON}E* ]] || continue

  src="${SOURCE_BY_TOKEN["$token"]:-}"
  if [[ -z "${src:-}" ]]; then
    echo "No source match for $token -> $target_base"
    continue
  fi

  if [[ ! -f "$src" ]]; then
    echo "Source file not found: $src"
    continue
  fi

  # Get audio track IDs from source at the specified indices
  src_audio_json="$(mkvmerge -J "$src" | jq -r '.tracks | map(select(.type=="audio"))')"
  total_audio="$(printf '%s' "$src_audio_json" | jq 'length')"

  track_ids=()
  for idx in "${INDICES[@]}"; do
    idx="$(echo "$idx" | tr -d '[:space:]')"
    if [[ "$idx" -ge "$total_audio" ]]; then
      echo "WARNING $token: audio index $idx out of range (only $total_audio tracks); skipping index"
      continue
    fi
    tid="$(printf '%s' "$src_audio_json" | jq -r --argjson i "$idx" '.[$i].id')"
    track_ids+=("$tid")
  done

  if [[ ${#track_ids[@]} -eq 0 ]]; then
    echo "FAILED $token: No valid audio tracks found at indices $TRACK_INDICES"
    continue
  fi

  out="$OUT_DIR/$target_base"
  track_csv="$(IFS=,; echo "${track_ids[*]}")"

  echo "=== $token ==="
  echo "Source:  $(basename "$src")"
  echo "Target:  $target_base"
  echo "Tracks:  indices=[${TRACK_INDICES}] -> IDs=[$track_csv]"

  # Build mkvmerge command
  cmd=( mkvmerge -o "$out" )
  # Keep everything from target
  cmd+=( "$target" )
  # Add selected audio tracks from source (no video, no subs)
  cmd+=( --no-video --no-subtitles --no-chapters --no-attachments --audio-tracks "$track_csv" )

  # Set track names and properties
  for i in "${!track_ids[@]}"; do
    tid="${track_ids[$i]}"
    name="${NAMES[$i]:-}"
    if [[ -n "$name" ]]; then
      cmd+=( --track-name "${tid}:${name}" )
      echo "  Track ID $tid -> name='$name'"
    fi
    # Set as non-default (don't override target's default audio)
    cmd+=( --default-track "${tid}:0" )
  done

  cmd+=( "$src" )

  echo "Muxing -> $out"
  run_cmd "${cmd[@]}"
  [[ "$DRY_RUN" -eq 0 ]] && echo "Done." || echo "[dry-run] Skipped; command shown above."
  echo
done

echo "All done. Output: $OUT_DIR"
