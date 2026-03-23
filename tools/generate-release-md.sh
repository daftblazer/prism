#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate a release info markdown file using metadata from one sample MKV in Output.
# Usage:
#   ./10.generate_release_md.sh            # writes release.md
#   OUT_MD=my_release.md SAMPLE_FILE=Output/foo.mkv ./10.generate_release_md.sh
#
# Placeholders are left for anything we can't infer automatically (e.g., notes, screenshots).

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

# Extract show name and season from filename like "[ED3N] Show Name - S01E01 [BD]..."
show_name="Unknown Show"
season_num="1"
if [[ "$sample_base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[[:space:]]-[[:space:]]S([0-9]{2})E[0-9]{2} ]]; then
  show_name="${BASH_REMATCH[2]}"
  season_num="${BASH_REMATCH[3]}"
  # strip leading zeros
  season_num="$(echo "$season_num" | sed 's/^0*//')"
fi

# Read media info
media_json="$(mkvmerge -J "$SAMPLE_FILE")"

# Video info (first video track)
video_info="$(printf '%s' "$media_json" | jq -r '
  .tracks
  | map(select(.type=="video"))[0]
  | {
      codec: (.codec // .properties.codec_id // "AV1"),
      bit_depth: (.properties.bit_depth // 10),
      dims: (.properties.pixel_dimensions // "")
    }
')"
video_codec="$(jq -r '.codec' <<<"$video_info")"
video_bit="$(jq -r '.bit_depth' <<<"$video_info")"
video_dims="$(jq -r '.dims' <<<"$video_info")"
[[ -z "$video_dims" || "$video_dims" == "null" ]] && video_dims="1920×1080"

video_line="${video_codec:-AV1} ${video_bit:-10}-bit • ${video_dims}"

# Audio tracks list
audio_lines=()
while IFS=$'\t' read -r lang ch codec tname; do
  [[ -z "$lang" || "$lang" == "null" ]] && lang="English"
  [[ -z "$ch" || "$ch" == "null" ]] && ch="2.0"
  [[ -z "$codec" || "$codec" == "null" ]] && codec="Opus"
  display="$lang $ch ($codec)"
  # keep existing track_name if present
  [[ -n "$tname" && "$tname" != "null" ]] && display="$tname"
  audio_lines+=( "- ${display}" )
done < <(
  printf '%s' "$media_json" | jq -r '
    .tracks[]
    | select(.type=="audio")
    | [
        (.properties.language // "eng"),
        ((.properties.audio_channels // 2)|tostring),
        (.codec // .properties.codec_id // "Opus"),
        (.properties.track_name // "")
      ]
    | @tsv
  '
)

# Subtitle tracks list
sub_lines=()
while IFS=$'\t' read -r lang tname; do
  [[ -z "$lang" || "$lang" == "null" ]] && lang="English"
  display="$lang"
  [[ -n "$tname" && "$tname" != "null" ]] && display="$tname"
  sub_lines+=( "- ${display}" )
done < <(
  printf '%s' "$media_json" | jq -r '
    .tracks[]
    | select(.type=="subtitles"))
    | [
        (.properties.language // "eng"),
        (.properties.track_name // "")
      ]
    | @tsv
  ' 2>/dev/null || true
)

source_guess="TODO: Source"

cat > "$OUT_MD" <<EOF
# ${show_name} — Season ${season_num}

**Video:** ${video_line}  
**Encoded by:** ${RELEASE_GROUP:-Unknown}
**Source:** ${source_guess}

---

## Tracks

**Audio:**  
${audio_lines[*]:- - TODO: add audio tracks}

**Subtitles:**  
${sub_lines[*]:- - TODO: add subtitle tracks}

---

## Notes
- TODO: encoder settings / workflow
- TODO: special notes

---

## Screenshots

![Screenshot 1](TODO)

![Screenshot 2](TODO)

![Screenshot 3](TODO)

EOF

echo "Wrote $OUT_MD using sample: $sample_base"
