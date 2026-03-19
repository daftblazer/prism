#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Manually shift audio tracks by a user-specified offset (ms).
# Positive offset = audio plays later; negative = earlier.
# If no path is provided, all MKVs in ./Output are processed in batch.

DRY_RUN="${DRY_RUN:-0}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
OUT_DIR="${OUT_DIR:-./Output}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need mkvmerge
need "$PYTHON_BIN"

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${*}"
  else
    "$@"
  fi
}

list_audio_tracks() {
  local f="$1"
  "$PYTHON_BIN" - <<'PY' "$f"
import json, subprocess, sys
f = sys.argv[1]
info = subprocess.check_output(["mkvmerge", "-J", f])
j = json.loads(info)
tracks = [t for t in j.get("tracks", []) if t.get("type") == "audio"]
for t in tracks:
    tid = t.get("id")
    lang = (t.get("properties", {}).get("language") or "und").lower()
    name = t.get("properties", {}).get("track_name") or ""
    codec = t.get("codec") or ""
    print(f"{tid}: {lang} {name} {codec}")
PY
}

input_arg="${1:-}"
declare -a files

if [[ -n "$input_arg" ]]; then
  if [[ ! -f "$input_arg" ]]; then
    echo "Input does not exist: $input_arg"
    exit 1
  fi
  files=("$input_arg")
else
  shopt -s nullglob
  files=("$OUT_DIR"/*.mkv)
  shopt -u nullglob
  if (( ${#files[@]} == 0 )); then
    echo "No MKV files found in ${OUT_DIR} (set OUT_DIR or pass a file path)."
    exit 1
  fi
  echo "Batch mode: will shift all MKVs in ${OUT_DIR}."
fi

# Show tracks from first file for reference
echo "Audio tracks in: ${files[0]}"
list_audio_tracks "${files[0]}"

if [[ -n "${TRACK_IDS:-}" ]]; then
  track_ids="$TRACK_IDS"
else
  read -rp "Audio track IDs to shift (comma-separated, blank = all audio tracks): " track_ids
fi

if [[ -n "${OFFSET_MS:-}" ]]; then
  offset_ms="$OFFSET_MS"
else
  read -rp "Offset in milliseconds (positive=later, negative=earlier): " offset_ms
fi
if ! [[ "$offset_ms" =~ ^-?[0-9]+$ ]]; then
  echo "Offset must be an integer number of milliseconds."
  exit 1
fi

apply_sync_flags() {
  local f="$1"; shift
  local -n _flags=$1
  local audio_ids=()

  if [[ -z "$track_ids" ]]; then
    mapfile -t audio_ids < <("$PYTHON_BIN" - <<'PY' "$f"
import json, subprocess, sys
f = sys.argv[1]
j = json.loads(subprocess.check_output(["mkvmerge", "-J", f]))
ids = [str(t["id"]) for t in j["tracks"] if t["type"] == "audio"]
print("\n".join(ids))
PY
)
  else
    IFS=',' read -r -a audio_ids <<<"$track_ids"
  fi

  for aid in "${audio_ids[@]}"; do
    aid="${aid//[[:space:]]/}"
    [[ -n "$aid" ]] && _flags+=(--sync "${aid}:${offset_ms}")
  done
}

for input_file in "${files[@]}"; do
  dir="$(dirname "$input_file")"
  base="$(basename "$input_file")"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    out="$dir/${base%.mkv}.offset.mkv"
  else
    out="$(mktemp -p "$dir" "${base%.mkv}.XXXXXX.mkv")"
  fi

  cmd=(mkvmerge -o "$out")
  apply_sync_flags "$input_file" cmd
  cmd+=("$input_file")

  echo "Running: ${cmd[*]}"
  run_cmd "${cmd[@]}"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    mv -f "$out" "$input_file"
    echo "Updated in place -> $input_file"
  else
    echo "[dry-run] Would overwrite -> $input_file"
  fi
done
