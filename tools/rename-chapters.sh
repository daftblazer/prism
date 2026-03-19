#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Renames all chapter titles per file to "Chapter 01", "Chapter 02", etc.
# Uses existing chapter count and timing; only replaces the chapter names.
# Strategy:
#   1) Extract chapters to XML.
#   2) Rewrite ChapterString entries sequentially by ChapterAtom.
#   3) Remux original file without chapters, then add the new chapters XML.

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"
: "${OUTPUT_DIR:=$INPUT_DIR}"
: "${TARGET_GLOB:=*.mkv}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need mkvextract
need awk

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $INPUT_DIR"
  exit 0
fi

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${*}"
  else
    "$@"
  fi
}

for src in "${files[@]}"; do
  base="$(basename "$src")"
  out="$OUTPUT_DIR/$base"

  echo "==> $base"

  tmp_dir="$(dirname "$out")"
  tmp_xml="$tmp_dir/.tmp.$base.chapters.xml"
  new_xml="$tmp_dir/.tmp.$base.chapters.renamed.xml"
  tmp_out="$tmp_dir/.tmp.$base"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] mkvextract chapters \"$src\" > \"$tmp_xml\""
    echo "[dry-run] rewrite chapter names -> \"$new_xml\""
    echo "  Chapters found: (dry-run skips counting)"
  else
    mkvextract chapters "$src" > "$tmp_xml"

    # If no chapters, mkvextract will still output XML but with no ChapterAtom entries.
    chapter_count="$(awk '/<ChapterAtom>/{c++} END{print c+0}' "$tmp_xml")"
    if [[ "$chapter_count" -eq 0 ]]; then
      echo "  Skipped (no chapters found)."
      rm -f -- "$tmp_xml"
      continue
    fi

    # Rename ChapterString entries sequentially per ChapterAtom.
    awk '
      /<ChapterAtom>/ {
        in_atom=1;
        seen=0;
        count++;
        current=sprintf("Chapter %02d", count);
        match($0, /^[ \t]*/);
        indent=substr($0, RSTART, RLENGTH) "  ";
      }
      /<\/ChapterAtom>/ {
        if (in_atom && seen==0) {
          print indent "<ChapterString>" current "</ChapterString>";
        }
        in_atom=0;
      }
      {
        if (in_atom && $0 ~ /<ChapterString>/) {
          sub(/<ChapterString>.*<\/ChapterString>/, "<ChapterString>" current "</ChapterString>");
          seen=1;
        }
        print;
      }
    ' "$tmp_xml" > "$new_xml"
    echo "  Chapters found: $chapter_count"
  fi

  cmd=(mkvmerge -o "$tmp_out" --no-chapters "$src" --chapters "$new_xml")

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${cmd[*]}"
  else
    "${cmd[@]}"
    mv -- "$tmp_out" "$out"
    rm -f -- "$tmp_xml" "$new_xml"
  fi
done

echo "Done. Output -> $OUTPUT_DIR"
