#!/usr/bin/env bash
set -euo pipefail

# Choose once which subtitle track should be default, then apply to all MKVs in TARGET_DIR.

DRY_RUN="${DRY_RUN:-0}"
TARGET_DIR="${TARGET_DIR:-Output}"
TARGET_GLOB="${TARGET_GLOB:-*.mkv}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need_cmd mkvmerge
need_cmd mkvpropedit
need_cmd python3

# Extract subtitle track info from mkvmerge -J output using python3 instead of jq
parse_sub_tracks() {
  local file="$1"
  mkvmerge -J "$file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tracks = [t for t in data.get('tracks', []) if t.get('type') == 'subtitles']
for i, t in enumerate(tracks):
    p = t.get('properties', {})
    lang = p.get('language', 'und')
    name = p.get('track_name', '')
    codec = t.get('codec', '') or p.get('codec_id', '')
    print(f'{i+1}\t{lang}\t{name}\t{codec}')
"
}

shopt -s nullglob
mapfile -d '' -t files < <(find "$TARGET_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $TARGET_DIR"
  exit 1
fi

ref="${files[0]}"
echo "Using reference file to choose subtitle track:"
echo "  $(basename "$ref")"
echo

mapfile -t ref_sub_tracks < <(parse_sub_tracks "$ref")

if [[ ${#ref_sub_tracks[@]} -eq 0 ]]; then
  echo "No subtitle tracks found in the reference file; aborting."
  exit 1
fi

echo "Subtitle tracks:"
for line in "${ref_sub_tracks[@]}"; do
  IFS=$'\t' read -r num lang name codec <<<"$line"
  [[ -z "$codec" ]] && codec="(unknown)"
  [[ -z "$name" ]] && name="(no name)"
  printf "  [%s] lang=%s, name=%s, codec=%s\n" "$num" "${lang:-und}" "$name" "$codec"
done

if [[ -n "${SUB_CHOICE:-}" ]]; then
  sub_choice="$SUB_CHOICE"
else
  read -rp "Select subtitle track number to set as default for all files (1-${#ref_sub_tracks[@]}): " sub_choice
fi
if ! [[ "$sub_choice" =~ ^[0-9]+$ ]] || (( sub_choice < 1 || sub_choice > ${#ref_sub_tracks[@]} )); then
  echo "Invalid selection."
  exit 1
fi

if [[ -n "${SET_FORCED:-}" ]]; then
  : # SET_FORCED already set from env
else
  read -rp "Also mark this track as forced across all files? [y/N]: " force_answer
  force_answer=${force_answer:-N}
  SET_FORCED=0
  [[ "$force_answer" =~ ^([Yy]|[Yy][Ee][Ss])$ ]] && SET_FORCED=1
fi

echo
echo "Setting default subtitle to track s${sub_choice} on all files in $TARGET_DIR"
[[ $SET_FORCED -eq 1 ]] && echo "Will also set flag-forced=1 on that track (others forced=0)."
echo

for target in "${files[@]}"; do
  echo "=> $(basename "$target")"

  mapfile -t sub_tracks < <(parse_sub_tracks "$target")

  if [[ ${#sub_tracks[@]} -eq 0 ]]; then
    echo "   No subtitle tracks found; skipping."
    echo
    continue
  fi

  if (( sub_choice > ${#sub_tracks[@]} )); then
    echo "   Warning: file has only ${#sub_tracks[@]} subtitle tracks; cannot set s${sub_choice}. Skipping."
    echo
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "   [dry-run] mkvpropedit \"$target\" ..."
    for i in $(seq 1 "${#sub_tracks[@]}"); do
      flag=0
      [[ $i -eq $sub_choice ]] && flag=1
      echo "     track:s${i} flag-default=$flag"
      if [[ $SET_FORCED -eq 1 ]]; then
        echo "     track:s${i} flag-forced=$flag"
      fi
    done
    echo
    continue
  fi

  args=()
  for i in $(seq 1 "${#sub_tracks[@]}"); do
    flag=0
    [[ $i -eq $sub_choice ]] && flag=1
    args+=( --edit "track:s${i}" --set "flag-default=${flag}" )
    if [[ $SET_FORCED -eq 1 ]]; then
      args+=( --set "flag-forced=${flag}" )
    fi
  done

  mkvpropedit "$target" "${args[@]}"
  echo "   Done."
  echo
done
