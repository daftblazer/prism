#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Keeps only Japanese audio tracks on each video in INPUT_DIR.
# Subtitles, video, chapters, and attachments are preserved.

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Input}"
: "${OUTPUT_DIR:=Output}"
: "${TARGET_GLOB:=*.mkv}"          # override to e.g. "*.mp4" or "*"
: "${NAME_REGEX:='(?i)japan'}"     # additional match on track name/title

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need jq

mkdir -p "$OUTPUT_DIR"
mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $INPUT_DIR"
  exit 0
fi

is_japanese() {
  local lang="${1:-und}"
  local name="${2:-}"
  if [[ "$lang" =~ ^(jpn|ja|jp)$ ]]; then
    return 0
  fi
  if [[ -n "$NAME_REGEX" && "$name" =~ $NAME_REGEX ]]; then
    return 0
  fi
  return 1
}

for src in "${files[@]}"; do
  base="$(basename "$src")"
  out="$OUTPUT_DIR/$base"

  echo "==> $base"
  media_json="$(mkvmerge -J "$src")"

  mapfile -t audio_tracks < <(
    printf '%s' "$media_json" | jq -r '
      .tracks[]
      | select(.type=="audio")
      | [
          (.id|tostring),
          (.properties.language // "und"),
          (.properties.track_name // "")
        ]
      | @tsv
    '
  )

  if [[ ${#audio_tracks[@]} -eq 0 ]]; then
    echo "  No audio tracks found; skipping."
    continue
  fi

  keep_ids=()
  removed_ids=()

  for line in "${audio_tracks[@]}"; do
    IFS=$'\t' read -r id lang name <<<"$line"
    if is_japanese "$lang" "$name"; then
      keep_ids+=("$id")
    else
      removed_ids+=("$id")
    fi
  done

  if [[ ${#keep_ids[@]} -eq 0 ]]; then
    echo "  ERROR: No Japanese audio tracks detected; refusing to mux."
    continue
  fi

  if [[ ${#removed_ids[@]} -eq 0 ]]; then
    echo "  Already Japanese-only; skipping."
    continue
  fi

  keep_csv="$(IFS=,; echo "${keep_ids[*]}")"
  tmp_out="$(dirname "$out")/.tmp.$(basename "$out")"

  cmd=(mkvmerge -o "$tmp_out" --audio-tracks "$keep_csv" "$src")

  (
    IFS=' '
    echo "  Keeping audio track IDs:  ${keep_ids[*]}"
    echo "  Removing audio track IDs: ${removed_ids[*]}"
  )

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [dry-run] ${cmd[*]}"
  else
    "${cmd[@]}"
    mv -- "$tmp_out" "$out"
  fi
done

echo "Done. Output -> $OUTPUT_DIR"
