#!/usr/bin/env bash
set -uo pipefail
IFS=$'\n\t'

# Verify integrity of video files by fully decoding them with ffmpeg.
# Reports any corruption, truncation, or stream errors.

INPUT_DIR="${INPUT_DIR:-}"
SOURCE_FILE="${SOURCE_FILE:-}"

shopt -s nullglob

if [[ -n "$SOURCE_FILE" ]]; then
  if [[ ! -f "$SOURCE_FILE" ]]; then
    echo "ERROR: SOURCE_FILE not found: $SOURCE_FILE"
    exit 1
  fi
  files=("$SOURCE_FILE")
elif [[ -n "$INPUT_DIR" && -d "$INPUT_DIR" ]]; then
  files=("$INPUT_DIR"/*.{mkv,mp4,avi,ts,mov,webm})
else
  echo "ERROR: Set SOURCE_FILE for a single file or INPUT_DIR for a directory."
  exit 1
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No video files found in $INPUT_DIR"
  exit 1
fi

total=${#files[@]}
passed=0
failed=0
failed_files=()

echo "=========================================="
echo "  INTEGRITY CHECK"
echo "  Files: $total"
echo "  Directory: $INPUT_DIR"
echo "=========================================="
echo ""

for i in "${!files[@]}"; do
  file="${files[$i]}"
  name="$(basename "$file")"
  idx=$((i + 1))

  echo "[$idx/$total] Checking: $name"

  # Decode all streams, capture errors
  errors=$(ffmpeg -v error -i "$file" -f null - 2>&1)

  if [[ -z "$errors" ]]; then
    echo "  PASS"
    ((passed++))
  else
    echo "  FAIL — errors detected:"
    echo "$errors" | head -20 | sed 's/^/    /'
    error_count=$(echo "$errors" | wc -l)
    if [[ $error_count -gt 20 ]]; then
      echo "    ... and $((error_count - 20)) more errors"
    fi
    ((failed++))
    failed_files+=("$name")
  fi
  echo ""
done

echo "=========================================="
echo "  RESULTS"
echo "  Total:  $total"
echo "  Passed: $passed"
echo "  Failed: $failed"
echo "=========================================="

if [[ $failed -gt 0 ]]; then
  echo ""
  echo "  FAILED FILES:"
  for f in "${failed_files[@]}"; do
    echo "    - $f"
  done
  echo ""
  exit 1
fi

echo ""
echo "  All files passed integrity check."
