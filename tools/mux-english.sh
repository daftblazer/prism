#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# -------- CONFIG --------
ENG_DIR="${ENG_DIR:-}"       # where we EXTRACT from (English audio + English subs)
REMUX_DIR="${REMUX_DIR:-}"   # where we ADD into
OUT_DIR="${OUT_DIR:-}"
DRY_RUN="${DRY_RUN:-0}"

SEASON="${SEASON:-S01}"

AUDIO_TRACK_NAME="${AUDIO_TRACK_NAME:-English}"
SET_AUDIO_DEFAULT="${SET_AUDIO_DEFAULT:-yes}"
# ------------------------

if [[ -z "$ENG_DIR" || -z "$REMUX_DIR" || -z "$OUT_DIR" ]]; then
  echo "ERROR: ENG_DIR, REMUX_DIR, and OUT_DIR must all be set." >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need mkvmerge
need jq
need ffprobe

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${*}"
  else
    "$@"
  fi
}

prompt_mode() {
  local choice=""
  while true; do
    echo "Import options:"
    echo "  [a] audio only"
    echo "  [s] subtitles only"
    echo "  [b] both audio and subtitles"
    read -rp "Select (a/s/b): " choice
    case "${choice,,}" in
      a) echo "Mode: audio only"; IMPORT_AUDIO=1; IMPORT_SUBS=0; return ;;
      s) echo "Mode: subtitles only"; IMPORT_AUDIO=0; IMPORT_SUBS=1; return ;;
      b) echo "Mode: both audio and subtitles"; IMPORT_AUDIO=1; IMPORT_SUBS=1; return ;;
      *) echo "Invalid choice, please enter a, s, or b." ;;
    esac
  done
}

prompt_remove_subs() {
  local choice=""
  while true; do
    read -rp "Remove existing subtitles from REMUX files before adding ENG subs? (y/n): " choice
    case "${choice,,}" in
      y|yes) REMOVE_REMUX_SUBS=1; return ;;
      n|no)  REMOVE_REMUX_SUBS=0; return ;;
      *) echo "Please enter y or n." ;;
    esac
  done
}

IMPORT_AUDIO=1
IMPORT_SUBS=1
if [[ -n "${IMPORT_MODE:-}" ]]; then
  case "${IMPORT_MODE,,}" in
    a) IMPORT_AUDIO=1; IMPORT_SUBS=0 ;;
    s) IMPORT_AUDIO=0; IMPORT_SUBS=1 ;;
    b) IMPORT_AUDIO=1; IMPORT_SUBS=1 ;;
    *) echo "Invalid IMPORT_MODE: $IMPORT_MODE (use a, s, or b)" >&2; exit 1 ;;
  esac
else
  prompt_mode
fi
if [[ -n "${REMOVE_REMUX_SUBS:-}" ]]; then
  : # already set from env
else
  REMOVE_REMUX_SUBS=0
  prompt_remove_subs
fi

mkdir -p "$OUT_DIR"
shopt -s nullglob

# Temp workspace for holding subtitle-only extracts from the REMUX files.
TMP_ROOT="$(mktemp -d -t mux-eng-XXXXXX)"
cleanup_tmp() {
  [[ -d "$TMP_ROOT" ]] && rm -rf "$TMP_ROOT"
}
trap cleanup_tmp EXIT

extract_token() {
  local name="$1"
  if [[ "$name" =~ ([sS][0-9]{2}[eE][0-9]{2}) ]]; then
    echo "${BASH_REMATCH[1]^^}"
  else
    echo ""
  fi
}

# First English AUDIO track ID (type=audio, language=eng)
find_eng_audio_id() {
  local f="$1"
  mkvmerge -J "$f" | jq -r '
    .tracks
    | map(select(.type=="audio"))
    | ( map(select((.properties.language // "")=="eng"))[0]
        // map(select((.properties.track_name // "" | ascii_downcase) | test("english")))[0]
        // empty
      )
    | .id // empty
  '
}

# Subtitle track IDs we want (English language or Honorifics), comma-separated
find_all_target_sub_ids_csv() {
  local f="$1"
  mkvmerge -J "$f" | jq -r '
    .tracks
    | map(select(.type=="subtitles"))
    | map(select(
        (.properties.language // "")=="eng"
        or (.properties.language // "")=="enm"
        or ((.properties.track_name // "" | ascii_downcase) | test("honorific"))
      ))
    | map(.id)
    | join(",")
  '
}

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

  eng_audio_id=""
  if [[ $IMPORT_AUDIO -eq 1 ]]; then
    eng_audio_id="$(find_eng_audio_id "$eng" || true)"
    if [[ -z "${eng_audio_id:-}" ]]; then
      echo "FAILED $token: No English audio track found in:"
      echo "  $(basename "$eng")"
      continue
    fi
  fi

  sub_ids_csv=""
  if [[ $IMPORT_SUBS -eq 1 ]]; then
    sub_ids_csv="$(find_all_target_sub_ids_csv "$eng" || true)"
    if [[ -z "${sub_ids_csv:-}" ]]; then
      echo "FAILED $token: No English/Honorific subtitle tracks found in:"
      echo "  $(basename "$eng")"
      continue
    fi
  fi

  out="$OUT_DIR/$remux_base"

  echo "=== $token ==="
  echo "ENG source: $(basename "$eng")"
  echo "REMUX dest: $remux_base"
  [[ $IMPORT_AUDIO -eq 1 ]] && echo "ENG audio track id: $eng_audio_id"
  [[ $IMPORT_SUBS -eq 1 ]] && echo "Selected subtitle track ids: $sub_ids_csv"
  [[ $REMOVE_REMUX_SUBS -eq 0 ]] && echo "Original REMUX subtitles will be preserved."
  [[ $REMOVE_REMUX_SUBS -eq 1 ]] && echo "Original REMUX subtitles will be dropped."
  echo

  default_flag="0"
  [[ "$SET_AUDIO_DEFAULT" == "yes" ]] && default_flag="1"

  # Extract REMUX subtitles to a temporary MKV so we can re-attach them after
  # bringing in the new ENG subtitles, avoiding any accidental overwrites.
  remux_subs_mkv="$TMP_ROOT/${token}_subs.mkv"
  if [[ $REMOVE_REMUX_SUBS -eq 0 ]]; then
    echo "Extracting existing REMUX subtitles -> $remux_subs_mkv"
    run_cmd mkvmerge -o "$remux_subs_mkv" --no-video --no-audio "$remux"
  fi

  # Build mkvmerge command:
  #  - First input: REMUX without subtitles (video, audio, attachments intact)
  #  - Second input: ENG source with selected audio/sub tracks
  #  - Third input: the subtitle-only MKV extracted from REMUX (if keeping them)
  cmd=( mkvmerge -o "$out" )
  cmd+=( --no-subtitles "$remux" )

  # Select tracks from ENG source file
  cmd+=( --no-video )
  [[ $IMPORT_AUDIO -eq 1 ]] && cmd+=( --audio-tracks "$eng_audio_id" )
  [[ $IMPORT_AUDIO -eq 0 ]] && cmd+=( --no-audio )

  if [[ $IMPORT_SUBS -eq 1 ]]; then
    cmd+=( --subtitle-tracks "$sub_ids_csv" )
  else
    cmd+=( --no-subtitles )
  fi

  if [[ $IMPORT_AUDIO -eq 1 ]]; then
    # Set properties on the ENG audio track (track IDs here refer to the ENG input file)
    cmd+=( --language "${eng_audio_id}:eng"
           --track-name "${eng_audio_id}:${AUDIO_TRACK_NAME}"
           --default-track "${eng_audio_id}:${default_flag}"
         )
  fi

  cmd+=( "$eng" )

  # Re-attach original REMUX subtitles after the ENG tracks so nothing is overwritten.
  if [[ $REMOVE_REMUX_SUBS -eq 0 ]]; then
    cmd+=( --no-audio --no-video "$remux_subs_mkv" )
  fi

  echo "Muxing -> $out"
  run_cmd "${cmd[@]}"
  [[ "$DRY_RUN" -eq 0 ]] && echo "Done." || echo "[dry-run] Skipped mux; command shown above."
  echo
done

echo "All done. Output: $OUT_DIR"
