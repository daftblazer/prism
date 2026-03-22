#!/usr/bin/env bash
set -euo pipefail

# Set the video track name on all MKVs in a directory.

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"
: "${VIDEO_NAME:=}"
: "${TARGET_GLOB:=*.mkv}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need_cmd mkvpropedit

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory '$INPUT_DIR' not found" >&2
  exit 1
fi

if [[ -z "$VIDEO_NAME" ]]; then
  echo "ERROR: VIDEO_NAME must be set." >&2
  exit 1
fi

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB found in $INPUT_DIR"
  exit 0
fi

for src in "${files[@]}"; do
  raw_base="$(basename "$src")"
  echo "==> $raw_base"
  echo "  track:v1 -> '${VIDEO_NAME}'"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    mkvpropedit "$src" \
      --edit track:v1 \
      --set "name=${VIDEO_NAME}"
  else
    echo "  [dry-run] would set video track name to '${VIDEO_NAME}'"
  fi
done

echo
echo "All done. Set video track name to '${VIDEO_NAME}' on ${#files[@]} files."
