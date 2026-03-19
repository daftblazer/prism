#!/usr/bin/env bash
set -euo pipefail

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"       # work directly in Output
: "${OUTPUT_DIR:=$INPUT_DIR}"  # kept for compatibility; equal to INPUT_DIR
: "${TARGET_GLOB:=*.mkv}"

lang_pretty() {
  case "$1" in
    eng) echo "English" ;;
    jpn|jap) echo "Japanese" ;;
    spa) echo "Spanish" ;;
    fra|fre) echo "French" ;;
    deu|ger) echo "German" ;;
    ita) echo "Italian" ;;
    por) echo "Portuguese" ;;
    rus) echo "Russian" ;;
    kor) echo "Korean" ;;
    zho|chi) echo "Chinese" ;;
    *) echo "" ;;
  esac
}

channels_pretty() {
  case "${1:-}" in
    1) echo "1.0" ;;
    2) echo "2.0" ;;
    3) echo "2.1" ;;
    4) echo "4.0" ;;
    5) echo "5.0" ;;
    6) echo "5.1" ;;
    7) echo "6.1" ;;
    8) echo "7.1" ;;
    *) echo "?" ;;
  esac
}

codec_pretty() {
  local c="${1:-}"
  case "$c" in
    Opus|A_OPUS|opus) echo "Opus" ;;
    AAC|A_AAC|aac) echo "AAC" ;;
    FLAC|A_FLAC|flac) echo "FLAC" ;;
    AC-3|A_AC3|ac3) echo "AC-3" ;;
    E-AC-3|A_EAC3|eac3) echo "E-AC-3" ;;
    DTS|A_DTS|dts) echo "DTS" ;;
    TrueHD|A_TRUEHD|truehd) echo "TrueHD" ;;
    *) echo "$c" ;;
  esac
}

video_codec_pretty() {
  local c="${1:-}"
  case "$c" in
    V_MPEG4/ISO/AVC|AVC|H.264|AVC/H.264/MPEG-4p10|MPEG-4p10/AVC/H.264) echo "AVC" ;;
    V_MPEGH/ISO/HEVC|HEVC|H.265) echo "HEVC" ;;
    V_MS/VFW/FOURCC/WMVA|V_MS/VFW/FOURCC/WMV3|VC-1) echo "VC-1" ;;
    V_MPEG1|V_MPEG2|MPEG-2) echo "MPEG-2" ;;
    *) echo "$c" ;;
  esac
}

res_from_dimensions() {
  local pixels="$1" display="$2" raw_height="$3" height=""

  if [[ "$pixels" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    height="${BASH_REMATCH[2]}"
  elif [[ "$display" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    height="${BASH_REMATCH[2]}"
  elif [[ -n "$raw_height" ]]; then
    height="$raw_height"
  fi

  [[ -n "$height" ]] && printf '%sp' "$height"
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need_cmd mkvmerge
need_cmd mkvpropedit
need_cmd jq
need_cmd mkvinfo

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory '$INPUT_DIR' not found" >&2
  exit 1
fi

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB found in $INPUT_DIR"
  exit 0
fi

for src in "${files[@]}"; do
  raw_base="$(basename "$src")"
  ext="${raw_base##*.}"
  name_no_ext="${raw_base%.*}"
  # Keep filename in place; only edit metadata.
  dest="$src"
  target_file="$dest"

  echo "==> $raw_base (in place; no copy)"

  # Derive a clean title like "Show Name - S01E01"
  if [[ "$raw_base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[[:space:]]-[[:space:]](S[0-9]{2}E[0-9]{2}) ]]; then
    show_title="${BASH_REMATCH[2]}"
    ep_title="${BASH_REMATCH[3]}"
    # trim surrounding spaces from show title
    show_title="$(printf '%s' "$show_title" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    title_value="${show_title} - ${ep_title}"
  elif [[ "$raw_base" =~ ^(\[[^]]+\][[:space:]]*)?(.+?)[._[:space:]-]+(S[0-9]{2}E[0-9]{2}) ]]; then
    show_title="${BASH_REMATCH[2]}"
    ep_title="${BASH_REMATCH[3]}"
    show_title="$(printf '%s' "$show_title" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    title_value="${show_title} - ${ep_title}"
  else
    title_value="${name_no_ext}"
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    mkvpropedit "$dest" --edit info --set "title=$title_value"
  else
    echo "  [dry-run] set title='$title_value' on '$target_file'"
  fi

  media_json="$(mkvmerge -J "$target_file")"

  # Video track naming (first video track only)
  mapfile -t video_lines < <(
    printf '%s' "$media_json" | jq -r '
      .tracks[]
      | select(.type=="video")
      | [
          (.codec // ""),
          (.properties.codec_id // ""),
          (.properties.pixel_dimensions // ""),
          (.properties.display_dimensions // ""),
          ((.properties.pixel_height // "")|tostring)
        ]
      | @tsv
    ' | head -n1
  )

  if [[ ${#video_lines[@]} -gt 0 ]]; then
    IFS=$'\t' read -r v_codec v_codec_id v_pixels v_display v_height <<<"${video_lines[0]}"
    vc="$v_codec"
    [[ -z "$vc" ]] && vc="$v_codec_id"
    pretty_vcodec="$(video_codec_pretty "$vc")"
    res="$(res_from_dimensions "$v_pixels" "$v_display" "$v_height")"
    if [[ -n "${VIDEO_NAME:-}" ]]; then
      video_name="$VIDEO_NAME"
    else
      video_name="${RELEASE_GROUP:+${RELEASE_GROUP} }AV1"
    fi

    echo "  track:v1 codec='${vc:-unknown}' res='${res:-?}' -> '${video_name}'"

    if [[ "$DRY_RUN" -eq 0 ]]; then
      mkvpropedit "$dest" \
        --edit track:v1 \
        --set "name=${video_name}"
    fi
  else
    echo "  (no video tracks found?)"
  fi

  mapfile -t audio_lines < <(
    printf '%s' "$media_json" | jq -r '
      .tracks[]
      | select(.type=="audio")
      | [
          (.properties.language // ""),
          (.codec // ""),
          (.properties.codec_id // ""),
          ((.properties.audio_channels // "")|tostring),
          (.properties.track_name // "")
        ]
      | @tsv
    '
  )

  if [[ ${#audio_lines[@]} -eq 0 ]]; then
    echo "  (no audio tracks found)"
  else
    idx=0
    for line in "${audio_lines[@]}"; do
      idx=$((idx+1))
      IFS=$'\t' read -r lang codec codec_id channels track_name <<<"$line"

      pretty_lang="$(lang_pretty "$lang")"
      [[ -z "$pretty_lang" ]] && pretty_lang="${lang:-Unknown}"

      pretty_ch="$(channels_pretty "$channels")"

      c="${codec:-}"
      [[ -z "$c" ]] && c="$codec_id"
      pretty_codec="$(codec_pretty "$c")"
      [[ -z "$pretty_codec" ]] && pretty_codec="Audio"

      is_commentary=0
      [[ "$track_name" =~ [Cc]ommentary ]] && is_commentary=1

      if [[ "$is_commentary" -eq 1 ]]; then
        new_name="${pretty_lang} Commentary (${pretty_codec})"
      else
        new_name="${pretty_lang} ${pretty_ch} (${pretty_codec})"
      fi

      echo "  track:a${idx} lang='${lang:-none}' ch='${channels:-none}' codec='${codec:-none}' name='${track_name:-}' -> '${new_name}'"

      if [[ "$DRY_RUN" -eq 0 ]]; then
        mkvpropedit "$dest" \
          --edit "track:a${idx}" \
          --set "language=${lang:-und}" \
          --set "name=${new_name}"
      fi
    done
  fi

  echo
done
