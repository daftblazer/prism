#!/usr/bin/env bash
set -euo pipefail

# Set the MKV container title by extracting it from each file's name.
#
# Handles common naming patterns:
#   [Group] Show Name - S01E01 (BD 1080p AV1) [Dual Audio].mkv  ->  Show Name - S01E01
#   Show.Name.S01E01.Episode.Title.1080p.BluRay.Remux.mkv       ->  Show Name S01E01 Episode Title
#   Show Name - S01E01 - Episode Title [1080p].mkv               ->  Show Name - S01E01 - Episode Title
#
# Logic:
#   1. Strip file extension
#   2. Remove leading [group] tags
#   3. Remove trailing (metadata) and [metadata] blocks
#   4. For dot-separated names, replace dots with spaces and cut at quality markers
#   5. Trim and set as container title via mkvpropedit

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"
: "${TARGET_GLOB:=*.mkv}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need_cmd mkvpropedit

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory '$INPUT_DIR' not found" >&2
  exit 1
fi

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB found in $INPUT_DIR"
  exit 0
fi

shopt -s extglob

extract_title() {
  local name="$1" trimmed

  # Strip extension
  name="${name%.*}"

  # Remove leading [group] tags (e.g. [ED3N], [SubGroup])
  while [[ "$name" =~ ^\[([^]]*)\][[:space:]]* ]]; do
    name="${name#"${BASH_REMATCH[0]}"}"
  done

  # Remove trailing [...] and (...) blocks (e.g. [Dual Audio], (BD 1080p AV1))
  local re_bracket='\[[^]]*\]$'
  local re_paren='[(][^)]*[)]$'
  while true; do
    trimmed="${name%%+([[:space:]])}"
    if [[ "$trimmed" =~ $re_bracket ]]; then
      trimmed="${trimmed%"${BASH_REMATCH[0]}"}"
    elif [[ "$trimmed" =~ $re_paren ]]; then
      trimmed="${trimmed%"${BASH_REMATCH[0]}"}"
    else
      break
    fi
    name="$trimmed"
  done

  # Detect dot-separated names (has dots and no spaces before a quality marker)
  if [[ "$name" == *.* && ! "$name" =~ [[:space:]] ]]; then
    # Replace dots with spaces
    name="${name//./ }"
    # Cut at common quality/release markers
    name="$(echo "$name" | sed -E 's/ (2160p|1080p|720p|480p|BluRay|BDRip|BDRemux|Blu-Ray|WEB-DL|WEBRip|HDTV|DVDRip|Remux|AMZN|DSNP|HULU|NF|CR|ATVP|10bit|8bit|x264|x265|H 264|H 265|AV1|HEVC|AAC|FLAC|DTS|TrueHD|Opus|Atmos|Dual[ -]?Audio|Multi|REPACK|PROPER)( |$).*//I')"
  fi

  # Trim whitespace
  name="$(echo "$name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/ - $//')"

  echo "$name"
}

for src in "${files[@]}"; do
  raw_base="$(basename "$src")"
  title="$(extract_title "$raw_base")"

  echo "==> $raw_base"
  echo "  title -> '$title'"

  if [[ -z "$title" ]]; then
    echo "  Skipped (could not extract title)"
    continue
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    mkvpropedit "$src" \
      --edit info \
      --set "title=${title}"
  else
    echo "  [dry-run] would set title to '$title'"
  fi
done

echo
echo "All done. Set title on ${#files[@]} files."
