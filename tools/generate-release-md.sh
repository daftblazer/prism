#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate a release info markdown file using metadata from one sample MKV.

: "${OUTPUT_DIR:=Output}"
: "${SAMPLE_FILE:=}"
: "${OUT_MD:=${OUTPUT_DIR}/release.md}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need jq

# Pick a sample file
if [[ -z "$SAMPLE_FILE" ]]; then
  SAMPLE_FILE="$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.mkv' | sort | head -n1 || true)"
fi

if [[ -z "$SAMPLE_FILE" || ! -f "$SAMPLE_FILE" ]]; then
  echo "No sample MKV found in $OUTPUT_DIR; set SAMPLE_FILE=<path>" >&2
  exit 1
fi

sample_base="$(basename "$SAMPLE_FILE")"

# Extract show name and season from filename
show_name="Unknown Show"
season_num="1"
if [[ "$sample_base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[[:space:]]*-[[:space:]]*S([0-9]{2})E[0-9]{2} ]]; then
  show_name="${BASH_REMATCH[2]}"
  season_num="${BASH_REMATCH[3]}"
  season_num="$(echo "$season_num" | sed 's/^0*//')"
elif [[ "$sample_base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[[:space:]]*-[[:space:]]*([0-9]{2,3})[[:space:]] ]]; then
  show_name="${BASH_REMATCH[2]}"
fi

# Read media info
media_json="$(mkvmerge -J "$SAMPLE_FILE")"

# Video info
video_codec="$(printf '%s' "$media_json" | jq -r '.tracks[] | select(.type=="video") | .codec // "AV1"' | head -1)"
video_bit="$(printf '%s' "$media_json" | jq -r '.tracks[] | select(.type=="video") | .properties.bit_depth // 10' | head -1)"
video_dims="$(printf '%s' "$media_json" | jq -r '.tracks[] | select(.type=="video") | .properties.pixel_dimensions // "1920x1080"' | head -1)"

# Normalize codec name
case "${video_codec,,}" in
  *av1*) video_codec="AV1" ;;
  *h.265*|*hevc*|*x265*) video_codec="HEVC" ;;
  *h.264*|*avc*|*x264*) video_codec="H.264" ;;
esac

video_line="${video_codec} ${video_bit}-bit • ${video_dims}"

# Channel count to label
ch_label() {
  case "$1" in
    1) echo "1.0" ;; 2) echo "2.0" ;; 6) echo "5.1" ;; 8) echo "7.1" ;;
    *) echo "${1}ch" ;;
  esac
}

# Codec display name
codec_label() {
  local c="${1,,}"
  case "$c" in
    *opus*) echo "Opus" ;; *flac*) echo "FLAC" ;; *aac*) echo "AAC" ;;
    *e-ac-3*|*eac3*) echo "E-AC-3" ;; *ac-3*|*ac3*) echo "AC-3" ;;
    *truehd*) echo "TrueHD" ;; *dts-hd*) echo "DTS-HD MA" ;; *dts*) echo "DTS" ;;
    *vorbis*) echo "Vorbis" ;; *mp3*|*mpeg*) echo "MP3" ;; *pcm*) echo "PCM" ;;
    *) echo "$1" ;;
  esac
}

# Language code to name
lang_name() {
  case "${1,,}" in
    en|eng|english) echo "English" ;; ja|jpn|japanese) echo "Japanese" ;;
    es|spa|spanish) echo "Spanish" ;; fr|fre|fra|french) echo "French" ;;
    de|ger|deu|german) echo "German" ;; it|ita|italian) echo "Italian" ;;
    pt|por|portuguese) echo "Portuguese" ;; ko|kor|korean) echo "Korean" ;;
    zh|chi|zho|chinese) echo "Chinese" ;; ru|rus|russian) echo "Russian" ;;
    und|""|null) echo "Unknown" ;; *) echo "$1" ;;
  esac
}

# Audio tracks
audio_md=""
while IFS=$'\t' read -r lang ch codec tname; do
  if [[ -n "$tname" && "$tname" != "null" ]]; then
    display="$tname"
  else
    display="$(lang_name "$lang") $(ch_label "$ch") ($(codec_label "$codec"))"
  fi
  audio_md+="- ${display}  "$'\n'
done < <(
  printf '%s' "$media_json" | jq -r '
    .tracks[]
    | select(.type=="audio")
    | [
        (.properties.language_ietf // .properties.language // "und"),
        ((.properties.audio_channels // 2)|tostring),
        (.codec // "unknown"),
        (.properties.track_name // "")
      ]
    | @tsv
  '
)
audio_md="${audio_md%$'\n'}"
[[ -z "$audio_md" ]] && audio_md="- TODO: add audio tracks"

# Subtitle tracks
sub_md=""
while IFS=$'\t' read -r lang tname; do
  if [[ -n "$tname" && "$tname" != "null" ]]; then
    display="$tname"
  else
    display="$(lang_name "$lang")"
  fi
  sub_md+="- ${display}  "$'\n'
done < <(
  printf '%s' "$media_json" | jq -r '
    .tracks[]
    | select(.type=="subtitles")
    | [
        (.properties.language_ietf // .properties.language // "und"),
        (.properties.track_name // "")
      ]
    | @tsv
  '
)
sub_md="${sub_md%$'\n'}"
[[ -z "$sub_md" ]] && sub_md="- TODO: add subtitle tracks"

# Encoder toolchain — try to read from the segment info writing_app
encoder_tool="$(printf '%s' "$media_json" | jq -r '.container.properties.writing_application // empty' 2>/dev/null || true)"
[[ -z "$encoder_tool" ]] && encoder_tool="TODO: encoder toolchain"

cat > "$OUT_MD" <<EOF
# ${show_name} — Season ${season_num}

**Video:** ${video_line}
**Encoded by:** ${RELEASE_GROUP:-Unknown}
**Source:** TODO: Source

---

## Tracks

**Audio:**
${audio_md}

**Subtitles:**
${sub_md}

---

## Notes
- Encoded with ${encoder_tool}
EOF

echo "Wrote $OUT_MD using sample: $sample_base"
