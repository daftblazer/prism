#!/usr/bin/env bash
set -euo pipefail

: "${INPUT_DIR:=Output}"

# name_subtitles.sh
# Set subtitle track names for all .mkv files in INPUT_DIR.
#
# SUB_NAMES must be a pipe-delimited string of names, one per subtitle track.
# Example: SUB_NAMES="English Dialogue|Signs/Songs|English Dialogue [Alt]"
# This applies name 1 to track s1, name 2 to s2, etc.

if [[ -z "${SUB_NAMES:-}" ]]; then
  echo "ERROR: SUB_NAMES is required." >&2
  echo "Usage: SUB_NAMES='Name1|Name2|Name3' $0" >&2
  echo "Each pipe-delimited name maps to subtitle tracks s1, s2, s3, etc." >&2
  exit 1
fi

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory '$INPUT_DIR' not found" >&2
  exit 1
fi

# Split SUB_NAMES on pipe into an array
IFS='|' read -r -a names <<< "$SUB_NAMES"

if [[ ${#names[@]} -eq 0 ]]; then
  echo "ERROR: SUB_NAMES is empty after splitting." >&2
  exit 1
fi

echo "Will apply ${#names[@]} subtitle name(s):"
for i in "${!names[@]}"; do
  echo "  s$((i+1)) = ${names[$i]}"
done
echo

shopt -s nullglob
found=0
for file in "$INPUT_DIR"/*.mkv; do
  found=1
  echo "Fixing subtitles in: $file"

  args=()
  for i in "${!names[@]}"; do
    track_num=$((i+1))
    args+=( --edit "track:s${track_num}" --set "name=${names[$i]}" )
  done

  mkvpropedit "$file" "${args[@]}"
done
shopt -u nullglob

if [[ $found -eq 0 ]]; then
  echo "No .mkv files found in '$INPUT_DIR'"
fi

echo "Done."
