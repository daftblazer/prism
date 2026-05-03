#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Compose new MKVs by combining tracks from two source directories.
#   VIDEO_DIR   contributes video (typically the AV1 encode)
#   TRACKS_DIR  contributes audio/subs (typically a BD remux)
# Files are paired by S##E## token. Output mirrors the chosen source's
# folder structure under OUT_DIR.

: "${VIDEO_DIR:=}"
: "${TRACKS_DIR:=}"
: "${OUT_DIR:=}"
: "${RECURSIVE:=1}"
: "${VIDEO_SRC_VIDEO_IDS:=}"
: "${VIDEO_SRC_AUDIO_IDS:=}"
: "${VIDEO_SRC_SUB_IDS:=}"
: "${TRACKS_SRC_VIDEO_IDS:=}"
: "${TRACKS_SRC_AUDIO_IDS:=}"
: "${TRACKS_SRC_SUB_IDS:=}"
: "${CHAPTERS_FROM:=tracks}"      # video|tracks|none
: "${ATTACHMENTS_FROM:=tracks}"   # video|tracks|none
: "${MIRROR_FROM:=video}"         # video|tracks
: "${DRY_RUN:=0}"

if [[ -z "$VIDEO_DIR" || -z "$TRACKS_DIR" || -z "$OUT_DIR" ]]; then
  echo "ERROR: VIDEO_DIR, TRACKS_DIR, and OUT_DIR must all be set." >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need find

VIDEO_DIR="$(realpath "$VIDEO_DIR")"
TRACKS_DIR="$(realpath "$TRACKS_DIR")"
OUT_DIR="$(realpath -m "$OUT_DIR")"

extract_token() {
  local name="$1"
  if [[ "$name" =~ [sS]([0-9]{1,2})[eE]([0-9]{1,3}) ]]; then
    printf 'S%02dE%02d' "$((10#${BASH_REMATCH[1]}))" "$((10#${BASH_REMATCH[2]}))"
  fi
}

find_mkvs() {
  local dir="$1"
  if [[ "$RECURSIVE" -eq 1 ]]; then
    find "$dir" -type f -iname '*.mkv' -print0 | sort -z
  else
    find "$dir" -maxdepth 1 -type f -iname '*.mkv' -print0 | sort -z
  fi
}

# Build mkvmerge per-source track-selection args into a named array.
# Empty list => exclude that track type entirely.
build_track_args() {
  local -n out_ref="$1"
  local vids="$2" aids="$3" sids="$4"
  out_ref=()
  if [[ -n "$vids" ]]; then out_ref+=( --video-tracks "$vids" ); else out_ref+=( --no-video ); fi
  if [[ -n "$aids" ]]; then out_ref+=( --audio-tracks "$aids" ); else out_ref+=( --no-audio ); fi
  if [[ -n "$sids" ]]; then out_ref+=( --subtitle-tracks "$sids" ); else out_ref+=( --no-subtitles ); fi
}

declare -A TRACKS_BY_TOKEN
while IFS= read -r -d '' f; do
  tok="$(extract_token "$(basename "$f")")"
  [[ -n "$tok" && -z "${TRACKS_BY_TOKEN[$tok]:-}" ]] && TRACKS_BY_TOKEN["$tok"]="$f"
done < <(find_mkvs "$TRACKS_DIR")

if [[ ${#TRACKS_BY_TOKEN[@]} -eq 0 ]]; then
  echo "ERROR: no MKV files with S##E## tokens found in TRACKS_DIR ($TRACKS_DIR)" >&2
  exit 1
fi

VIDEO_FILES=()
while IFS= read -r -d '' f; do
  VIDEO_FILES+=("$f")
done < <(find_mkvs "$VIDEO_DIR")

if [[ ${#VIDEO_FILES[@]} -eq 0 ]]; then
  echo "ERROR: no MKV files found in VIDEO_DIR ($VIDEO_DIR)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

processed=0
skipped=0
failed=0

for video in "${VIDEO_FILES[@]}"; do
  base="$(basename "$video")"
  tok="$(extract_token "$base")"

  if [[ -z "$tok" ]]; then
    echo "[skip] $base — no S##E## token"
    skipped=$((skipped+1))
    continue
  fi

  tracks="${TRACKS_BY_TOKEN[$tok]:-}"
  if [[ -z "$tracks" ]]; then
    echo "[skip] $tok ($base) — no match in TRACKS_DIR"
    skipped=$((skipped+1))
    continue
  fi

  if [[ "$MIRROR_FROM" == "tracks" ]]; then
    mirror_root="$TRACKS_DIR"
    mirror_file="$tracks"
  else
    mirror_root="$VIDEO_DIR"
    mirror_file="$video"
  fi
  rel="${mirror_file#$mirror_root/}"
  out_path="$OUT_DIR/$rel"
  mkdir -p "$(dirname "$out_path")"

  echo "=== $tok ==="
  echo "Video:  $video"
  echo "Tracks: $tracks"
  echo "Output: $out_path"

  build_track_args vsrc_args "$VIDEO_SRC_VIDEO_IDS" "$VIDEO_SRC_AUDIO_IDS" "$VIDEO_SRC_SUB_IDS"
  if [[ "$CHAPTERS_FROM" != "video" ]]; then vsrc_args+=( --no-chapters ); fi
  if [[ "$ATTACHMENTS_FROM" != "video" ]]; then vsrc_args+=( --no-attachments ); fi

  build_track_args tsrc_args "$TRACKS_SRC_VIDEO_IDS" "$TRACKS_SRC_AUDIO_IDS" "$TRACKS_SRC_SUB_IDS"
  if [[ "$CHAPTERS_FROM" != "tracks" ]]; then tsrc_args+=( --no-chapters ); fi
  if [[ "$ATTACHMENTS_FROM" != "tracks" ]]; then tsrc_args+=( --no-attachments ); fi

  cmd=( mkvmerge -o "$out_path" "${vsrc_args[@]}" "$video" "${tsrc_args[@]}" "$tracks" )

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    for arg in "${cmd[@]}"; do printf ' %q' "$arg"; done
    printf '\n'
    processed=$((processed+1))
  else
    rc=0
    "${cmd[@]}" || rc=$?
    # mkvmerge exit codes: 0=success, 1=warnings (file still produced), 2=error
    if [[ "$rc" -eq 0 ]]; then
      processed=$((processed+1))
      echo "[done] $tok"
    elif [[ "$rc" -eq 1 ]]; then
      processed=$((processed+1))
      echo "[done] $tok (with warnings)"
    else
      failed=$((failed+1))
      echo "[error] $tok mkvmerge failed (exit $rc)"
    fi
  fi
  echo
done

echo "Summary: $processed processed, $skipped skipped, $failed failed"
[[ "$failed" -eq 0 ]]
