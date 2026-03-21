#!/usr/bin/env bash
set -euo pipefail

# Encode a single MKV file to AV1 using a specified encoder and parameters.

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --input PATH         Input MKV file (required)
  --output-dir PATH    Output directory (required)
  --encoder PATH       Path to the encoder binary or wrapper (required)
  --crf N              CRF value (default: 18)
  --preset N           Preset value (default: 4)
  --tune N             Tune value (default: 0)
  --keyint N           Keyint value (default: -2)
  --auto-crop 0|1      Enable/disable auto-crop (default: 1)
  --crop "W:H:X:Y"     Manual crop (overrides auto-crop if provided)
  --rename-audio 0|1   Rename audio tracks with pretty names (default: 0)
  --custom-flags "..." Extra encoder flags
  --overwrite 0|1      Overwrite existing output (default: 0)
  -h, --help           Show help
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Required tool '$1' not found in PATH." >&2
    exit 1
  fi
}

need_cmd ffmpeg
need_cmd ffprobe
need_cmd mkvmerge
need_cmd python3

INPUT=""
OUTPUT_DIR=""
ENCODER=""
CRF=18
PRESET=4
TUNE=0
KEYINT="-2"
AUTO_CROP=1
MANUAL_CROP=""
RENAME_AUDIO=0
CUSTOM_FLAGS=""
OVERWRITE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input) INPUT="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --encoder) ENCODER="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --tune) TUNE="$2"; shift 2 ;;
    --keyint) KEYINT="$2"; shift 2 ;;
    --auto-crop) AUTO_CROP="$2"; shift 2 ;;
    --crop) MANUAL_CROP="$2"; shift 2 ;;
    --rename-audio) RENAME_AUDIO="$2"; shift 2 ;;
    --custom-flags) CUSTOM_FLAGS="$2"; shift 2 ;;
    --overwrite) OVERWRITE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

if [[ -z "$INPUT" || -z "$OUTPUT_DIR" || -z "$ENCODER" ]]; then
  echo "Error: --input, --output-dir, and --encoder are required."
  usage
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Error: Input file '$INPUT' does not exist."
  exit 1
fi

if [[ ! -x "$ENCODER" ]]; then
  echo "Error: Encoder '$ENCODER' does not exist or is not executable."
  exit 1
fi

BASENAME="$(basename "$INPUT" .mkv)"
OUT_MKV="$OUTPUT_DIR/$BASENAME.mkv"

if [[ -f "$OUT_MKV" && "$OVERWRITE" -ne 1 ]]; then
  echo "⏭️  Skipping (already exists): $OUT_MKV"
  exit 0
fi

mkdir -p "$OUTPUT_DIR"
# Use a unique work dir to allow parallel encodes without collisions
WORK_DIR="$(mktemp -d "$OUTPUT_DIR/.work-${BASENAME}-XXXXXX")"
TMP_AV1="$WORK_DIR/video.av1"
TMP_LOG="$WORK_DIR/encode.log"
TMP_AUDIO_SUMMARY="$WORK_DIR/audio_plan.txt"
TMP_AUDIO_DIR="$WORK_DIR/audio_tracks"
TMP_TAGS="$WORK_DIR/tags.xml"

cleanup() {
  local exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    rm -rf "$WORK_DIR"
  else
    echo "⚠️  Encode failed or interrupted. Work directory preserved: $WORK_DIR"
  fi
}
trap cleanup EXIT

# --- Helper functions (Python-based for reliability) ---

audio_plan_for_file() {
  local input="$1"
  python3 - "$input" <<'PY'
import json, subprocess, sys
input_path = sys.argv[1]
try:
    probe = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-select_streams", "a", input_path], capture_output=True, text=True, check=True)
    data = json.loads(probe.stdout or "{}")
except Exception as e:
    print(f"Error probing audio: {e}", file=sys.stderr)
    sys.exit(1)

streams = data.get("streams", [])
LOSSLESS = {"flac","truehd","mlp","alac","wavpack","ape","tta","pcm_s16le","pcm_s16be","pcm_s24le","pcm_s24be","pcm_s32le","pcm_s32be","pcm_f32le","pcm_f32be","pcm_f64le","pcm_f64be","pcm_u8","pcm_u16le","pcm_u16be","pcm_u24le","pcm_u24be","pcm_u32le","pcm_u32be"}

def bitrate_for(ch):
  if ch <= 2: return "128k"
  if ch == 6: return "256k"
  return "320k" if ch > 6 else "192k"

def channel_label(ch):
  labels = {1:"1.0", 2:"2.0", 3:"2.1", 4:"4.0", 5:"5.0", 6:"5.1", 7:"6.1", 8:"7.1"}
  return labels.get(ch, f"{ch}.0")

LANG_NAMES = {"en":"English","eng":"English","fr":"French","fre":"French","fra":"French","es":"Spanish","spa":"Spanish","de":"German","ger":"German","deu":"German","it":"Italian","ita":"Italian","pt":"Portuguese","por":"Portuguese","ru":"Russian","rus":"Russian","ja":"Japanese","jpn":"Japanese"}

def language_label(s):
  raw = (s.get("tags", {}).get("language") or "und").strip().lower()
  return LANG_NAMES.get(raw, raw.upper() if raw != "und" else "Unknown")

def codec_label(codec, encoded_to_opus):
  if encoded_to_opus: return "Opus"
  return {"ac3":"AC3","eac3":"EAC3","aac":"AAC","mp3":"MP3","opus":"Opus","vorbis":"Vorbis","dts":"DTS","truehd":"TrueHD","flac":"FLAC","alac":"ALAC"}.get(codec, codec.upper() if codec else "Audio")

def is_dts_hd_ma(s):
  profile = (s.get("profile") or "").lower()
  return "dts-hd" in profile and ("ma" in profile or "master" in profile)

lines, summary = [], []
for out_idx, s in enumerate(streams):
  codec = (s.get("codec_name") or "").lower()
  ch = int(s.get("channels") or 2)
  should_encode = (codec in LOSSLESS) or (codec == "dts" and is_dts_hd_ma(s))
  mode, bitrate = ("encode", bitrate_for(ch)) if should_encode else ("copy", "-")
  out_codec = codec_label(codec, should_encode)
  summary.append(f"a:{out_idx} {codec} {ch}ch -> {mode} ({out_codec})")
  lang = (s.get("tags", {}).get("language") or "und").strip().lower()
  title = f"{language_label(s)} {channel_label(ch)} ({out_codec})"
  layout = (s.get("channel_layout") or "").strip().lower() or "unknown"
  lines.append(f"PLAN|{out_idx}|{mode}|{bitrate}|{lang}|{title}|{layout}")

for line in lines: print(line)
print("\n".join(summary or ["no audio tracks"]), file=sys.stderr)
PY
}

detect_vertical_crop_for_file() {
  local input="$1"
  python3 - "$input" <<'PY'
import collections, json, re, subprocess, sys
input_path = sys.argv[1]
try:
    probe = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-select_streams", "v:0", input_path], capture_output=True, text=True, check=True)
    probe_data = json.loads(probe.stdout or "{}")
except:
    sys.exit(0)

streams = probe_data.get("streams") or [{}]
in_h = int(streams[0].get("height") or 0)
if in_h <= 0: sys.exit(0)

# Scan a few points to be more robust
crop_counts = collections.Counter()
for ss in ["60", "300", "600"]:
    scan = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "info", "-ss", ss, "-i", input_path, "-map", "0:v:0", "-vf", "cropdetect=limit=0.08:round=2:reset=0", "-frames:v", "60", "-f", "null", "-"], capture_output=True, text=True)
    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", (scan.stderr or ""))
    if matches:
        crop_counts.update(matches)

if crop_counts:
  best = crop_counts.most_common(1)[0][0]
  w, h, x, y = map(int, best)
  if h > 0 and y >= 0 and (y + h) <= in_h and not (y == 0 and h == in_h):
    print(f"crop={w}:{h}:{x}:{y}", end="")
PY
}

detect_color_metadata_for_file() {
  local input="$1"
  python3 - "$input" <<'PY'
import json, subprocess, sys

input_path = sys.argv[1]
try:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_streams", "-select_streams", "v:0", input_path],
        capture_output=True, text=True, check=True)
    streams = json.loads(probe.stdout or "{}").get("streams") or [{}]
except:
    streams = [{}]

s = streams[0]

primaries = s.get("color_primaries", "unknown")
transfer = s.get("color_transfer", "unknown")
space = s.get("color_space", "unknown")
color_range = s.get("color_range", "unknown")

# Map ffprobe names to SVT-AV1 integer codes
PRIMARIES_MAP = {"bt709": 1, "bt470m": 4, "bt470bg": 5, "smpte170m": 6, "smpte240m": 7, "film": 8, "bt2020": 9, "smpte428": 10, "smpte431": 11, "smpte432": 12, "jedec-p22": 22}
TRANSFER_MAP = {"bt709": 1, "bt470m": 4, "bt470bg": 5, "smpte170m": 6, "smpte240m": 7, "linear": 8, "log100": 9, "log316": 10, "iec61966-2-4": 11, "bt1361e": 12, "iec61966-2-1": 13, "bt2020-10": 14, "bt2020-12": 15, "smpte2084": 16, "smpte428": 17, "arib-std-b67": 18}
MATRIX_MAP = {"rgb": 0, "bt709": 1, "fcc": 4, "bt470bg": 5, "smpte170m": 6, "smpte240m": 7, "ycgco": 8, "bt2020nc": 9, "bt2020c": 10, "smpte2085": 11, "chroma-derived-nc": 12, "chroma-derived-c": 13, "ictcp": 14}
RANGE_MAP = {"tv": 0, "pc": 1}

cp = PRIMARIES_MAP.get(primaries, 1)
tc = TRANSFER_MAP.get(transfer, 1)
mc = MATRIX_MAP.get(space, 1)
cr = RANGE_MAP.get(color_range, 0)

print(f"COLOR_PRIMARIES={cp}")
print(f"TRANSFER_CHARS={tc}")
print(f"MATRIX_COEFFS={mc}")
print(f"COLOR_RANGE={cr}")
PY
}

detect_source_fps_for_file() {
  local input="$1"
  python3 - "$input" <<'PY'
import json, subprocess, sys
input_path = sys.argv[1]
try:
    probe = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-select_streams", "v:0", input_path], capture_output=True, text=True, check=True)
    streams = json.loads(probe.stdout or "{}").get("streams") or [{}]
except:
    sys.exit(0)
s = streams[0]
avg, r = s.get("avg_frame_rate", ""), s.get("r_frame_rate", "")
def valid(rate):
  if not rate or rate in {"0/0", "N/A"}: return False
  p = rate.split("/")
  return len(p) == 2 and int(p[0]) > 0 and int(p[1]) > 0
chosen = avg if valid(avg) else (r if valid(r) else "")
print(chosen, end="")
PY
}

echo "🎬 Input : $INPUT"
echo "➡️  Output: $OUT_MKV"

VIDEO_FILTER=""
if [[ -n "$MANUAL_CROP" ]]; then
  VIDEO_FILTER="crop=$MANUAL_CROP"
  echo "==> Manual crop: $VIDEO_FILTER"
elif [[ "$AUTO_CROP" -eq 1 ]]; then
  VIDEO_FILTER="$(detect_vertical_crop_for_file "$INPUT")"
  [[ -n "$VIDEO_FILTER" ]] && echo "==> Auto-crop: $VIDEO_FILTER" || echo "==> Auto-crop: none"
fi

VIDEO_FPS="$(detect_source_fps_for_file "$INPUT")"
echo "==> Source FPS: $VIDEO_FPS"

# Detect color metadata
COLOR_PRIMARIES=1
TRANSFER_CHARS=1
MATRIX_COEFFS=1
COLOR_RANGE=0
echo "==> Detecting color metadata..."
while IFS='=' read -r key value; do
  export "$key=$value"
done < <(detect_color_metadata_for_file "$INPUT")
echo "==> Color: primaries=$COLOR_PRIMARIES transfer=$TRANSFER_CHARS matrix=$MATRIX_COEFFS range=$COLOR_RANGE"

# 1) Encode video
echo "==> Encoding video (CRF=$CRF, preset=$PRESET, tune=$TUNE) ..."
rm -f "$TMP_AV1" "$TMP_LOG"
mkdir -p "$TMP_AUDIO_DIR"

(
  ffmpeg_cmd=(ffmpeg -hide_banner -loglevel error -i "$INPUT" -map "0:v:0")
  [[ -n "$VIDEO_FILTER" ]] && ffmpeg_cmd+=(-vf "$VIDEO_FILTER")
  ffmpeg_cmd+=(-pix_fmt yuv420p10le -strict -1 -f yuv4mpegpipe -)

  read -r -a custom_flags_arr <<< "$CUSTOM_FLAGS"

  "${ffmpeg_cmd[@]}" \
  | "$ENCODER" \
    -i stdin \
    -b "$TMP_AV1" \
    --crf "$CRF" \
    --preset "$PRESET" \
    --tune "$TUNE" \
    --keyint "$KEYINT" \
    --color-primaries "$COLOR_PRIMARIES" \
    --transfer-characteristics "$TRANSFER_CHARS" \
    --matrix-coefficients "$MATRIX_COEFFS" \
    --color-range "$COLOR_RANGE" \
    --progress 2 \
    "${custom_flags_arr[@]}"
) 2>&1 | tee "$TMP_LOG"

if [[ ! -s "$TMP_AV1" ]]; then
  echo "❌ Video encode failed: $TMP_AV1"
  exit 1
fi

# 2) Plan audio
mapfile -t AUDIO_PLAN_ARR < <(audio_plan_for_file "$INPUT" 2> >(tee "$TMP_AUDIO_SUMMARY" >&2))

if [[ ${#AUDIO_PLAN_ARR[@]} -eq 0 ]]; then
  echo "⚠️  No audio tracks detected or audio planning failed."
fi

# 3) Render audio tracks
TMP_AUDIO_INPUTS=()
TMP_AUDIO_LANGS=()
TMP_AUDIO_TITLES=()
for plan in "${AUDIO_PLAN_ARR[@]}"; do
  IFS='|' read -r tag aidx mode bitrate lang title layout <<< "$plan"
  [[ "$tag" == "PLAN" ]] || continue
  tmp_track="$TMP_AUDIO_DIR/a${aidx}.mka"
  mkdir -p "$(dirname "$tmp_track")"
  meta_args=(-metadata:s:a:0 "language=$lang")
  if [[ "$RENAME_AUDIO" -eq 1 ]]; then
    meta_args+=(-metadata:s:a:0 "title=$title")
  fi
  if [[ "$mode" == "encode" ]]; then
    af=""
    [[ "$layout" == "5.1(side)" ]] && af="channelmap=channel_layout=5.1"
    [[ "$layout" == "7.1(side)" ]] && af="channelmap=channel_layout=7.1"
    cmd=(ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -map "0:a:${aidx}")
    [[ -n "$af" ]] && cmd+=(-af "$af")
    cmd+=(-c:a libopus -b:a "$bitrate" -mapping_family:a 1 -compression_level:a 10 -vbr:a on "${meta_args[@]}" "$tmp_track")
    "${cmd[@]}"
  else
    ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -map "0:a:${aidx}" -c copy "${meta_args[@]}" "$tmp_track"
  fi
  TMP_AUDIO_INPUTS+=("$tmp_track")
  TMP_AUDIO_LANGS+=("$lang")
  TMP_AUDIO_TITLES+=("$title")
done

# 4) Build encoding settings tag
ENCODER_VERSION="$("$ENCODER" 2>&1 | head -1 || echo "unknown")"
ENCODER_NAME="$(basename "$(dirname "$(dirname "$ENCODER")")")"

SETTINGS_PARTS=()
SETTINGS_PARTS+=("prism / ${ENCODER_NAME}")
SETTINGS_PARTS+=("${ENCODER_VERSION}")
SETTINGS_PARTS+=("--crf ${CRF} --preset ${PRESET} --tune ${TUNE} --keyint ${KEYINT}")
if [[ -n "$CUSTOM_FLAGS" ]]; then
  SETTINGS_PARTS+=("${CUSTOM_FLAGS}")
fi
if [[ -n "$VIDEO_FILTER" ]]; then
  SETTINGS_PARTS+=("crop: ${VIDEO_FILTER#crop=}")
fi
SETTINGS_PARTS+=("color: primaries=${COLOR_PRIMARIES} transfer=${TRANSFER_CHARS} matrix=${MATRIX_COEFFS} range=${COLOR_RANGE}")

ENCODING_SETTINGS="$(IFS=' | '; echo "${SETTINGS_PARTS[*]}")"

cat > "$TMP_TAGS" <<XMLEOF
<?xml version="1.0" encoding="UTF-8"?>
<Tags>
  <Tag>
    <Targets/>
    <Simple>
      <Name>ENCODING_SETTINGS</Name>
      <String>${ENCODING_SETTINGS}</String>
    </Simple>
  </Tag>
</Tags>
XMLEOF

# 5) Final mux
mkvmerge_args=(-o "$OUT_MKV" --title "$BASENAME" --global-tags "$TMP_TAGS")
if [[ -n "$VIDEO_FPS" ]]; then
  mkvmerge_args+=(--default-duration "0:${VIDEO_FPS}fps")
fi
mkvmerge_args+=(--track-name "0:AV1 Encode" "$TMP_AV1" --no-video --no-audio "$INPUT")

for i in "${!TMP_AUDIO_INPUTS[@]}"; do
  df="no"
  [[ "$i" -eq 0 ]] && df="yes"
  mkvmerge_args+=(--language "0:${TMP_AUDIO_LANGS[$i]}")
  [[ "$RENAME_AUDIO" -eq 1 ]] && mkvmerge_args+=(--track-name "0:${TMP_AUDIO_TITLES[$i]}")
  mkvmerge_args+=(--default-track-flag "0:${df}" "${TMP_AUDIO_INPUTS[$i]}")
done

echo "==> Muxing final MKV..."
mkvmerge "${mkvmerge_args[@]}"

echo "✅ Done: $OUT_MKV"

