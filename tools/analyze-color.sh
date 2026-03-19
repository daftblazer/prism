#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Analyze a video file for color metadata (color space, primaries, transfer,
# range, HDR10/HDR10+/Dolby Vision info) using ffprobe and mediainfo.

: "${SOURCE_FILE:=}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need ffprobe

have() { command -v "$1" >/dev/null 2>&1; }

# ── pretty helpers ──────────────────────────────────────────────────────────

primaries_pretty() {
  case "$1" in
    bt709)          echo "BT.709 (SDR)" ;;
    bt2020)         echo "BT.2020 (Wide Gamut / HDR)" ;;
    smpte170m)      echo "SMPTE 170M (NTSC)" ;;
    smpte240m)      echo "SMPTE 240M" ;;
    bt470bg)        echo "BT.470 BG (PAL)" ;;
    smpte431)       echo "DCI-P3 (Theater)" ;;
    smpte432)       echo "Display P3" ;;
    film)           echo "Film" ;;
    *)              echo "$1" ;;
  esac
}

transfer_pretty() {
  case "$1" in
    bt709)          echo "BT.709 (SDR gamma)" ;;
    smpte2084)      echo "PQ / SMPTE ST 2084 (HDR10)" ;;
    arib-std-b67)   echo "HLG (Hybrid Log-Gamma)" ;;
    smpte170m)      echo "SMPTE 170M" ;;
    smpte240m)      echo "SMPTE 240M" ;;
    linear)         echo "Linear" ;;
    iec61966-2-1)   echo "sRGB" ;;
    iec61966-2-4)   echo "IEC 61966-2-4" ;;
    bt2020-10)      echo "BT.2020 10-bit" ;;
    bt2020-12)      echo "BT.2020 12-bit" ;;
    *)              echo "$1" ;;
  esac
}

space_pretty() {
  case "$1" in
    bt709)          echo "BT.709" ;;
    bt2020nc)       echo "BT.2020 NCL (non-constant luminance)" ;;
    bt2020c)        echo "BT.2020 CL (constant luminance)" ;;
    smpte170m)      echo "SMPTE 170M" ;;
    smpte240m)      echo "SMPTE 240M" ;;
    ictcp)          echo "ICtCp" ;;
    *)              echo "$1" ;;
  esac
}

range_pretty() {
  case "$1" in
    tv)   echo "Limited (TV / 16-235)" ;;
    pc)   echo "Full (PC / 0-255)" ;;
    *)    echo "$1" ;;
  esac
}

hdr_type() {
  local transfer="$1" has_mdcv="$2" has_cll="$3" has_dovi="$4" has_hdr10plus="$5"

  local types=()
  if [[ "$has_dovi" == "yes" ]]; then
    types+=("Dolby Vision")
  fi
  if [[ "$has_hdr10plus" == "yes" ]]; then
    types+=("HDR10+")
  fi
  if [[ "$transfer" == "smpte2084" ]]; then
    if [[ "$has_mdcv" == "yes" || "$has_cll" == "yes" ]]; then
      types+=("HDR10")
    else
      types+=("PQ (no static metadata)")
    fi
  elif [[ "$transfer" == "arib-std-b67" ]]; then
    types+=("HLG")
  fi

  if [[ ${#types[@]} -eq 0 ]]; then
    echo "SDR"
  else
    local IFS=" + "
    echo "${types[*]}"
  fi
}

# ── per-file analysis ──────────────────────────────────────────────────────

analyze_file() {
  local file="$1"
  echo "═══════════════════════════════════════════════════════════════"
  echo "File: $(basename "$file")"
  echo "═══════════════════════════════════════════════════════════════"

  # Grab all video stream color fields via ffprobe JSON
  local probe
  probe="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,pix_fmt,width,height,bits_per_raw_sample,color_range,color_space,color_transfer,color_primaries \
    -show_entries stream_side_data \
    -of json "$file" 2>/dev/null)" || { echo "  ffprobe failed"; echo; return; }

  local codec profile pix_fmt width height bpc
  codec="$(echo "$probe"    | jq -r '.streams[0].codec_name // "unknown"')"
  profile="$(echo "$probe"  | jq -r '.streams[0].profile // "unknown"')"
  pix_fmt="$(echo "$probe"  | jq -r '.streams[0].pix_fmt // "unknown"')"
  width="$(echo "$probe"    | jq -r '.streams[0].width // "?"')"
  height="$(echo "$probe"   | jq -r '.streams[0].height // "?"')"
  bpc="$(echo "$probe"      | jq -r '.streams[0].bits_per_raw_sample // "unknown"')"

  local color_range color_space color_transfer color_primaries
  color_range="$(echo "$probe"      | jq -r '.streams[0].color_range // "unknown"')"
  color_space="$(echo "$probe"      | jq -r '.streams[0].color_space // "unknown"')"
  color_transfer="$(echo "$probe"   | jq -r '.streams[0].color_transfer // "unknown"')"
  color_primaries="$(echo "$probe"  | jq -r '.streams[0].color_primaries // "unknown"')"

  # Check for side data (mastering display, content light level, Dolby Vision, HDR10+)
  local has_mdcv="no" has_cll="no" has_dovi="no" has_hdr10plus="no"
  local mdcv_info="" cll_info=""

  local side_data_count
  side_data_count="$(echo "$probe" | jq '.streams[0].side_data_list // [] | length')"

  for (( i=0; i<side_data_count; i++ )); do
    local sd_type
    sd_type="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].side_data_type // \"\"")"
    case "$sd_type" in
      *"Mastering display"*)
        has_mdcv="yes"
        local r g b wp min_lum max_lum
        r="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].red_x // \"?\""),$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].red_y // \"?\"")"
        g="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].green_x // \"?\""),$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].green_y // \"?\"")"
        b="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].blue_x // \"?\""),$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].blue_y // \"?\"")"
        wp="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].white_point_x // \"?\""),$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].white_point_y // \"?\"")"
        min_lum="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].min_luminance // \"?\"")"
        max_lum="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].max_luminance // \"?\"")"
        mdcv_info="R($r) G($g) B($b) WP($wp) Lum($min_lum - $max_lum)"
        ;;
      *"Content light level"*)
        has_cll="yes"
        local max_content max_average
        max_content="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].max_content // \"?\"")"
        max_average="$(echo "$probe" | jq -r ".streams[0].side_data_list[$i].max_average // \"?\"")"
        cll_info="MaxCLL=$max_content, MaxFALL=$max_average"
        ;;
      *"Dolby Vision"*|*"DOVI"*)
        has_dovi="yes"
        ;;
    esac
  done

  # Use mediainfo for Dolby Vision detection if ffprobe didn't find it
  if [[ "$has_dovi" == "no" ]] && have mediainfo; then
    local mi_dovi
    mi_dovi="$(mediainfo "$file" | grep -i "HDR format.*Dolby Vision" 2>/dev/null || true)"
    [[ -n "$mi_dovi" ]] && has_dovi="yes"
  fi

  # Use mediainfo for HDR10+ detection
  if have mediainfo; then
    local mi_hdr10plus
    mi_hdr10plus="$(mediainfo "$file" | grep -i "HDR format.*HDR10+" 2>/dev/null || true)"
    [[ -n "$mi_hdr10plus" ]] && has_hdr10plus="yes"
  fi

  # ── output ───────────────────────────────────────────────────────────────
  echo ""
  echo "  Video Stream"
  echo "  ────────────────────────────────────────"
  printf "  %-26s %s\n" "Codec:"    "$codec ($profile)"
  printf "  %-26s %s\n" "Resolution:"  "${width}x${height}"
  printf "  %-26s %s\n" "Pixel Format:" "$pix_fmt"
  printf "  %-26s %s\n" "Bit Depth:" "$bpc"
  echo ""
  echo "  Color Metadata"
  echo "  ────────────────────────────────────────"
  printf "  %-26s %s\n" "Color Primaries:" "$(primaries_pretty "$color_primaries")"
  printf "  %-26s %s\n" "Transfer:"        "$(transfer_pretty "$color_transfer")"
  printf "  %-26s %s\n" "Color Space:"     "$(space_pretty "$color_space")"
  printf "  %-26s %s\n" "Color Range:"     "$(range_pretty "$color_range")"
  echo ""
  echo "  HDR Information"
  echo "  ────────────────────────────────────────"
  printf "  %-26s %s\n" "HDR Type:" "$(hdr_type "$color_transfer" "$has_mdcv" "$has_cll" "$has_dovi" "$has_hdr10plus")"

  if [[ "$has_mdcv" == "yes" ]]; then
    printf "  %-26s %s\n" "Mastering Display:" "$mdcv_info"
  fi
  if [[ "$has_cll" == "yes" ]]; then
    printf "  %-26s %s\n" "Content Light Level:" "$cll_info"
  fi
  if [[ "$has_dovi" == "yes" ]]; then
    printf "  %-26s %s\n" "Dolby Vision:" "Detected"
  fi

  echo ""
}

# ── main ───────────────────────────────────────────────────────────────────

if [[ -z "$SOURCE_FILE" ]]; then
  echo "No source file specified."
  exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "File not found: $SOURCE_FILE"
  exit 1
fi

echo "Analyzing color metadata for: $(basename "$SOURCE_FILE")"
echo ""
analyze_file "$SOURCE_FILE"
