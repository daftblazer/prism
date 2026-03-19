#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# -------- CONFIG --------
ENG_DIR="${ENG_DIR:-}"       # where we EXTRACT from (has commentary track)
REMUX_DIR="${REMUX_DIR:-}"   # where we ADD into
OUT_DIR="${OUT_DIR:-}"
DRY_RUN="${DRY_RUN:-0}"

SEASON="${SEASON:-S02}"

# Commentary settings
COMMENTARY_AUDIO_INDEX="${COMMENTARY_AUDIO_INDEX:-2}"             # 0-based index among AUDIO tracks: 2 == "track 3"
COMMENTARY_TRACK_NAME="${COMMENTARY_TRACK_NAME:-English Commentary}"
SET_COMMENTARY_DEFAULT="no"            # usually "no" so main audio stays default
# ------------------------

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

# Get the Nth audio track ID (0-based) from a file
find_nth_audio_id() {
  local f="$1"
  local idx="$2"
  mkvmerge -J "$f" | jq -r --argjson i "$idx" '
    .tracks
    | map(select(.type=="audio"))
    | .[$i].id // empty
  '
}

mkdir -p "$OUT_DIR"
shopt -s nullglob

declare -A ENG_BY_TOKEN
for eng in "$ENG_DIR"/*.mkv; do
  token="$(extract_token "$(basename "$eng")")"
  [[ -n "$token" && "$token" == ${SEASON}E* ]] || continue
  ENG_BY_TOKEN["$token"]="$eng"
done

for remux in "$REMUX_DIR"/*.mkv; do
  remux_base="$(basename "$remux")"
  token="$(extract_token "$remux_base")"

  [[ -n "$token" && "$token" == ${SEASON}E* ]] || continue

  eng="${ENG_BY_TOKEN["$token"]:-}"
  if [[ -z "${eng:-}" ]]; then
    echo "No ENG source match for $token -> $remux_base"
    continue
  fi

  if [[ ! -f "$eng" ]]; then
    echo "ENG source file not available locally: $eng"
    continue
  fi

  comm_id="$(find_nth_audio_id "$eng" "$COMMENTARY_AUDIO_INDEX" || true)"
  if [[ -z "${comm_id:-}" ]]; then
    echo "FAILED $token: Could not find audio index $COMMENTARY_AUDIO_INDEX (track 3) in:"
    echo "  $(basename "$eng")"
    echo "Tip: run: mkvmerge -i \"${eng}\""
    continue
  fi

  out="$OUT_DIR/$remux_base"

  echo "=== $token ==="
  echo "ENG source: $(basename "$eng")"
  echo "REMUX dest: $remux_base"
  echo "Commentary audio track id (from ENG): $comm_id"
  echo

  default_flag="0"
  [[ "$SET_COMMENTARY_DEFAULT" == "yes" ]] && default_flag="1"

  # Build mkvmerge command:
  # - First input: REMUX (kept as-is)
  # - Second input: ENG file, but only the commentary audio track (no video/subs)
  cmd=( mkvmerge -o "$out" )

  # Keep everything from remux
  cmd+=( "$remux" )

  # Add only commentary audio from ENG source
  cmd+=( --no-video --no-subtitles --audio-tracks "$comm_id"
         --language "${comm_id}:eng"
         --track-name "${comm_id}:${COMMENTARY_TRACK_NAME}"
         --default-track "${comm_id}:${default_flag}"
         "$eng"
  )

  echo "Muxing -> $out"
  run_cmd "${cmd[@]}"
  [[ "$DRY_RUN" -eq 0 ]] && echo "Done." || echo "[dry-run] Skipped mux; command shown above."
  echo
done

echo "All done. Output: $OUT_DIR"

