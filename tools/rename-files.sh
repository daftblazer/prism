#!/usr/bin/env bash
set -euo pipefail

: "${INPUT_DIR:=Output}"
: "${OUTPUT_DIR:=$INPUT_DIR}"
: "${TARGET_GLOB:=*.mkv}"
: "${PREFIX:=${RELEASE_GROUP:+[${RELEASE_GROUP}]}}"
: "${SUFFIX:=}"
: "${DRY_RUN:=0}"

# Rename episodes in place within Output.
# Expected input format: "<Show Name> - S01E01.ext"
# Output format: "<PREFIX> <Show Name> - S01E01 <SUFFIX>.ext"

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory '$INPUT_DIR' not found" >&2
  exit 1
fi

mapfile -d '' -t files < <(
  find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z
)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB found in $INPUT_DIR"
  exit 0
fi

for src in "${files[@]}"; do
  base="$(basename "$src")"

  # Accept names like:
  # "[GEN3SYS] My Dress-Up Darling - S01E01 [1080p]...mkv"
  # "My Show - S01E01.mkv"
  # "My.Show.S01E01.1080p...mkv"
  if [[ "$base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[[:space:]]-[[:space:]](S[0-9]{2}E[0-9]{2}).*(\.[^.]+)$ ]]; then
    prefix_ign="${BASH_REMATCH[1]}"
    show="${BASH_REMATCH[2]}"
    epcode="${BASH_REMATCH[3]}"
    ext="${BASH_REMATCH[4]}"
  elif [[ "$base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[._[:space:]-]+(S[0-9]{2}E[0-9]{2}).*(\.[^.]+)$ ]]; then
    prefix_ign="${BASH_REMATCH[1]}"
    show="${BASH_REMATCH[2]}"
    epcode="${BASH_REMATCH[3]}"
    ext="${BASH_REMATCH[4]}"
  else
    echo "Skipping '$base': does not match expected pattern '<Show> - SxxEyy.ext' or '<Show>.SxxEyy.ext'" >&2
    continue
  fi

  # Trim surrounding spaces from show name (but keep the detected name)
  show_clean="$(printf '%s' "$show" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  new_base="${PREFIX} ${show_clean} - ${epcode} ${SUFFIX}${ext}"
  dest="${OUTPUT_DIR}/${new_base}"

  if [[ -e "$dest" ]]; then
    if [[ "$DRY_RUN" -eq 0 ]]; then
      echo "Destination already exists, refusing to overwrite: $dest" >&2
      exit 1
    else
      echo "Destination already exists (dry-run): $dest" >&2
      continue
    fi
  fi

  echo "$base -> $new_base"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    mv -- "$src" "$dest"
  else
    echo "  [dry-run] mv '$src' -> '$dest'"
  fi
done

echo "Done."
