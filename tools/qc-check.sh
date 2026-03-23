#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Quality control check — displays a summary of MKV metadata for pre-release review.
# Flags potential issues: missing titles, unnamed tracks, unset languages, no defaults, etc.

: "${INPUT_DIR:=Output}"
: "${SOURCE_FILE:=}"
: "${TARGET_GLOB:=*.mkv}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need jq
need mediainfo

WARN_COUNT=0
warn() { echo "  ⚠  $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
ok() { echo "  ✓  $1"; }

human_size() {
  local bytes="$1"
  if (( bytes >= 1073741824 )); then
    printf '%.2f GB' "$(echo "$bytes / 1073741824" | bc -l)"
  elif (( bytes >= 1048576 )); then
    printf '%.1f MB' "$(echo "$bytes / 1048576" | bc -l)"
  else
    printf '%d KB' "$((bytes / 1024))"
  fi
}

human_duration() {
  local total_secs="${1%.*}"
  local h=$((total_secs / 3600))
  local m=$(( (total_secs % 3600) / 60 ))
  local s=$((total_secs % 60))
  if (( h > 0 )); then
    printf '%dh %02dm %02ds' "$h" "$m" "$s"
  else
    printf '%dm %02ds' "$m" "$s"
  fi
}

check_file() {
  local src="$1"
  local base
  base="$(basename "$src")"
  local file_size
  file_size="$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src" 2>/dev/null || echo 0)"

  echo "════════════════════════════════════════════════════════════════"
  echo "FILE: $base"
  echo "SIZE: $(human_size "$file_size")"
  echo "════════════════════════════════════════════════════════════════"

  local json
  json="$(mkvmerge -J "$src")"

  # Container info
  local title duration
  title="$(printf '%s' "$json" | jq -r '.container.properties.title // empty')"
  duration="$(printf '%s' "$json" | jq -r '.container.properties.duration // 0')"
  # duration from mkvmerge -J is in nanoseconds
  local dur_secs=0
  if [[ "$duration" != "0" && "$duration" != "null" ]]; then
    dur_secs="$(echo "$duration / 1000000000" | bc -l)"
  fi

  echo ""
  echo "── CONTAINER ──────────────────────────────────────────────────"
  if [[ -n "$title" ]]; then
    ok "Title: $title"
  else
    warn "No container title set"
  fi
  if (( ${dur_secs%.*} > 0 )); then
    echo "  Duration: $(human_duration "$dur_secs")"
  fi

  # Video tracks
  echo ""
  echo "── VIDEO ──────────────────────────────────────────────────────"
  local video_count
  video_count="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="video")] | length')"

  if (( video_count == 0 )); then
    warn "No video tracks found"
  else
    printf '%s' "$json" | jq -r '
      .tracks[] | select(.type=="video") |
      "  Track \(.id): \(.codec // "unknown") | \(.properties.pixel_dimensions // "?") | \(.properties.display_dimensions // "?") | Name: \(.properties.track_name // "(none)")"
    '
    # Check video track name
    local unnamed_video
    unnamed_video="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="video" and (.properties.track_name == null or .properties.track_name == ""))] | length')"
    if (( unnamed_video > 0 )); then
      warn "Video track has no name"
    fi
  fi

  # Audio tracks
  echo ""
  echo "── AUDIO ──────────────────────────────────────────────────────"
  local audio_count
  audio_count="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="audio")] | length')"

  if (( audio_count == 0 )); then
    warn "No audio tracks found"
  else
    printf '%s' "$json" | jq -r '
      .tracks[] | select(.type=="audio") |
      "  Track \(.id): \(.codec // "unknown") | \(.properties.audio_channels // "?")ch | Lang: \(.properties.language_ietf // .properties.language // "und") | Name: \(.properties.track_name // "(none)")\(if .properties.default_track then " [DEFAULT]" else "" end)"
    '

    local default_audio unnamed_audio unset_lang_audio
    default_audio="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="audio" and .properties.default_track==true)] | length')"
    unnamed_audio="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="audio" and (.properties.track_name == null or .properties.track_name == ""))] | length')"
    unset_lang_audio="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="audio" and (.properties.language == null or .properties.language == "und") and (.properties.language_ietf == null or .properties.language_ietf == "und"))] | length')"

    if (( default_audio == 0 )); then
      warn "No default audio track set"
    elif (( default_audio > 1 )); then
      warn "Multiple audio tracks marked as default ($default_audio)"
    fi
    if (( unnamed_audio > 0 )); then
      warn "$unnamed_audio audio track(s) have no name"
    fi
    if (( unset_lang_audio > 0 )); then
      warn "$unset_lang_audio audio track(s) have no language set"
    fi
  fi

  # Subtitle tracks
  echo ""
  echo "── SUBTITLES ──────────────────────────────────────────────────"
  local sub_count
  sub_count="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="subtitles")] | length')"

  if (( sub_count == 0 )); then
    echo "  (none)"
  else
    printf '%s' "$json" | jq -r '
      .tracks[] | select(.type=="subtitles") |
      "  Track \(.id): \(.codec // "unknown") | Lang: \(.properties.language_ietf // .properties.language // "und") | Name: \(.properties.track_name // "(none)")\(if .properties.default_track then " [DEFAULT]" else "" end)\(if .properties.forced_track then " [FORCED]" else "" end)"
    '

    local default_sub unnamed_sub unset_lang_sub
    default_sub="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="subtitles" and .properties.default_track==true)] | length')"
    unnamed_sub="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="subtitles" and (.properties.track_name == null or .properties.track_name == ""))] | length')"
    unset_lang_sub="$(printf '%s' "$json" | jq '[.tracks[] | select(.type=="subtitles" and (.properties.language == null or .properties.language == "und") and (.properties.language_ietf == null or .properties.language_ietf == "und"))] | length')"

    if (( default_sub == 0 )); then
      warn "No default subtitle track set"
    elif (( default_sub > 1 )); then
      warn "Multiple subtitle tracks marked as default ($default_sub)"
    fi
    if (( unnamed_sub > 0 )); then
      warn "$unnamed_sub subtitle track(s) have no name"
    fi
    if (( unset_lang_sub > 0 )); then
      warn "$unset_lang_sub subtitle track(s) have no language set"
    fi
  fi

  # Chapters
  echo ""
  echo "── CHAPTERS ───────────────────────────────────────────────────"
  local chapter_count
  chapter_count="$(printf '%s' "$json" | jq '[.chapters[]?.num_entries // 0] | add // 0')"

  if (( chapter_count == 0 )); then
    warn "No chapters found"
  else
    ok "$chapter_count chapters"
    # Show chapter names if available
    printf '%s' "$json" | jq -r '
      .chapters[]?.entries[]? |
      "  \(.timestamps.start // "?") — \(.name // "(unnamed)")"
    ' 2>/dev/null || true
  fi

  # Attachments
  echo ""
  echo "── ATTACHMENTS ────────────────────────────────────────────────"
  local attach_count font_count
  attach_count="$(printf '%s' "$json" | jq '[.attachments // [] | .[]] | length')"
  font_count="$(printf '%s' "$json" | jq '[.attachments // [] | .[] | select(.content_type | test("font|ttf|otf|woff"; "i"))] | length')"

  if (( attach_count == 0 )); then
    echo "  (none)"
  else
    ok "$attach_count attachment(s) ($font_count font(s))"
  fi

  # Summary
  echo ""
  if (( WARN_COUNT > 0 )); then
    echo "── RESULT: $WARN_COUNT warning(s) ───────────────────────────"
  else
    echo "── RESULT: ALL CLEAR ─────────────────────────────────────────"
  fi
  echo ""
}

# Build file list
if [[ -n "$SOURCE_FILE" ]]; then
  [[ -f "$SOURCE_FILE" ]] || { echo "File not found: $SOURCE_FILE" >&2; exit 1; }
  files=("$SOURCE_FILE")
else
  if [[ ! -d "$INPUT_DIR" ]]; then
    echo "Input directory '$INPUT_DIR' not found" >&2
    exit 1
  fi
  mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" ! -name '.tmp.*' -print0 | sort -z)
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB found in $INPUT_DIR"
  exit 0
fi

TOTAL_WARNS=0
for src in "${files[@]}"; do
  WARN_COUNT=0
  check_file "$src"
  TOTAL_WARNS=$((TOTAL_WARNS + WARN_COUNT))
done

if [[ ${#files[@]} -gt 1 ]]; then
  echo "════════════════════════════════════════════════════════════════"
  echo "TOTAL: ${#files[@]} files checked, $TOTAL_WARNS warning(s)"
  echo "════════════════════════════════════════════════════════════════"
fi
