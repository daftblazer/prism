#!/usr/bin/env bash
set -euo pipefail

# Choose once which audio track should be default, then apply to all MKVs in TARGET_DIR.

DRY_RUN="${DRY_RUN:-0}"
TARGET_DIR="${TARGET_DIR:-Output}"
TARGET_GLOB="${TARGET_GLOB:-*.mkv}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need_cmd mkvmerge
need_cmd mkvpropedit
need_cmd python3

# Extract audio track info from mkvmerge -J output using python3 instead of jq
parse_audio_tracks() {
  local file="$1"
  mkvmerge -J "$file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tracks = [t for t in data.get('tracks', []) if t.get('type') == 'audio']
for i, t in enumerate(tracks):
    p = t.get('properties', {})
    lang = p.get('language', 'und')
    name = p.get('track_name', '')
    codec = t.get('codec', '') or p.get('codec_id', '')
    channels = p.get('audio_channels', '')
    print(f'{i+1}\t{lang}\t{name}\t{codec}\t{channels}')
"
}

shopt -s nullglob
mapfile -d '' -t files < <(find "$TARGET_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $TARGET_DIR"
  exit 1
fi

ref="${files[0]}"
echo "Using reference file to choose audio track:"
echo "  $(basename "$ref")"
echo

mapfile -t ref_audio_tracks < <(parse_audio_tracks "$ref")

if [[ ${#ref_audio_tracks[@]} -eq 0 ]]; then
  echo "No audio tracks found in the reference file; aborting."
  exit 1
fi

echo "Audio tracks:"
for line in "${ref_audio_tracks[@]}"; do
  IFS=$'\t' read -r num lang name codec channels <<<"$line"
  [[ -z "$codec" ]] && codec="(unknown)"
  [[ -z "$name" ]] && name="(no name)"
  [[ -z "$channels" ]] && channels="?"
  printf "  [%s] lang=%s, name=%s, codec=%s, channels=%s\n" "$num" "${lang:-und}" "$name" "$codec" "$channels"
done

if [[ -n "${AUDIO_CHOICE:-}" ]]; then
  audio_choice="$AUDIO_CHOICE"
else
  read -rp "Select audio track number to set as default for all files (1-${#ref_audio_tracks[@]}): " audio_choice
fi
if ! [[ "$audio_choice" =~ ^[0-9]+$ ]] || (( audio_choice < 1 || audio_choice > ${#ref_audio_tracks[@]} )); then
  echo "Invalid selection."
  exit 1
fi

echo
echo "Setting default audio to track a${audio_choice} on all files in $TARGET_DIR"
echo

for target in "${files[@]}"; do
  echo "=> $(basename "$target")"

  mapfile -t audio_tracks < <(parse_audio_tracks "$target")

  if [[ ${#audio_tracks[@]} -eq 0 ]]; then
    echo "   No audio tracks found; skipping."
    echo
    continue
  fi

  if (( audio_choice > ${#audio_tracks[@]} )); then
    echo "   Warning: file has only ${#audio_tracks[@]} audio tracks; cannot set a${audio_choice}. Skipping."
    echo
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "   [dry-run] mkvpropedit \"$target\" ..."
    for i in $(seq 1 "${#audio_tracks[@]}"); do
      flag=0
      [[ $i -eq $audio_choice ]] && flag=1
      echo "     track:a${i} flag-default=$flag"
    done
    echo
    continue
  fi

  args=()
  for i in $(seq 1 "${#audio_tracks[@]}"); do
    flag=0
    [[ $i -eq $audio_choice ]] && flag=1
    args+=( --edit "track:a${i}" --set "flag-default=${flag}" )
  done

  mkvpropedit "$target" "${args[@]}"
  echo "   Done."
  echo
done
